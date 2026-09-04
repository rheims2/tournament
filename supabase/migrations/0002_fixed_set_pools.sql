-- ============================================================================
-- Fixed-set pool play
-- ============================================================================
-- Pool play can now run a fixed number of sets per match rather than a
-- best-of. Every set is played, so a two-set match can finish 1-1 with no
-- winner, and how many sets a match plays follows the size of its pool --
-- a pool of 4 plays fewer sets per match because it plays more matches.
--
-- Safe to run on a database already carrying 0001.

-- ---------------------------------------------------------------------------
-- Division configuration
-- ---------------------------------------------------------------------------
alter table public.divisions
  add column if not exists pool_scoring_mode text not null default 'best_of',
  add column if not exists pool_sets_by_size jsonb not null default '{"2":3,"3":3,"4":2,"5":2,"6":2}'::jsonb,
  add column if not exists pool_points_to_win int not null default 25,
  add column if not exists pool_start_score int not null default 0;

do $$ begin
  alter table public.divisions
    add constraint divisions_pool_scoring_mode_chk
    check (pool_scoring_mode in ('best_of', 'fixed_sets'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.divisions
    add constraint divisions_pool_points_chk check (pool_points_to_win between 5 and 99);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.divisions
    add constraint divisions_pool_start_chk check (pool_start_score between 0 and 24);
exception when duplicate_object then null; end $$;

-- Pool play now always reads pool_points_to_win. Carry over whatever existing
-- divisions were using so behaviour does not shift underneath them.
update public.divisions set pool_points_to_win = points_to_win
 where pool_points_to_win = 25 and points_to_win <> 25;

-- ---------------------------------------------------------------------------
-- Matches
--
-- sets_to_play null  -> best-of: stop as soon as a side clinches (best_of)
-- sets_to_play N     -> play all N sets; the winner is whoever took more, and
--                       an even N can end level with no winner at all
-- ---------------------------------------------------------------------------
alter table public.matches
  add column if not exists sets_to_play int;

do $$ begin
  alter table public.matches
    add constraint matches_sets_to_play_chk
    check (sets_to_play is null or sets_to_play between 1 and 5);
exception when duplicate_object then null; end $$;

-- best_of becomes the upper bound on sets, so an even fixed count is legal.
alter table public.matches drop constraint if exists matches_best_of_check;
do $$ begin
  alter table public.matches
    add constraint matches_best_of_chk check (best_of between 1 and 5);
exception when duplicate_object then null; end $$;

-- A drawn pool match is final with no winner, so the two must be able to
-- disagree. Bracket matches are unaffected: they stay best-of, which cannot
-- draw, and propagation already ignores a final match with a null winner.
comment on column public.matches.winner_team_id is
  'Null on a drawn fixed-set pool match, and on a bye with no team.';

-- ---------------------------------------------------------------------------
-- Score entry, reworked for both modes
-- ---------------------------------------------------------------------------
create or replace function public.submit_match_score(
  p_match_id uuid,
  p_sets     jsonb,
  p_finalize boolean default true
)
returns public.matches
language plpgsql
security definer
set search_path = public
as $$
declare
  m          public.matches;
  d          public.divisions;
  s          jsonb;
  idx        int := 0;
  home_sets  int := 0;
  away_sets  int := 0;
  needed     int;
  hs         int;
  aws        int;
  complete   boolean;
  decided_at int := null;
  fixed      int;          -- sets_to_play, when this match plays a fixed count
  max_sets   int;
  v_points   int;
  v_deciding int;
  new_status match_status;
  new_winner uuid;
  new_loser  uuid;
begin
  if not public.can_score() then
    raise exception 'You do not have permission to enter scores'
      using errcode = '42501';
  end if;

  select * into m from public.matches where id = p_match_id for update;
  if not found then
    raise exception 'Match not found';
  end if;

  if m.is_bye then
    raise exception 'Cannot score a bye';
  end if;

  if m.home_team_id is null or m.away_team_id is null then
    raise exception 'Both teams must be decided before this match can be scored';
  end if;

  if jsonb_typeof(p_sets) <> 'array' then
    raise exception 'p_sets must be a JSON array of {home, away} objects';
  end if;

  select * into d from public.divisions where id = m.division_id;

  fixed    := m.sets_to_play;
  max_sets := coalesce(fixed, m.best_of);
  needed   := (m.best_of / 2) + 1;

  -- Pool play carries its own target; a fixed-set match plays every set to
  -- the same number, with no shortened deciding set.
  if m.phase = 'pool' then
    v_points := d.pool_points_to_win;
    v_deciding := case when fixed is null then d.deciding_set_points else d.pool_points_to_win end;
  else
    v_points := d.points_to_win;
    v_deciding := d.deciding_set_points;
  end if;

  if jsonb_array_length(p_sets) > max_sets then
    raise exception 'This match plays at most % sets, got %',
      max_sets, jsonb_array_length(p_sets);
  end if;

  -- A result already existed: tear down anything it fed before rewriting it.
  if m.status = 'final' then
    perform public.clear_downstream(m.id);
  end if;

  delete from public.match_sets where match_id = m.id;

  for s in select * from jsonb_array_elements(p_sets) loop
    idx := idx + 1;
    hs  := coalesce((s ->> 'home')::int, 0);
    aws := coalesce((s ->> 'away')::int, 0);

    if hs < 0 or aws < 0 or hs > 199 or aws > 199 then
      raise exception 'Set % has an out-of-range score (%-%)', idx, hs, aws;
    end if;

    complete := public.is_set_complete(
      hs, aws, idx, max_sets, v_points, v_deciding, d.win_by, d.point_cap);

    -- Every set up to the last one that matters must be a finished set; a
    -- running score entered there is a slip, not a result.
    if p_finalize and decided_at is null and not complete
       and idx < jsonb_array_length(p_sets) then
      raise exception 'Set % (%-%) is not a finished set', idx, hs, aws;
    end if;

    -- Best-of only: sets played after the match was already won are surplus.
    exit when fixed is null and decided_at is not null;

    insert into public.match_sets (match_id, set_number, home_score, away_score)
    values (m.id, idx, hs, aws);

    if complete then
      if hs > aws then home_sets := home_sets + 1; else away_sets := away_sets + 1; end if;

      if fixed is null then
        if decided_at is null and (home_sets >= needed or away_sets >= needed) then
          decided_at := idx;
        end if;
      elsif home_sets + away_sets >= fixed then
        -- Fixed-set match: it is over once every set has been played.
        decided_at := idx;
      end if;
    end if;
  end loop;

  if p_finalize and decided_at is not null then
    new_status := 'final';
    if home_sets > away_sets then
      new_winner := m.home_team_id; new_loser := m.away_team_id;
    elsif away_sets > home_sets then
      new_winner := m.away_team_id; new_loser := m.home_team_id;
    else
      -- Drawn: an even fixed-set match can finish level.
      new_winner := null; new_loser := null;
    end if;
  elsif idx = 0 then
    new_status := 'scheduled'; new_winner := null; new_loser := null;
  else
    new_status := 'in_progress'; new_winner := null; new_loser := null;
  end if;

  update public.matches
     set home_sets_won  = home_sets,
         away_sets_won  = away_sets,
         status         = new_status,
         winner_team_id = new_winner,
         loser_team_id  = new_loser
   where id = m.id
   returning * into m;

  if m.status = 'final' and m.winner_team_id is not null then
    perform public.propagate_results(m.id);
  end if;

  return m;
end;
$$;

revoke all on function public.submit_match_score(uuid, jsonb, boolean) from public;
grant execute on function public.submit_match_score(uuid, jsonb, boolean) to authenticated;
