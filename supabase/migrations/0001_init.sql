-- ============================================================================
-- Volleyball Tournament -- schema, roles, and auto-advancement
-- ============================================================================
-- Run this in the Supabase SQL editor (or `supabase db push`) on a new project.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type app_role as enum ('viewer', 'scorekeeper', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type bracket_format as enum ('single', 'single_consolation', 'double');
exception when duplicate_object then null; end $$;

do $$ begin
  create type match_phase as enum ('pool', 'bracket');
exception when duplicate_object then null; end $$;

do $$ begin
  create type bracket_group as enum ('winners', 'losers', 'consolation', 'grand_final');
exception when duplicate_object then null; end $$;

do $$ begin
  create type match_status as enum ('scheduled', 'in_progress', 'final');
exception when duplicate_object then null; end $$;

do $$ begin
  create type feed_outcome as enum ('winner', 'loser');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Profiles (one row per auth user, carries the role)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  full_name   text,
  role        app_role not null default 'viewer',
  created_at  timestamptz not null default now()
);

-- The very first account to sign up becomes the admin, so a fresh deployment
-- is usable without touching the SQL editor again.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role app_role;
begin
  select case when count(*) = 0 then 'admin'::app_role else 'viewer'::app_role end
    into v_role
    from public.profiles;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    v_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Role helpers (security definer so policies can read profiles without
-- recursing through profiles' own RLS)
-- ---------------------------------------------------------------------------
create or replace function public.current_app_role()
returns app_role
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'viewer'::app_role);
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() = 'admin';
$$;

-- Scorekeepers and admins may enter scores.
create or replace function public.can_score()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() in ('scorekeeper', 'admin');
$$;

-- ---------------------------------------------------------------------------
-- Tournament structure
-- ---------------------------------------------------------------------------
create table if not exists public.tournaments (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  tourney_date  date,
  location      text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists public.divisions (
  id                  uuid primary key default gen_random_uuid(),
  tournament_id       uuid not null references public.tournaments (id) on delete cascade,
  name                text not null,
  position            int  not null default 0,
  bracket_format      bracket_format not null default 'single',
  -- Match/scoring configuration (used for validation hints in the UI)
  pool_best_of        int  not null default 3 check (pool_best_of in (1, 3, 5)),
  bracket_best_of     int  not null default 3 check (bracket_best_of in (1, 3, 5)),
  points_to_win       int  not null default 25 check (points_to_win between 5 and 99),
  deciding_set_points int  not null default 15 check (deciding_set_points between 5 and 99),
  win_by              int  not null default 2  check (win_by between 1 and 5),
  point_cap           int  check (point_cap is null or point_cap between 5 and 99),
  bracket_generated   boolean not null default false,
  created_at          timestamptz not null default now(),
  unique (tournament_id, name)
);

create table if not exists public.pools (
  id           uuid primary key default gen_random_uuid(),
  division_id  uuid not null references public.divisions (id) on delete cascade,
  name         text not null,
  position     int  not null default 0,
  created_at   timestamptz not null default now(),
  unique (division_id, name)
);

create table if not exists public.teams (
  id           uuid primary key default gen_random_uuid(),
  division_id  uuid not null references public.divisions (id) on delete cascade,
  pool_id      uuid references public.pools (id) on delete set null,
  name         text not null,
  club         text,
  -- Bracket seed, assigned when the bracket is generated from pool results.
  bracket_seed int,
  created_at   timestamptz not null default now(),
  unique (division_id, name)
);

create index if not exists teams_division_idx on public.teams (division_id);
create index if not exists teams_pool_idx on public.teams (pool_id);

-- ---------------------------------------------------------------------------
-- Matches -- one table for both pool play and bracket play.
--
-- A bracket slot can be filled either directly (a seeded team) or by a feed:
-- "the winner of match X" / "the loser of match X". Feeds are what make
-- auto-advancement work.
-- ---------------------------------------------------------------------------
create table if not exists public.matches (
  id                    uuid primary key default gen_random_uuid(),
  division_id           uuid not null references public.divisions (id) on delete cascade,
  phase                 match_phase not null,
  pool_id               uuid references public.pools (id) on delete cascade,
  bracket               bracket_group,
  round                 int not null default 1,
  slot                  int not null default 0,
  label                 text,

  home_team_id          uuid references public.teams (id) on delete set null,
  away_team_id          uuid references public.teams (id) on delete set null,

  home_source_match_id  uuid references public.matches (id) on delete cascade,
  home_source_outcome   feed_outcome,
  away_source_match_id  uuid references public.matches (id) on delete cascade,
  away_source_outcome   feed_outcome,

  -- Human-readable placeholders shown before a slot resolves, e.g. "Pool A #1".
  home_placeholder      text,
  away_placeholder      text,

  best_of               int not null default 3 check (best_of in (1, 3, 5)),
  court                 text,
  scheduled_at          timestamptz,

  status                match_status not null default 'scheduled',
  is_bye                boolean not null default false,
  home_sets_won         int not null default 0,
  away_sets_won         int not null default 0,
  winner_team_id        uuid references public.teams (id) on delete set null,
  loser_team_id         uuid references public.teams (id) on delete set null,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint matches_pool_phase_chk check (
    (phase = 'pool' and pool_id is not null and bracket is null)
    or (phase = 'bracket' and bracket is not null)
  ),
  constraint matches_distinct_teams_chk check (
    home_team_id is null or away_team_id is null or home_team_id <> away_team_id
  ),
  constraint matches_home_feed_chk check (
    (home_source_match_id is null) = (home_source_outcome is null)
  ),
  constraint matches_away_feed_chk check (
    (away_source_match_id is null) = (away_source_outcome is null)
  )
);

create unique index if not exists matches_bracket_slot_uidx
  on public.matches (division_id, bracket, round, slot)
  where phase = 'bracket';

create index if not exists matches_division_idx on public.matches (division_id);
create index if not exists matches_pool_idx on public.matches (pool_id);
create index if not exists matches_home_source_idx on public.matches (home_source_match_id);
create index if not exists matches_away_source_idx on public.matches (away_source_match_id);
create index if not exists matches_schedule_idx on public.matches (scheduled_at, court);

create table if not exists public.match_sets (
  id           uuid primary key default gen_random_uuid(),
  match_id     uuid not null references public.matches (id) on delete cascade,
  set_number   int not null check (set_number between 1 and 5),
  home_score   int not null default 0 check (home_score >= 0 and home_score <= 199),
  away_score   int not null default 0 check (away_score >= 0 and away_score <= 199),
  unique (match_id, set_number)
);

create index if not exists match_sets_match_idx on public.match_sets (match_id);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists matches_touch_updated_at on public.matches;
create trigger matches_touch_updated_at
  before update on public.matches
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Auto-advancement
--
-- propagate_results() walks forward from a finished match, dropping winners
-- and losers into the slots that feed from it. If that leaves a bracket match
-- with exactly one real team (because the other side was a bye), the match is
-- itself completed as a bye and the walk continues -- so a team with a bye in
-- round 1 lands in round 2 immediately.
--
-- The walk is iterative rather than recursive, and the trigger below only
-- fires at depth 1, so the cascade runs exactly once per result.
-- ---------------------------------------------------------------------------
create or replace function public.slots_resolved(m public.matches)
returns boolean
language sql
stable
as $$
  select
    (m.home_source_match_id is null
      or exists (select 1 from public.matches x where x.id = m.home_source_match_id and x.status = 'final'))
    and
    (m.away_source_match_id is null
      or exists (select 1 from public.matches x where x.id = m.away_source_match_id and x.status = 'final'));
$$;

create or replace function public.propagate_results(p_root uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  queue  uuid[] := array[p_root];
  cur    uuid;
  dep    public.matches;
  guard  int := 0;
begin
  while coalesce(array_length(queue, 1), 0) > 0 and guard < 1000 loop
    guard := guard + 1;
    cur   := queue[1];
    queue := queue[2:];

    -- Fill every slot of every dependent from whichever of its sources have
    -- finished -- both sides, not only the one that just completed. Two byes
    -- can feed the same match, and filling one side alone would make the
    -- other look empty and wrongly mark the match a bye.
    update public.matches m
       set home_team_id = coalesce(
             (select case when m.home_source_outcome = 'winner' then s.winner_team_id else s.loser_team_id end
                from public.matches s
               where s.id = m.home_source_match_id and s.status = 'final'),
             m.home_team_id),
           away_team_id = coalesce(
             (select case when m.away_source_outcome = 'winner' then s.winner_team_id else s.loser_team_id end
                from public.matches s
               where s.id = m.away_source_match_id and s.status = 'final'),
             m.away_team_id)
     where m.status <> 'final'
       and (m.home_source_match_id = cur or m.away_source_match_id = cur);

    -- Any dependent that is now fully resolved but holds at most one real team
    -- is a bye: complete it and keep walking.
    for dep in
      select m.*
        from public.matches m
       where (m.home_source_match_id = cur or m.away_source_match_id = cur)
         and m.phase = 'bracket'
         and m.status <> 'final'
         and (m.home_team_id is null or m.away_team_id is null)
    loop
      if public.slots_resolved(dep) then
        update public.matches
           set status         = 'final',
               is_bye         = true,
               home_sets_won  = 0,
               away_sets_won  = 0,
               winner_team_id = coalesce(dep.home_team_id, dep.away_team_id),
               loser_team_id  = null
         where id = dep.id;

        queue := queue || dep.id;
      end if;
    end loop;
  end loop;
end;
$$;

-- Undo: wipe every downstream slot that was filled from this match, so a
-- corrected score cannot leave a stale team sitting in a later round.
create or replace function public.clear_downstream(p_root uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  queue uuid[] := array[p_root];
  cur   uuid;
  dep   uuid;
  guard int := 0;
begin
  while coalesce(array_length(queue, 1), 0) > 0 and guard < 1000 loop
    guard := guard + 1;
    cur   := queue[1];
    queue := queue[2:];

    for dep in
      select m.id from public.matches m
       where m.home_source_match_id = cur or m.away_source_match_id = cur
    loop
      delete from public.match_sets where match_id = dep;

      update public.matches m
         set home_team_id   = case when m.home_source_match_id = cur then null else m.home_team_id end,
             away_team_id   = case when m.away_source_match_id = cur then null else m.away_team_id end,
             status         = 'scheduled',
             is_bye         = false,
             home_sets_won  = 0,
             away_sets_won  = 0,
             winner_team_id = null,
             loser_team_id  = null
       where m.id = dep;

      queue := queue || dep;
    end loop;
  end loop;
end;
$$;

drop trigger if exists matches_propagate on public.matches;
create or replace function public.trg_matches_propagate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'final' and new.winner_team_id is not null then
    perform public.propagate_results(new.id);
  end if;
  return null;
end;
$$;

create trigger matches_propagate
  after update of status, winner_team_id on public.matches
  for each row
  when (pg_trigger_depth() = 1)
  execute function public.trg_matches_propagate();

-- ---------------------------------------------------------------------------
-- Set completion
--
-- A running score such as 14-12 is not a won set. The leader must reach the
-- target for that set (the deciding set is played to a lower target) and be
-- ahead by the win-by margin, unless a hard cap has been reached. Keeping this
-- in the database means a match cannot be finalized on an unfinished set no
-- matter which client posts the score.
-- ---------------------------------------------------------------------------
create or replace function public.set_target(
  p_set_number int, p_best_of int, p_points_to_win int, p_deciding_points int
) returns int
language sql
immutable
as $$
  select case when p_best_of > 1 and p_set_number = p_best_of
              then p_deciding_points else p_points_to_win end;
$$;

create or replace function public.is_set_complete(
  p_home int, p_away int, p_set_number int, p_best_of int,
  p_points_to_win int, p_deciding_points int, p_win_by int, p_cap int
) returns boolean
language sql
immutable
as $$
  select case
    when p_home = p_away then false
    when greatest(p_home, p_away)
         < public.set_target(p_set_number, p_best_of, p_points_to_win, p_deciding_points) then false
    when p_cap is not null and greatest(p_home, p_away) >= p_cap then true
    else greatest(p_home, p_away) - least(p_home, p_away) >= p_win_by
  end;
$$;

-- ---------------------------------------------------------------------------
-- Score entry
--
-- Single atomic entry point used by scorekeepers and admins. It writes the
-- sets, recomputes the set count and winner, and re-runs advancement --
-- including undoing a previous (wrong) result first.
--
-- p_sets is a JSON array: [{"home": 25, "away": 20}, {"home": 23, "away": 25}]
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

  if jsonb_array_length(p_sets) > m.best_of then
    raise exception 'This match is best of %, got % sets', m.best_of, jsonb_array_length(p_sets);
  end if;

  select * into d from public.divisions where id = m.division_id;

  -- A result already existed: tear down anything it fed before rewriting it.
  if m.status = 'final' then
    perform public.clear_downstream(m.id);
  end if;

  delete from public.match_sets where match_id = m.id;

  needed := (m.best_of / 2) + 1;

  for s in select * from jsonb_array_elements(p_sets) loop
    idx := idx + 1;
    hs  := coalesce((s ->> 'home')::int, 0);
    aws := coalesce((s ->> 'away')::int, 0);

    if hs < 0 or aws < 0 or hs > 199 or aws > 199 then
      raise exception 'Set % has an out-of-range score (%-%)', idx, hs, aws;
    end if;

    complete := public.is_set_complete(
      hs, aws, idx, m.best_of, d.points_to_win, d.deciding_set_points, d.win_by, d.point_cap);

    -- Everything up to the clinching set must be a finished set; a running
    -- score entered there is a slip, not a result.
    if p_finalize and decided_at is null and not complete
       and idx < jsonb_array_length(p_sets) then
      raise exception 'Set % (%-%) is not a finished set', idx, hs, aws;
    end if;

    -- Sets played after the match was already won are surplus.
    exit when decided_at is not null;

    insert into public.match_sets (match_id, set_number, home_score, away_score)
    values (m.id, idx, hs, aws);

    if complete then
      if hs > aws then home_sets := home_sets + 1; else away_sets := away_sets + 1; end if;
      if home_sets >= needed or away_sets >= needed then
        decided_at := idx;
      end if;
    end if;
  end loop;

  if p_finalize and decided_at is not null then
    new_status := 'final';
    if home_sets > away_sets then
      new_winner := m.home_team_id; new_loser := m.away_team_id;
    else
      new_winner := m.away_team_id; new_loser := m.home_team_id;
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

  -- The trigger covers the normal path; call directly so a same-statement
  -- update (status already 'final') still cascades.
  if m.status = 'final' and m.winner_team_id is not null then
    perform public.propagate_results(m.id);
  end if;

  return m;
end;
$$;

-- Admin escape hatch: undo a result entirely (e.g. wrong match scored).
create or replace function public.reopen_match(p_match_id uuid)
returns public.matches
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.matches;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can reopen a match' using errcode = '42501';
  end if;

  perform public.clear_downstream(p_match_id);
  delete from public.match_sets where match_id = p_match_id;

  update public.matches
     set status = 'scheduled', is_bye = false, home_sets_won = 0, away_sets_won = 0,
         winner_team_id = null, loser_team_id = null
   where id = p_match_id
   returning * into m;

  return m;
end;
$$;

-- Admins may change roles; the last admin cannot demote themselves.
create or replace function public.set_user_role(p_user_id uuid, p_role app_role)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.profiles;
  admin_count int;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change roles' using errcode = '42501';
  end if;

  if p_role <> 'admin' then
    select count(*) into admin_count from public.profiles where role = 'admin';
    if admin_count <= 1 and exists (select 1 from public.profiles where id = p_user_id and role = 'admin') then
      raise exception 'Cannot remove the last admin';
    end if;
  end if;

  update public.profiles set role = p_role where id = p_user_id returning * into p;
  if not found then
    raise exception 'User not found';
  end if;
  return p;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
--
-- Read: everyone, including anonymous spectators who never sign in.
-- Write: admins only, directly. Scorekeepers go through submit_match_score(),
--        which is security definer and checks can_score() itself -- so a
--        scorekeeper can post a score but cannot rename a team or delete a
--        bracket.
-- ---------------------------------------------------------------------------
alter table public.profiles    enable row level security;
alter table public.tournaments enable row level security;
alter table public.divisions   enable row level security;
alter table public.pools       enable row level security;
alter table public.teams       enable row level security;
alter table public.matches     enable row level security;
alter table public.match_sets  enable row level security;

-- profiles ------------------------------------------------------------------
drop policy if exists profiles_select_self_or_admin on public.profiles;
create policy profiles_select_self_or_admin on public.profiles
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update_self_name on public.profiles;
create policy profiles_update_self_name on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid() and role = public.current_app_role());

drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- tournament data: public read, admin write ---------------------------------
do $$
declare t text;
begin
  foreach t in array array['tournaments', 'divisions', 'pools', 'teams', 'matches', 'match_sets'] loop
    execute format('drop policy if exists %I on public.%I', t || '_public_read', t);
    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (true)',
      t || '_public_read', t);

    execute format('drop policy if exists %I on public.%I', t || '_admin_write', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
      t || '_admin_write', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on
  public.tournaments, public.divisions, public.pools, public.teams,
  public.matches, public.match_sets, public.profiles
  to authenticated;

revoke all on function public.submit_match_score(uuid, jsonb, boolean) from public;
grant execute on function public.submit_match_score(uuid, jsonb, boolean) to authenticated;

revoke all on function public.reopen_match(uuid) from public;
grant execute on function public.reopen_match(uuid) to authenticated;

revoke all on function public.set_user_role(uuid, app_role) from public;
grant execute on function public.set_user_role(uuid, app_role) to authenticated;

grant execute on function public.current_app_role() to anon, authenticated;

-- Internal helpers -- not callable from the client.
revoke all on function public.propagate_results(uuid) from public, anon, authenticated;
revoke all on function public.clear_downstream(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime -- every device watching the tournament updates the moment a
-- score is posted.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['tournaments', 'divisions', 'pools', 'teams', 'matches', 'match_sets'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
             when undefined_object then null;
    end;
  end loop;
end $$;

-- Realtime needs the full row to compute changes for filtered subscriptions.
alter table public.matches replica identity full;
alter table public.match_sets replica identity full;
