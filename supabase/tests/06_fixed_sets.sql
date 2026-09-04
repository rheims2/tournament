\set ON_ERROR_STOP on
-- Fixed-set pool play: every set is played, an even count can draw, and the
-- set count follows the pool size.
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);

insert into tournaments (id, name) values ('eeeeeeee-0000-4000-8000-00000000eeee', 'Fixed Cup');
insert into divisions (id, tournament_id, name, pool_scoring_mode, pool_points_to_win, pool_start_score)
values ('ffffffff-1111-4111-8111-111111111111','eeeeeeee-0000-4000-8000-00000000eeee',
        'Fixed Div','fixed_sets',25,4);

select 'TEST fixed-defaults-applied: ' ||
  case when (select pool_sets_by_size ->> '4' from divisions where id='ffffffff-1111-4111-8111-111111111111') = '2'
   and  (select pool_sets_by_size ->> '3' from divisions where id='ffffffff-1111-4111-8111-111111111111') = '3'
  then 'PASS' else 'FAIL' end;

insert into pools (id, division_id, name, position)
values ('ffffffff-2222-4222-8222-222222222222','ffffffff-1111-4111-8111-111111111111','A',0);

insert into teams (id, division_id, pool_id, name) values
  ('ffffffff-3333-4333-8333-000000000001','ffffffff-1111-4111-8111-111111111111','ffffffff-2222-4222-8222-222222222222','Alpha'),
  ('ffffffff-3333-4333-8333-000000000002','ffffffff-1111-4111-8111-111111111111','ffffffff-2222-4222-8222-222222222222','Bravo');

-- A two-set pool match: best_of doubles as the ceiling, sets_to_play forces both.
insert into matches (id, division_id, phase, pool_id, round, slot, label, best_of, sets_to_play,
                     home_team_id, away_team_id)
values ('ffffffff-4444-4444-8444-000000000001','ffffffff-1111-4111-8111-111111111111','pool',
        'ffffffff-2222-4222-8222-222222222222',1,0,'Fixed Game 1',2,2,
        'ffffffff-3333-4333-8333-000000000001','ffffffff-3333-4333-8333-000000000002');

\set FM 'ffffffff-4444-4444-8444-000000000001'

-- One set in, 25-18: a best-of-1 would be over. A two-set match is not.
select submit_match_score(:'FM', '[{"home":25,"away":18}]'::jsonb, true);
select 'TEST fixed-not-final-after-one-set: ' ||
  case when (select status from matches where id = :'FM') = 'in_progress'
  then 'PASS' else 'FAIL: ' || (select status from matches where id = :'FM') end;

-- Both sets played, same team wins both.
select submit_match_score(:'FM', '[{"home":25,"away":18},{"home":25,"away":20}]'::jsonb, true);
select 'TEST fixed-final-after-all-sets: ' ||
  case when (select status || ' ' || home_sets_won || '-' || away_sets_won from matches where id = :'FM') = 'final 2-0'
   and  (select winner_team_id from matches where id = :'FM') = 'ffffffff-3333-4333-8333-000000000001'
  then 'PASS' else 'FAIL: ' || (select status || ' ' || home_sets_won || '-' || away_sets_won from matches where id = :'FM') end;

-- A 1-1 split is final with no winner at all.
select submit_match_score(:'FM', '[{"home":25,"away":18},{"home":21,"away":25}]'::jsonb, true);
select 'TEST fixed-draw-has-no-winner: ' ||
  case when (select status from matches where id = :'FM') = 'final'
   and  (select winner_team_id from matches where id = :'FM') is null
   and  (select loser_team_id from matches where id = :'FM') is null
   and  (select home_sets_won || '-' || away_sets_won from matches where id = :'FM') = '1-1'
  then 'PASS' else 'FAIL: ' ||
    (select status || ' ' || home_sets_won || '-' || away_sets_won || ' winner=' || coalesce(winner_team_id::text,'null')
       from matches where id = :'FM') end;

-- Both sets go to the full target: no shortened deciding set.
select submit_match_score(:'FM', '[{"home":25,"away":18},{"home":15,"away":11}]'::jsonb, true);
select 'TEST fixed-no-shortened-decider: ' ||
  case when (select status from matches where id = :'FM') = 'in_progress'
   and  (select home_sets_won || '-' || away_sets_won from matches where id = :'FM') = '1-0'
  then 'PASS' else 'FAIL: ' || (select status || ' ' || home_sets_won || '-' || away_sets_won from matches where id = :'FM') end;

-- More sets than the match allows is rejected.
do $$
begin
  perform submit_match_score('ffffffff-4444-4444-8444-000000000001',
    '[{"home":25,"away":18},{"home":25,"away":20},{"home":25,"away":20}]'::jsonb, true);
  raise notice 'TEST fixed-rejects-extra-set: FAIL (accepted)';
exception when others then
  raise notice 'TEST fixed-rejects-extra-set: PASS (%)', sqlerrm;
end $$;

-- A three-set fixed match plays the third even at 2-0.
insert into teams (id, division_id, pool_id, name)
values ('ffffffff-3333-4333-8333-000000000003','ffffffff-1111-4111-8111-111111111111','ffffffff-2222-4222-8222-222222222222','Charlie');
insert into matches (id, division_id, phase, pool_id, round, slot, label, best_of, sets_to_play,
                     home_team_id, away_team_id)
values ('ffffffff-4444-4444-8444-000000000002','ffffffff-1111-4111-8111-111111111111','pool',
        'ffffffff-2222-4222-8222-222222222222',2,1,'Fixed Game 2',3,3,
        'ffffffff-3333-4333-8333-000000000001','ffffffff-3333-4333-8333-000000000003');

select submit_match_score('ffffffff-4444-4444-8444-000000000002',
  '[{"home":25,"away":18},{"home":25,"away":20}]'::jsonb, true);
select 'TEST three-set-plays-all-three: ' ||
  case when (select status from matches where id='ffffffff-4444-4444-8444-000000000002') = 'in_progress'
  then 'PASS' else 'FAIL' end;

select submit_match_score('ffffffff-4444-4444-8444-000000000002',
  '[{"home":25,"away":18},{"home":25,"away":20},{"home":19,"away":25}]'::jsonb, true);
select 'TEST three-set-keeps-losing-set: ' ||
  case when (select status || ' ' || home_sets_won || '-' || away_sets_won
               from matches where id='ffffffff-4444-4444-8444-000000000002') = 'final 2-1'
   and  (select count(*) from match_sets where match_id='ffffffff-4444-4444-8444-000000000002') = 3
  then 'PASS' else 'FAIL' end;

-- Best-of behaviour must be untouched by all of this.
select 'TEST best-of-still-stops-at-clincher: ' ||
  case when (select count(*) from match_sets s join matches m on m.id = s.match_id
             where m.sets_to_play is null and m.status = 'final' and m.best_of = 3
               and (select count(*) from match_sets x where x.match_id = m.id) > 2) = 0
  then 'PASS' else 'FAIL' end;
