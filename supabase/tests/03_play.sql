\set ON_ERROR_STOP on
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000002', false) \gset
-- ^ acting as the SCOREKEEPER, not an admin: score entry must work for them.

do $$
declare m record; guard int := 0;
begin
  loop
    select * into m from matches
     where status <> 'final' and home_team_id is not null and away_team_id is not null
     order by division_id, bracket, round, slot
     limit 1;
    exit when not found or guard > 300;
    guard := guard + 1;
    -- The better seed (lower uuid suffix) always wins.
    if m.home_team_id < m.away_team_id then
      perform submit_match_score(m.id, '[{"home":25,"away":20},{"home":25,"away":20}]'::jsonb);
    else
      perform submit_match_score(m.id, '[{"home":20,"away":25},{"home":20,"away":25}]'::jsonb);
    end if;
  end loop;
  raise notice 'played % matches', guard;
end $$;

select 'TEST all-matches-resolved: ' ||
  case when (select count(*) from matches where status <> 'final') = 0
  then 'PASS' else 'FAIL (' || (select count(*) from matches where status <> 'final') || ' stuck)' end;

select 'TEST D8-champion-is-seed-1: ' ||
  case when (select t.bracket_seed from matches m join teams t on t.id = m.winner_team_id
             where m.division_id='11111111-1111-4111-8111-111111111111' and m.label='Final') = 1
  then 'PASS' else 'FAIL' end;

select 'TEST D5-champion-is-seed-1 (via byes): ' ||
  case when (select t.bracket_seed from matches m join teams t on t.id = m.winner_team_id
             where m.division_id='22222222-2222-4222-8222-222222222222' and m.label='Final') = 1
  then 'PASS' else 'FAIL' end;

select 'TEST D6-grand-final-is-1-vs-2: ' ||
  case when (select th.bracket_seed || 'v' || ta.bracket_seed
             from matches m join teams th on th.id=m.home_team_id join teams ta on ta.id=m.away_team_id
             where m.bracket='grand_final') = '1v2'
  then 'PASS' else 'FAIL: ' || (select coalesce(th.bracket_seed::text,'?') || 'v' || coalesce(ta.bracket_seed::text,'?')
             from matches m left join teams th on th.id=m.home_team_id left join teams ta on ta.id=m.away_team_id
             where m.bracket='grand_final') end;

select 'TEST no-team-plays-itself: ' ||
  case when (select count(*) from matches where home_team_id = away_team_id) = 0
  then 'PASS' else 'FAIL' end;

select 'TEST every-slot-filled: ' ||
  case when (select count(*) from matches where not is_bye and (home_team_id is null or away_team_id is null)) = 0
  then 'PASS' else 'FAIL' end;
