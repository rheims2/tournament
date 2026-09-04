import type { Team } from './types'

export const POOL_NAMES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

export const poolName = (index: number): string =>
  index < POOL_NAMES.length
    ? POOL_NAMES[index]
    : `${POOL_NAMES[Math.floor(index / POOL_NAMES.length) - 1]}${POOL_NAMES[index % POOL_NAMES.length]}`

/**
 * How many pools are needed so that no pool exceeds `maxPerPool`.
 * Pools end up within one team of each other in size.
 */
export const poolCountFor = (teamCount: number, maxPerPool: number): number =>
  teamCount === 0 ? 0 : Math.ceil(teamCount / Math.max(1, maxPerPool))

/**
 * Split teams into pools of at most `maxPerPool`, snaking down the list so
 * that if the list is ordered strongest-first the pools come out balanced.
 */
export function splitIntoPools<T>(teams: T[], maxPerPool = 4): T[][] {
  const count = poolCountFor(teams.length, maxPerPool)
  if (count === 0) return []

  const pools: T[][] = Array.from({ length: count }, () => [])
  teams.forEach((team, index) => {
    const row = Math.floor(index / count)
    const withinRow = index % count
    const target = row % 2 === 0 ? withinRow : count - 1 - withinRow
    pools[target].push(team)
  })
  return pools
}

export const DEFAULT_SETS_BY_POOL_SIZE: Record<string, number> = {
  '2': 3,
  '3': 3,
  '4': 2,
  '5': 2,
  '6': 2,
}

/**
 * How many sets a match in this pool plays. Smaller pools play more sets per
 * match because they play fewer matches, which keeps every team's time on
 * court roughly even.
 */
export function setsForPoolSize(
  poolSize: number,
  map: Record<string, number> = DEFAULT_SETS_BY_POOL_SIZE,
): number {
  // Guard against a row written before the column existed.
  if (!map || Object.keys(map).length === 0) map = DEFAULT_SETS_BY_POOL_SIZE
  const exact = map[String(poolSize)]
  if (exact) return exact
  // Unlisted size: fall back to the largest listed size at or below it, then
  // to the smallest listed entry.
  const sizes = Object.keys(map)
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b)
  if (sizes.length === 0) return 2
  const below = sizes.filter((n) => n <= poolSize)
  return map[String(below.length ? below[below.length - 1] : sizes[0])]
}

export interface Pairing {
  round: number
  home: string
  away: string
}

/**
 * Round-robin pairings via the circle method: every team plays every other
 * team exactly once, spread over the fewest possible rounds. With an odd
 * number of teams one team sits out each round.
 */
export function roundRobinPairings(teamIds: string[]): Pairing[] {
  if (teamIds.length < 2) return []

  const BYE = '__bye__'
  const ids = [...teamIds]
  if (ids.length % 2 === 1) ids.push(BYE)

  const n = ids.length
  const rounds = n - 1
  const half = n / 2
  const rotating = ids.slice(1)
  const pairings: Pairing[] = []

  for (let round = 0; round < rounds; round++) {
    const order = [ids[0], ...rotating]
    for (let i = 0; i < half; i++) {
      const a = order[i]
      const b = order[n - 1 - i]
      if (a === BYE || b === BYE) continue
      // Alternate home/away so no team is always listed first.
      const flip = (round + i) % 2 === 1
      pairings.push({ round: round + 1, home: flip ? b : a, away: flip ? a : b })
    }
    rotating.unshift(rotating.pop()!)
  }

  return pairings
}

export interface PlannedPoolMatch {
  id: string
  poolId: string
  round: number
  slot: number
  label: string
  homeTeamId: string
  awayTeamId: string
  bestOf: number
  /** Non-null when every set is played out rather than stopping at a clincher. */
  setsToPlay: number | null
}

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)

/**
 * Full round-robin schedule for one pool.
 *
 * @param setsToPlay when given, every match plays exactly this many sets
 *        instead of running as a best-of.
 */
export function planPoolMatches(
  pool: { id: string; name: string },
  teams: Team[],
  bestOf: number,
  setsToPlay: number | null = null,
): PlannedPoolMatch[] {
  const pairings = roundRobinPairings(teams.map((t) => t.id))
  return pairings.map((pairing, index) => ({
    id: newId(),
    poolId: pool.id,
    round: pairing.round,
    slot: index,
    label: `Pool ${pool.name} Game ${index + 1}`,
    homeTeamId: pairing.home,
    awayTeamId: pairing.away,
    // best_of doubles as the upper bound on sets for a fixed-set match.
    bestOf: setsToPlay ?? bestOf,
    setsToPlay,
  }))
}

export interface SchedulableMatch {
  id: string
  round: number
  teamIds: (string | null)[]
}

export interface ScheduleSlot {
  matchId: string
  court: string
  scheduledAt: string
}

export interface ScheduleOptions {
  courts: string[]
  startAt: Date
  minutesPerSlot: number
}

/**
 * Greedily lay matches out across courts and time slots. Within a time slot a
 * team never appears twice, and matches are taken in round order so a pool's
 * first-round games are played before its second-round games.
 */
export function scheduleMatches(
  matches: SchedulableMatch[],
  { courts, startAt, minutesPerSlot }: ScheduleOptions,
): ScheduleSlot[] {
  if (courts.length === 0 || matches.length === 0) return []

  const remaining = [...matches].sort((a, b) => a.round - b.round)
  const assignments: ScheduleSlot[] = []
  let slotIndex = 0

  while (remaining.length > 0 && slotIndex < 500) {
    const busy = new Set<string>()
    const at = new Date(startAt.getTime() + slotIndex * minutesPerSlot * 60_000)
    let courtIndex = 0

    for (let i = 0; i < remaining.length && courtIndex < courts.length; ) {
      const match = remaining[i]
      const teams = match.teamIds.filter((t): t is string => Boolean(t))
      if (teams.some((t) => busy.has(t))) {
        i++
        continue
      }
      teams.forEach((t) => busy.add(t))
      assignments.push({
        matchId: match.id,
        court: courts[courtIndex],
        scheduledAt: at.toISOString(),
      })
      courtIndex++
      remaining.splice(i, 1)
    }

    // No match could be placed in this slot -- avoid spinning forever.
    if (courtIndex === 0) break
    slotIndex++
  }

  return assignments
}
