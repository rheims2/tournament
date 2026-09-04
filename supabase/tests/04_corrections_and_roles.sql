\set ON_ERROR_STOP on
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000002', false);

-- A scorekeeper corrects a semifinal: seed 4 beat seed 1 after all.
\set D8 '11111111-1111-4111-8111-111111111111'

select id as sf_id, home_team_id as sf_home, away_team_id as sf_away
  from matches where division_id = :'D8' and label = 'Semifinal 1' \gset

select 'BEFORE  final contenders: ' ||
  (select coalesce(th.bracket_seed::text,'-') || ' vs ' || coalesce(ta.bracket_seed::text,'-')
     from matches m left join teams th on th.id=m.home_team_id left join teams ta on ta.id=m.away_team_id
    where m.division_id = :'D8' and m.label='Final');

-- Flip it: the away side now wins the semifinal.
select submit_match_score(:'sf_id', '[{"home":20,"away":25},{"home":20,"away":25}]'::jsonb) is not null as ok;

select 'TEST correction-replaces-finalist: ' ||
  case when (select home_team_id from matches where division_id = :'D8' and label='Final') = :'sf_away'
  then 'PASS' else 'FAIL' end;

select 'TEST correction-resets-downstream-result: ' ||
  case when (select status from matches where division_id = :'D8' and label='Final') <> 'final'
   and  (select count(*) from match_sets s join matches m on m.id=s.match_id
          where m.division_id = :'D8' and m.label='Final') = 0
  then 'PASS' else 'FAIL' end;

select 'TEST correction-keeps-other-semi: ' ||
  case when (select away_team_id from matches where division_id = :'D8' and label='Final') is not null
  then 'PASS' else 'FAIL' end;

-- Only one set entered: the match stays live rather than finalizing.
select submit_match_score(:'sf_id', '[{"home":25,"away":20}]'::jsonb);
select 'TEST partial-score-stays-live: ' ||
  case when (select status from matches where id = :'sf_id') = 'in_progress'
   and (select home_team_id from matches where division_id = :'D8' and label='Final') is null
  then 'PASS' else 'FAIL: ' || (select status from matches where id = :'sf_id') end;

-- ---- permissions -------------------------------------------------------
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000003', false);
do $$
begin
  perform submit_match_score(
    (select id from matches where label='Semifinal 1' and division_id='11111111-1111-4111-8111-111111111111'),
    '[{"home":25,"away":1},{"home":25,"away":1}]'::jsonb);
  raise notice 'TEST viewer-cannot-score: FAIL (no error raised)';
exception when insufficient_privilege then
  raise notice 'TEST viewer-cannot-score: PASS';
end $$;

-- Scorekeepers must not be able to reopen a match (admin only).
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000002', false);
do $$
begin
  perform reopen_match((select id from matches where label='Semifinal 1' and division_id='11111111-1111-4111-8111-111111111111'));
  raise notice 'TEST scorekeeper-cannot-reopen: FAIL (no error raised)';
exception when insufficient_privilege then
  raise notice 'TEST scorekeeper-cannot-reopen: PASS';
end $$;

do $$
begin
  perform set_user_role('aaaaaaaa-0000-4000-8000-000000000003', 'admin');
  raise notice 'TEST scorekeeper-cannot-grant-roles: FAIL (no error raised)';
exception when insufficient_privilege then
  raise notice 'TEST scorekeeper-cannot-grant-roles: PASS';
end $$;

-- Row level security: a scorekeeper must not be able to edit teams directly.
set role authenticated;
do $$
begin
  update teams set name = 'Hacked' where bracket_seed = 1;
  if found then
    raise notice 'TEST rls-blocks-scorekeeper-writes: FAIL (update applied)';
  else
    raise notice 'TEST rls-blocks-scorekeeper-writes: PASS';
  end if;
exception when insufficient_privilege then
  raise notice 'TEST rls-blocks-scorekeeper-writes: PASS';
end $$;

do $$
declare n int;
begin
  select count(*) into n from matches;
  raise notice 'TEST authenticated-can-read: % (% matches)', case when n > 0 then 'PASS' else 'FAIL' end, n;
end $$;
reset role;

-- Anonymous spectators can read everything.
set role anon;
do $$
declare n int;
begin
  select count(*) into n from matches;
  raise notice 'TEST anon-can-read: % (% matches)', case when n > 0 then 'PASS' else 'FAIL' end, n;
end $$;
do $$
begin
  insert into tournaments (name) values ('anon injection');
  raise notice 'TEST anon-cannot-write: FAIL';
exception when insufficient_privilege then raise notice 'TEST anon-cannot-write: PASS';
end $$;
reset role;

-- The last admin cannot demote themselves and lock everyone out.
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
do $$
begin
  perform set_user_role('aaaaaaaa-0000-4000-8000-000000000001', 'viewer');
  raise notice 'TEST last-admin-protected: FAIL';
exception when others then raise notice 'TEST last-admin-protected: PASS (%)', sqlerrm;
end $$;

-- Admin can reopen and it cascades.
select reopen_match((select id from matches where label='Semifinal 1' and division_id='11111111-1111-4111-8111-111111111111'));
select 'TEST admin-reopen-clears: ' ||
  case when (select status from matches where label='Semifinal 1' and division_id='11111111-1111-4111-8111-111111111111') = 'scheduled'
  then 'PASS' else 'FAIL' end;
