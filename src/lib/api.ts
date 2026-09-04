import { supabase } from './supabase'
import type {
  AppRole,
  BracketFormat,
  Division,
  Match,
  MatchSet,
  Pool,
  Profile,
  Team,
  Tournament,
} from './types'
import { generateBracket, seedFromPools, type PlannedMatch } from './bracket'
import { planPoolMatches, poolName, scheduleMatches, setsForPoolSize, splitIntoPools } from './pools'
import { rankPool } from './standings'

function unwrap<T>({ data, error }: { data: T | null; error: unknown }): T {
  if (error) throw error
  return data as T
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function fetchTournaments(): Promise<Tournament[]> {
  return unwrap(
    await supabase.from('tournaments').select('*').order('tourney_date', { ascending: false }),
  )
}

export async function fetchDivisions(tournamentId: string): Promise<Division[]> {
  return unwrap(
    await supabase
      .from('divisions')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('position')
      .order('name'),
  )
}

export interface DivisionData {
  pools: Pool[]
  teams: Team[]
  matches: Match[]
  sets: MatchSet[]
  setsByMatch: Map<string, MatchSet[]>
  teamsById: Map<string, Team>
}

export async function fetchDivisionData(divisionId: string): Promise<DivisionData> {
  const [pools, teams, matches] = await Promise.all([
    supabase.from('pools').select('*').eq('division_id', divisionId).order('position').then(unwrap<Pool[]>),
    supabase.from('teams').select('*').eq('division_id', divisionId).order('name').then(unwrap<Team[]>),
    supabase
      .from('matches')
      .select('*')
      .eq('division_id', divisionId)
      .order('round')
      .order('slot')
      .then(unwrap<Match[]>),
  ])

  const matchIds = matches.map((m) => m.id)
  const sets = matchIds.length
    ? unwrap<MatchSet[]>(
        await supabase.from('match_sets').select('*').in('match_id', matchIds).order('set_number'),
      )
    : []

  const setsByMatch = new Map<string, MatchSet[]>()
  for (const set of sets) {
    const list = setsByMatch.get(set.match_id) ?? []
    list.push(set)
    setsByMatch.set(set.match_id, list)
  }

  return {
    pools,
    teams,
    matches,
    sets,
    setsByMatch,
    teamsById: new Map(teams.map((t) => [t.id, t])),
  }
}

export async function fetchProfiles(): Promise<Profile[]> {
  return unwrap(await supabase.from('profiles').select('*').order('created_at'))
}

// ---------------------------------------------------------------------------
// Tournament / division / team management (admin)
// ---------------------------------------------------------------------------

export async function createTournament(input: {
  name: string
  tourney_date: string | null
  location: string | null
}): Promise<Tournament> {
  return unwrap(await supabase.from('tournaments').insert(input).select().single())
}

export async function updateTournament(id: string, patch: Partial<Tournament>): Promise<void> {
  const { error } = await supabase.from('tournaments').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteTournament(id: string): Promise<void> {
  const { error } = await supabase.from('tournaments').delete().eq('id', id)
  if (error) throw error
}

export async function createDivision(input: {
  tournament_id: string
  name: string
  bracket_format: BracketFormat
  pool_best_of: number
  bracket_best_of: number
  position: number
}): Promise<Division> {
  return unwrap(await supabase.from('divisions').insert(input).select().single())
}

export async function updateDivision(id: string, patch: Partial<Division>): Promise<void> {
  const { error } = await supabase.from('divisions').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteDivision(id: string): Promise<void> {
  const { error } = await supabase.from('divisions').delete().eq('id', id)
  if (error) throw error
}

/** Add one or many teams at once -- the admin screen accepts a pasted list. */
export async function addTeams(divisionId: string, names: string[]): Promise<void> {
  const rows = names
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => ({ division_id: divisionId, name }))
  if (rows.length === 0) return
  const { error } = await supabase.from('teams').insert(rows)
  if (error) throw error
}

export async function updateTeam(id: string, patch: Partial<Team>): Promise<void> {
  const { error } = await supabase.from('teams').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteTeam(id: string): Promise<void> {
  const { error } = await supabase.from('teams').delete().eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Pool play
// ---------------------------------------------------------------------------

/**
 * Wipe any existing pools for the division, split the teams into pools of at
 * most `maxPerPool`, and lay out a full round robin inside each one.
 */
export async function generatePools(
  division: Division,
  teams: Team[],
  maxPerPool: number,
): Promise<void> {
  // Deleting the pools cascades to their matches.
  const { error: delError } = await supabase.from('pools').delete().eq('division_id', division.id)
  if (delError) throw delError

  const groups = splitIntoPools(teams, maxPerPool)
  if (groups.length === 0) return

  const poolRows = groups.map((_, index) => ({
    division_id: division.id,
    name: poolName(index),
    position: index,
  }))
  const pools = unwrap<Pool[]>(await supabase.from('pools').insert(poolRows).select())
  const poolsByName = new Map(pools.map((p) => [p.name, p]))

  const teamUpdates: PromiseLike<unknown>[] = []
  const matchRows: Record<string, unknown>[] = []

  groups.forEach((group, index) => {
    const pool = poolsByName.get(poolName(index))!
    for (const team of group) {
      teamUpdates.push(
        supabase.from('teams').update({ pool_id: pool.id, bracket_seed: null }).eq('id', team.id),
      )
    }
    // A fixed-set division plays a set count chosen by how big this pool is.
    const setsToPlay =
      division.pool_scoring_mode === 'fixed_sets'
        ? setsForPoolSize(group.length, division.pool_sets_by_size ?? undefined)
        : null

    for (const planned of planPoolMatches(pool, group, division.pool_best_of, setsToPlay)) {
      matchRows.push({
        id: planned.id,
        division_id: division.id,
        phase: 'pool',
        pool_id: pool.id,
        round: planned.round,
        slot: planned.slot,
        label: planned.label,
        home_team_id: planned.homeTeamId,
        away_team_id: planned.awayTeamId,
        best_of: planned.bestOf,
        sets_to_play: planned.setsToPlay,
      })
    }
  })

  await Promise.all(teamUpdates)

  if (matchRows.length > 0) {
    const { error } = await supabase.from('matches').insert(matchRows)
    if (error) throw error
  }

  await updateDivision(division.id, { bracket_generated: false })
}

/** Assign courts and start times to every unplayed match in a phase. */
export async function scheduleDivision(
  matches: Match[],
  options: { courts: string[]; startAt: Date; minutesPerSlot: number },
): Promise<void> {
  const schedulable = matches
    .filter((m) => !m.is_bye)
    .map((m) => ({ id: m.id, round: m.round, teamIds: [m.home_team_id, m.away_team_id] }))

  const slots = scheduleMatches(schedulable, options)
  await Promise.all(
    slots.map((slot) =>
      supabase
        .from('matches')
        .update({ court: slot.court, scheduled_at: slot.scheduledAt })
        .eq('id', slot.matchId),
    ),
  )
}

// ---------------------------------------------------------------------------
// Bracket
// ---------------------------------------------------------------------------

export function buildSeeds(division: Division, data: DivisionData) {
  const mode = division.pool_scoring_mode
  const poolResults = data.pools
    .map((pool) => ({
      poolName: `Pool ${pool.name}`,
      standings: rankPool(
        data.teams.filter((t) => t.pool_id === pool.id),
        data.matches.filter((m) => m.phase === 'pool' && m.pool_id === pool.id),
        data.setsByMatch,
        mode,
      ),
    }))
    .filter((p) => p.standings.length > 0)

  return {
    poolResults,
    seeds: seedFromPools(poolResults, mode),
    format: division.bracket_format,
  }
}

/**
 * Seed the afternoon bracket from the morning's pool results and write every
 * match, already wired for auto-advancement.
 */
export async function generateBracketForDivision(
  division: Division,
  data: DivisionData,
): Promise<number> {
  const { seeds } = buildSeeds(division, data)
  if (seeds.length < 2) throw new Error('At least two teams must have pool results.')

  await clearBracket(division.id)

  const planned = generateBracket({
    seeds,
    format: division.bracket_format,
    bestOf: division.bracket_best_of,
  })

  await Promise.all(
    seeds.map((seed) =>
      supabase.from('teams').update({ bracket_seed: seed.seed }).eq('id', seed.teamId),
    ),
  )

  // Insert without the feed columns first: a feed points at another row in the
  // same batch, and the self-referencing foreign key is checked per row.
  const base = planned.map((m: PlannedMatch) => ({
    id: m.id,
    division_id: division.id,
    phase: 'bracket' as const,
    bracket: m.bracket,
    round: m.round,
    slot: m.slot,
    label: m.label,
    best_of: m.bestOf,
    home_team_id: m.homeTeamId,
    away_team_id: m.awayTeamId,
    home_placeholder: m.homePlaceholder,
    away_placeholder: m.awayPlaceholder,
    status: m.status,
    is_bye: m.isBye,
    winner_team_id: m.winnerTeamId,
    loser_team_id: m.loserTeamId,
  }))

  const { error: insertError } = await supabase.from('matches').insert(base)
  if (insertError) throw insertError

  const withFeeds = planned.filter((m) => m.homeSourceMatchId || m.awaySourceMatchId)
  await Promise.all(
    withFeeds.map((m) =>
      supabase
        .from('matches')
        .update({
          home_source_match_id: m.homeSourceMatchId,
          home_source_outcome: m.homeSourceOutcome,
          away_source_match_id: m.awaySourceMatchId,
          away_source_outcome: m.awaySourceOutcome,
        })
        .eq('id', m.id),
    ),
  )

  await updateDivision(division.id, { bracket_generated: true })
  return planned.length
}

export async function clearBracket(divisionId: string): Promise<void> {
  const { error } = await supabase
    .from('matches')
    .delete()
    .eq('division_id', divisionId)
    .eq('phase', 'bracket')
  if (error) throw error
  await updateDivision(divisionId, { bracket_generated: false })
}

// ---------------------------------------------------------------------------
// Scores
// ---------------------------------------------------------------------------

export interface SetScore {
  home: number
  away: number
}

/**
 * Post a result. The database validates the caller's role, writes the sets,
 * decides the winner, and advances the bracket in one transaction.
 */
export async function submitScore(
  matchId: string,
  sets: SetScore[],
  finalize = true,
): Promise<Match> {
  const { data, error } = await supabase.rpc('submit_match_score', {
    p_match_id: matchId,
    p_sets: sets,
    p_finalize: finalize,
  })
  if (error) throw error
  return data as Match
}

export async function reopenMatch(matchId: string): Promise<void> {
  const { error } = await supabase.rpc('reopen_match', { p_match_id: matchId })
  if (error) throw error
}

export async function updateMatchDetails(
  matchId: string,
  patch: { court?: string | null; scheduled_at?: string | null },
): Promise<void> {
  const { error } = await supabase.from('matches').update(patch).eq('id', matchId)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export async function setUserRole(userId: string, role: AppRole): Promise<void> {
  const { error } = await supabase.rpc('set_user_role', { p_user_id: userId, p_role: role })
  if (error) throw error
}
