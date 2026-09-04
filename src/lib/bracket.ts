import type { BracketFormat, BracketGroup, FeedOutcome } from './types'
import type { TeamRecord } from './standings'
import { compareOverall } from './standings'

/** A match as planned by the generator, before it is written to the database. */
export interface PlannedMatch {
  id: string
  bracket: BracketGroup
  round: number
  slot: number
  label: string
  bestOf: number
  homeTeamId: string | null
  awayTeamId: string | null
  homeSourceMatchId: string | null
  homeSourceOutcome: FeedOutcome | null
  awaySourceMatchId: string | null
  awaySourceOutcome: FeedOutcome | null
  homePlaceholder: string | null
  awayPlaceholder: string | null
  status: 'scheduled' | 'final'
  isBye: boolean
  winnerTeamId: string | null
  loserTeamId: string | null
}

export interface SeededTeam {
  seed: number
  teamId: string
  teamName: string
  /** e.g. "Pool A #1" -- shown in the bracket before a team is confirmed. */
  label: string
}

export interface PoolResult {
  poolName: string
  standings: TeamRecord[]
}

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : // Fallback for older runtimes; ids only need to be unique within a batch.
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
      })

export const nextPowerOfTwo = (n: number) => {
  let size = 1
  while (size < n) size *= 2
  return size
}

/**
 * Standard bracket ordering: the slot order of seeds so that #1 and #2 can
 * only meet in the final, #1 and #4 in the semifinal, and so on.
 * seedOrder(4) -> [1, 4, 2, 3], i.e. 1v4 and 2v3.
 */
export function seedOrder(size: number): number[] {
  let order = [1]
  while (order.length < size) {
    const n = order.length * 2
    const next: number[] = []
    for (const seed of order) next.push(seed, n + 1 - seed)
    order = next
  }
  return order
}

/**
 * Seed teams across pools: every pool winner outranks every pool runner-up,
 * and within a finishing position teams are ordered by their overall record.
 * This is what turns the morning's pool play into the afternoon's bracket.
 */
export function seedFromPools(pools: PoolResult[]): SeededTeam[] {
  const deepest = Math.max(0, ...pools.map((p) => p.standings.length))
  const seeded: SeededTeam[] = []

  for (let place = 0; place < deepest; place++) {
    const atThisPlace = pools
      .filter((pool) => pool.standings[place])
      .map((pool) => ({ pool, record: pool.standings[place] }))
      .sort((a, b) => compareOverall(a.record, b.record))

    for (const { pool, record } of atThisPlace) {
      seeded.push({
        seed: seeded.length + 1,
        teamId: record.teamId,
        teamName: record.teamName,
        label: `${pool.poolName} #${place + 1}`,
      })
    }
  }

  return seeded
}

function elimRoundName(roundsRemaining: number): string {
  switch (roundsRemaining) {
    case 0:
      return 'Final'
    case 1:
      return 'Semifinal'
    case 2:
      return 'Quarterfinal'
    case 3:
      return 'Round of 16'
    case 4:
      return 'Round of 32'
    default:
      return `Round of ${2 ** (roundsRemaining + 1)}`
  }
}

const shortLabel = (label: string) =>
  label
    .replace('Quarterfinal', 'QF')
    .replace('Semifinal', 'SF')
    .replace('Winners Final', 'WF')
    .replace('Losers Final', 'LF')
    .replace('Grand Final', 'GF')
    .replace('Round of ', 'R')
    .replace('Losers R', 'LR')
    .replace('Consolation R', 'CR')
    .replace('Final', 'F')

const blank = (): Omit<PlannedMatch, 'id' | 'bracket' | 'round' | 'slot' | 'label' | 'bestOf'> => ({
  homeTeamId: null,
  awayTeamId: null,
  homeSourceMatchId: null,
  homeSourceOutcome: null,
  awaySourceMatchId: null,
  awaySourceOutcome: null,
  homePlaceholder: null,
  awayPlaceholder: null,
  status: 'scheduled',
  isBye: false,
  winnerTeamId: null,
  loserTeamId: null,
})

interface Grid {
  [round: number]: PlannedMatch[]
}

/**
 * Build a single-elimination tree over `seeds`. Teams beyond the seed list are
 * byes; those matches are resolved by resolveByes() before insert.
 */
function buildElimTree(
  seeds: SeededTeam[],
  bestOf: number,
  bracket: BracketGroup,
  namer: (round: number, totalRounds: number) => string,
): { matches: PlannedMatch[]; grid: Grid } {
  const size = nextPowerOfTwo(Math.max(seeds.length, 2))
  const totalRounds = Math.log2(size)
  const order = seedOrder(size)
  const bySeed = new Map(seeds.map((s) => [s.seed, s]))
  const grid: Grid = {}
  const matches: PlannedMatch[] = []

  for (let round = 1; round <= totalRounds; round++) {
    const count = size / 2 ** round
    const roundName = namer(round, totalRounds)
    grid[round] = []

    for (let slot = 0; slot < count; slot++) {
      const match: PlannedMatch = {
        ...blank(),
        id: newId(),
        bracket,
        round,
        slot,
        label: count > 1 ? `${roundName} ${slot + 1}` : roundName,
        bestOf,
      }

      if (round === 1) {
        const home = bySeed.get(order[slot * 2])
        const away = bySeed.get(order[slot * 2 + 1])
        match.homeTeamId = home?.teamId ?? null
        match.awayTeamId = away?.teamId ?? null
        match.homePlaceholder = home?.label ?? 'Bye'
        match.awayPlaceholder = away?.label ?? 'Bye'
      } else {
        const prev = grid[round - 1]
        const homeSrc = prev[slot * 2]
        const awaySrc = prev[slot * 2 + 1]
        match.homeSourceMatchId = homeSrc.id
        match.homeSourceOutcome = 'winner'
        match.homePlaceholder = `W ${shortLabel(homeSrc.label)}`
        match.awaySourceMatchId = awaySrc.id
        match.awaySourceOutcome = 'winner'
        match.awayPlaceholder = `W ${shortLabel(awaySrc.label)}`
      }

      grid[round].push(match)
      matches.push(match)
    }
  }

  return { matches, grid }
}

/**
 * Complete every match that cannot be played because one or both sides are a
 * bye, and push the surviving team into the next round. This mirrors
 * propagate_results() in the database, which handles the same situation for
 * results entered later.
 */
export function resolveByes(matches: PlannedMatch[]): PlannedMatch[] {
  const byId = new Map(matches.map((m) => [m.id, m]))
  const dependents = new Map<string, PlannedMatch[]>()
  for (const match of matches) {
    for (const src of [match.homeSourceMatchId, match.awaySourceMatchId]) {
      if (!src) continue
      const list = dependents.get(src) ?? []
      list.push(match)
      dependents.set(src, list)
    }
  }

  const sourceIsFinal = (id: string | null) => id === null || byId.get(id)?.status === 'final'
  const slotsResolved = (m: PlannedMatch) =>
    sourceIsFinal(m.homeSourceMatchId) && sourceIsFinal(m.awaySourceMatchId)

  /**
   * Pull in *both* sides from any source that has finished, not just the one
   * that triggered this step. Two byes can feed the same match, and filling
   * only the triggering side would leave the other slot looking empty and the
   * match would be written off as a bye.
   */
  const hydrate = (m: PlannedMatch) => {
    const from = (srcId: string | null, outcome: FeedOutcome | null) => {
      if (!srcId) return undefined
      const src = byId.get(srcId)
      if (!src || src.status !== 'final') return undefined
      return outcome === 'winner' ? src.winnerTeamId : src.loserTeamId
    }
    const home = from(m.homeSourceMatchId, m.homeSourceOutcome)
    if (home !== undefined) m.homeTeamId = home
    const away = from(m.awaySourceMatchId, m.awaySourceOutcome)
    if (away !== undefined) m.awayTeamId = away
  }

  // Round 1 (and any match with no feeds) can be judged immediately.
  const queue: PlannedMatch[] = []
  for (const match of matches) {
    if (match.homeSourceMatchId || match.awaySourceMatchId) continue
    if (match.homeTeamId && match.awayTeamId) continue
    match.status = 'final'
    match.isBye = true
    match.winnerTeamId = match.homeTeamId ?? match.awayTeamId
    queue.push(match)
  }

  let guard = 0
  while (queue.length > 0 && guard++ < 1000) {
    const done = queue.shift()!
    for (const dep of dependents.get(done.id) ?? []) {
      if (dep.status === 'final') continue
      hydrate(dep)
      if (slotsResolved(dep) && (!dep.homeTeamId || !dep.awayTeamId)) {
        dep.status = 'final'
        dep.isBye = true
        dep.winnerTeamId = dep.homeTeamId ?? dep.awayTeamId
        queue.push(dep)
      }
    }
  }

  return matches
}

function buildConsolation(
  winnersRound1: PlannedMatch[],
  bestOf: number,
): PlannedMatch[] {
  const entrants = winnersRound1.length
  if (entrants < 2) return []

  const size = nextPowerOfTwo(Math.ceil(entrants / 2)) * 2
  const totalRounds = Math.log2(size)
  const matches: PlannedMatch[] = []
  const grid: Grid = {}

  for (let round = 1; round <= totalRounds; round++) {
    const count = size / 2 ** round
    const roundName =
      round === totalRounds ? 'Consolation Final' : `Consolation R${round}`
    grid[round] = []

    for (let slot = 0; slot < count; slot++) {
      const match: PlannedMatch = {
        ...blank(),
        id: newId(),
        bracket: 'consolation',
        round,
        slot,
        label: count > 1 ? `${roundName} ${slot + 1}` : roundName,
        bestOf,
      }

      if (round === 1) {
        const homeSrc = winnersRound1[slot * 2]
        const awaySrc = winnersRound1[slot * 2 + 1]
        if (homeSrc) {
          match.homeSourceMatchId = homeSrc.id
          match.homeSourceOutcome = 'loser'
          match.homePlaceholder = `L ${shortLabel(homeSrc.label)}`
        } else {
          match.homePlaceholder = 'Bye'
        }
        if (awaySrc) {
          match.awaySourceMatchId = awaySrc.id
          match.awaySourceOutcome = 'loser'
          match.awayPlaceholder = `L ${shortLabel(awaySrc.label)}`
        } else {
          match.awayPlaceholder = 'Bye'
        }
      } else {
        const prev = grid[round - 1]
        match.homeSourceMatchId = prev[slot * 2].id
        match.homeSourceOutcome = 'winner'
        match.homePlaceholder = `W ${shortLabel(prev[slot * 2].label)}`
        match.awaySourceMatchId = prev[slot * 2 + 1].id
        match.awaySourceOutcome = 'winner'
        match.awayPlaceholder = `W ${shortLabel(prev[slot * 2 + 1].label)}`
      }

      grid[round].push(match)
      matches.push(match)
    }
  }

  return matches
}

/**
 * Losers bracket for double elimination, over a winners bracket of `size`
 * (a power of two, at least 4).
 *
 * Rounds alternate: a "minor" round pairs survivors of the losers bracket
 * against each other, then a "major" round feeds in the teams just knocked out
 * of the winners bracket. Winners-bracket losers enter in reverse slot order,
 * which is the usual way to delay rematches.
 */
function buildLosersBracket(winnersGrid: Grid, size: number, bestOf: number): PlannedMatch[] {
  const k = Math.log2(size)
  const totalLoserRounds = 2 * (k - 1)
  const matches: PlannedMatch[] = []
  const grid: Grid = {}

  for (let lr = 1; lr <= totalLoserRounds; lr++) {
    const i = Math.floor(lr / 2)
    const count = lr === 1 ? size / 4 : lr % 2 === 0 ? size / 2 ** (i + 1) : size / 2 ** (i + 2)
    const isLast = lr === totalLoserRounds
    const roundName = isLast ? 'Losers Final' : `Losers R${lr}`
    grid[lr] = []

    for (let slot = 0; slot < count; slot++) {
      const match: PlannedMatch = {
        ...blank(),
        id: newId(),
        bracket: 'losers',
        round: lr,
        slot,
        label: count > 1 ? `${roundName} ${slot + 1}` : roundName,
        bestOf,
      }

      if (lr === 1) {
        const a = winnersGrid[1][slot * 2]
        const b = winnersGrid[1][slot * 2 + 1]
        match.homeSourceMatchId = a.id
        match.homeSourceOutcome = 'loser'
        match.homePlaceholder = `L ${shortLabel(a.label)}`
        match.awaySourceMatchId = b.id
        match.awaySourceOutcome = 'loser'
        match.awayPlaceholder = `L ${shortLabel(b.label)}`
      } else if (lr % 2 === 0) {
        // Major round: losers-bracket survivor vs a team dropping down.
        const prev = grid[lr - 1][slot]
        const dropRound = winnersGrid[i + 1]
        const drop = dropRound[dropRound.length - 1 - slot]
        match.homeSourceMatchId = prev.id
        match.homeSourceOutcome = 'winner'
        match.homePlaceholder = `W ${shortLabel(prev.label)}`
        match.awaySourceMatchId = drop.id
        match.awaySourceOutcome = 'loser'
        match.awayPlaceholder = `L ${shortLabel(drop.label)}`
      } else {
        const prev = grid[lr - 1]
        match.homeSourceMatchId = prev[slot * 2].id
        match.homeSourceOutcome = 'winner'
        match.homePlaceholder = `W ${shortLabel(prev[slot * 2].label)}`
        match.awaySourceMatchId = prev[slot * 2 + 1].id
        match.awaySourceOutcome = 'winner'
        match.awayPlaceholder = `W ${shortLabel(prev[slot * 2 + 1].label)}`
      }

      grid[lr].push(match)
      matches.push(match)
    }
  }

  return matches
}

export interface BracketOptions {
  seeds: SeededTeam[]
  format: BracketFormat
  bestOf: number
}

/**
 * Generate every bracket match for a division, wired together with
 * winner/loser feeds so results advance on their own.
 */
export function generateBracket({ seeds, format, bestOf }: BracketOptions): PlannedMatch[] {
  if (seeds.length < 2) return []

  const size = nextPowerOfTwo(seeds.length)
  // Double elimination needs a winners bracket of at least two rounds to have
  // a meaningful losers side; with 2 or 3 teams it collapses to single elim.
  const effectiveFormat: BracketFormat = format === 'double' && size < 4 ? 'single' : format

  const winnersNamer = (round: number, totalRounds: number) => {
    const remaining = totalRounds - round
    if (effectiveFormat === 'double' && remaining === 0) return 'Winners Final'
    return elimRoundName(remaining)
  }

  const { matches: winners, grid } = buildElimTree(seeds, bestOf, 'winners', winnersNamer)
  let all = [...winners]

  if (effectiveFormat === 'single_consolation') {
    all = all.concat(buildConsolation(grid[1], bestOf))
  }

  if (effectiveFormat === 'double') {
    const losers = buildLosersBracket(grid, size, bestOf)
    all = all.concat(losers)

    const winnersFinal = grid[Math.log2(size)][0]
    const losersFinal = losers[losers.length - 1]
    all.push({
      ...blank(),
      id: newId(),
      bracket: 'grand_final',
      round: 1,
      slot: 0,
      label: 'Grand Final',
      bestOf,
      homeSourceMatchId: winnersFinal.id,
      homeSourceOutcome: 'winner',
      homePlaceholder: `W ${shortLabel(winnersFinal.label)}`,
      awaySourceMatchId: losersFinal.id,
      awaySourceOutcome: 'winner',
      awayPlaceholder: `W ${shortLabel(losersFinal.label)}`,
    })
  }

  return resolveByes(all)
}

export const BRACKET_ORDER: BracketGroup[] = ['winners', 'losers', 'consolation', 'grand_final']

export const BRACKET_LABEL: Record<BracketGroup, string> = {
  winners: 'Championship',
  losers: 'Losers bracket',
  consolation: 'Consolation',
  grand_final: 'Grand Final',
}
