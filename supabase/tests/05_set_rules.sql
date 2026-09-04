\set ON_ERROR_STOP on
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000002', false);

-- Use a fresh, unplayed pool-style match in the 8-team division.
insert into pools (id, division_id, name, position)
values ('99999999-9999-4999-8999-999999999999','11111111-1111-4111-8111-111111111111','Z',9);

insert into matches (id, division_id, phase, pool_id, round, slot, label, best_of, home_team_id, away_team_id)
values ('99999999-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','pool',
        '99999999-9999-4999-8999-999999999999',1,0,'Rules Test',3,
        '11111111-1111-4111-8111-000000000001','11111111-1111-4111-8111-000000000002');

\set M '99999999-0000-4000-8000-000000000001'

-- 25-21 then a live 14-12: one completed set, match stays in progress.
select submit_match_score(:'M', '[{"home":25,"away":21},{"home":14,"away":12}]'::jsonb, true);
select 'TEST live-set-does-not-finalize: ' ||
  case when (select status from matches where id = :'M') = 'in_progress'
   and  (select home_sets_won || '-' || away_sets_won from matches where id = :'M') = '1-0'
  then 'PASS' else 'FAIL: ' || (select status || ' ' || home_sets_won || '-' || away_sets_won from matches where id = :'M') end;

-- 25-24 does not clear the win-by-2 margin.
select submit_match_score(:'M', '[{"home":25,"away":24}]'::jsonb, true);
select 'TEST win-by-two-enforced: ' ||
  case when (select home_sets_won from matches where id = :'M') = 0
  then 'PASS' else 'FAIL' end;

select submit_match_score(:'M', '[{"home":26,"away":24}]'::jsonb, true);
select 'TEST extended-set-counts: ' ||
  case when (select home_sets_won from matches where id = :'M') = 1
  then 'PASS' else 'FAIL' end;

-- The deciding set is played to 15, not 25.
select submit_match_score(:'M', '[{"home":25,"away":21},{"home":19,"away":25},{"home":15,"away":12}]'::jsonb, true);
select 'TEST deciding-set-target-15: ' ||
  case when (select status || ' ' || home_sets_won || '-' || away_sets_won from matches where id = :'M') = 'final 2-1'
  then 'PASS' else 'FAIL: ' || (select status || ' ' || home_sets_won || '-' || away_sets_won from matches where id = :'M') end;

-- An unfinished set before the clinching one is rejected outright.
do $$
begin
  perform submit_match_score('99999999-0000-4000-8000-000000000001',
    '[{"home":25,"away":21},{"home":14,"away":12},{"home":25,"away":19}]'::jsonb, true);
  raise notice 'TEST rejects-unfinished-middle-set: FAIL (accepted)';
exception when others then
  raise notice 'TEST rejects-unfinished-middle-set: PASS (%)', sqlerrm;
end $$;

-- A set entered after the match was already won is discarded.
select submit_match_score(:'M', '[{"home":25,"away":21},{"home":25,"away":19},{"home":7,"away":5}]'::jsonb, true);
select 'TEST discards-surplus-set: ' ||
  case when (select count(*) from match_sets where match_id = :'M') = 2
   and  (select status from matches where id = :'M') = 'final'
  then 'PASS' else 'FAIL: ' || (select count(*) from match_sets where match_id = :'M') || ' sets' end;

-- Standings must never see a partial set: every stored set of a final match
-- is a completed one.
select 'TEST final-matches-store-only-complete-sets: ' ||
  case when (select count(*) from match_sets s join matches m on m.id = s.match_id
             join divisions d on d.id = m.division_id
             where m.status = 'final'
               and not public.is_set_complete(s.home_score, s.away_score, s.set_number, m.best_of,
                                              d.points_to_win, d.deciding_set_points, d.win_by, d.point_cap)) = 0
  then 'PASS' else 'FAIL' end;
