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
  /**
   * Matches whose result feeds this one. A consolation opener has no teams yet
   * -- they are "the loser of QF1" -- so team conflicts cannot order it; only
   * the feed can.
   */
  sourceMatchIds?: (string | null)[]
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
 * How many matches deep in the feed chain this one sits: 0 for anything that
 * can be played immediately, 1 for a match awaiting a depth-0 result, and so
 * on. Round numbers cannot do this job because they restart inside each
 * bracket -- a consolation opener, a losers-bracket opener and the grand final
 * are all "round 1".
 *
 * A source outside the batch is treated as already settled: it is a bye, or a
 * match that has been played.
 */
export function dependencyDepth(matches: SchedulableMatch[]): Map<string, number> {
  const byId = new Map(matches.map((m) => [m.id, m]))
  const depth = new Map<string, number>()
  const visiting = new Set<string>()

  const walk = (id: string): number => {
    const cached = depth.get(id)
    if (cached !== undefined) return cached
    const match = byId.get(id)
    if (!match) return -1
    // A bracket is acyclic; this only guards against corrupt data.
    if (visiting.has(id)) return 0

    visiting.add(id)
    let deepest = 0
    for (const source of match.sourceMatchIds ?? []) {
      if (!source) continue
      const sourceDepth = walk(source)
      if (sourceDepth >= 0) deepest = Math.max(deepest, sourceDepth + 1)
    }
    visiting.delete(id)

    depth.set(id, deepest)
    return deepest
  }

  for (const match of matches) walk(match.id)
  return depth
}

/**
 * Greedily lay matches out across courts and time slots.
 *
 * Three rules hold: a team never appears twice in one slot, a match never
 * starts in the same slot as (or earlier than) a match feeding it, and within
 * a pool the earlier round goes first.
 */
export function scheduleMatches(
  matches: SchedulableMatch[],
  { courts, startAt, minutesPerSlot }: ScheduleOptions,
): ScheduleSlot[] {
  if (courts.length === 0 || matches.length === 0) return []

  const depth = dependencyDepth(matches)
  const inBatch = new Set(matches.map((m) => m.id))
  const remaining = [...matches].sort(
    (a, b) => (depth.get(a.id) ?? 0) - (depth.get(b.id) ?? 0) || a.round - b.round,
  )

  const assignments: ScheduleSlot[] = []
  const slotOf = new Map<string, number>()
  let slotIndex = 0
  let lastRemaining = remaining.length
  let stalled = 0

  /** Every feeder must already sit in a strictly earlier slot. */
  const feedersSettled = (match: SchedulableMatch, slot: number) =>
    (match.sourceMatchIds ?? []).every((source) => {
      if (!source || !inBatch.has(source)) return true
      const placed = slotOf.get(source)
      return placed !== undefined && placed < slot
    })

  while (remaining.length > 0 && slotIndex < 500) {
    const busy = new Set<string>()
    const at = new Date(startAt.getTime() + slotIndex * minutesPerSlot * 60_000)
    let courtIndex = 0

    for (let i = 0; i < remaining.length && courtIndex < courts.length; ) {
      const match = remaining[i]
      const teams = match.teamIds.filter((t): t is string => Boolean(t))
      if (!feedersSettled(match, slotIndex) || teams.some((t) => busy.has(t))) {
        i++
        continue
      }
      teams.forEach((t) => busy.add(t))
      assignments.push({
        matchId: match.id,
        court: courts[courtIndex],
        scheduledAt: at.toISOString(),
      })
      slotOf.set(match.id, slotIndex)
      courtIndex++
      remaining.splice(i, 1)
    }

    slotIndex++

    // A slot can legitimately place nothing while a feeder is still being
    // played, but never for long. This only catches corrupt data.
    if (remaining.length === lastRemaining) {
      if (++stalled > 20) break
    } else {
      stalled = 0
      lastRemaining = remaining.length
    }
  }

  return assignments
}
