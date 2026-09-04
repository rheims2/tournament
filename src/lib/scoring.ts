import type { Division, MatchPhase, PoolScoringMode } from './types'

export interface ScoringRules {
  pointsToWin: number
  decidingSetPoints: number
  winBy: number
  /** Hard cap: at this score the set ends even without the win-by margin. */
  pointCap: number | null
  /** Points both teams begin a set with, e.g. 4 for a "start at 4" format. */
  startScore: number
}

/**
 * Pool play and bracket play can score differently: pools may run a shorter
 * target, a head start, and a fixed number of sets, while the bracket stays a
 * conventional best-of.
 */
export function rulesFor(division: Division, phase: MatchPhase = 'bracket'): ScoringRules {
  if (phase === 'pool') {
    const fixed = division.pool_scoring_mode === 'fixed_sets'
    // Fall back to the division-wide values when the pool columns are absent.
    // A deployment can reach browsers before its migration has been run, and a
    // missing target would otherwise make any 2-point gap look like a won set.
    const target = division.pool_points_to_win ?? division.points_to_win
    return {
      pointsToWin: target,
      // Every set of a fixed-set match is played to the same number; there is
      // no shortened deciding set because nothing is "deciding".
      decidingSetPoints: fixed ? target : division.deciding_set_points,
      winBy: division.win_by,
      pointCap: division.point_cap,
      startScore: division.pool_start_score ?? 0,
    }
  }
  return {
    pointsToWin: division.points_to_win,
    decidingSetPoints: division.deciding_set_points,
    winBy: division.win_by,
    pointCap: division.point_cap,
    startScore: 0,
  }
}

export const poolScoringMode = (division: Division): PoolScoringMode =>
  division.pool_scoring_mode ?? 'best_of'

/** The deciding set of a best-of-3 or best-of-5 is played to a lower target. */
export function setTarget(setNumber: number, maxSets: number, rules: ScoringRules): number {
  return maxSets > 1 && setNumber === maxSets ? rules.decidingSetPoints : rules.pointsToWin
}

/**
 * Has this set actually been won? A running score like 14-12 has not: the
 * leader must reach the target and be ahead by the win-by margin (or the hard
 * cap must have been hit).
 */
export function isSetComplete(
  home: number,
  away: number,
  setNumber: number,
  maxSets: number,
  rules: ScoringRules,
): boolean {
  const high = Math.max(home, away)
  const low = Math.min(home, away)
  if (high === low) return false
  if (high < setTarget(setNumber, maxSets, rules)) return false
  if (rules.pointCap !== null && high >= rules.pointCap) return true
  return high - low >= rules.winBy
}

export const setsNeeded = (bestOf: number) => Math.floor(bestOf / 2) + 1

/**
 * How a match is scored.
 *
 * best_of    -- stop the moment one side clinches; there is always a winner
 * fixed_sets -- play every set; an even count can finish level with no winner
 */
export interface MatchFormat {
  /** Sets to play in full, or null for best-of. */
  setsToPlay: number | null
  /** Upper bound on sets, and the best-of number when setsToPlay is null. */
  bestOf: number
}

export const formatFor = (match: { best_of: number; sets_to_play: number | null }): MatchFormat => ({
  setsToPlay: match.sets_to_play,
  bestOf: match.best_of,
})

/** Total sets this match can run to. */
export const maxSetsOf = (format: MatchFormat) => format.setsToPlay ?? format.bestOf

/** True when the match plays every set out rather than stopping at a clincher. */
export const isFixedSets = (format: MatchFormat) => format.setsToPlay !== null

export interface SetInput {
  home: number
  away: number
}

export interface Tally {
  homeSets: number
  awaySets: number
  /** Per-set completeness, aligned with the input array. */
  complete: boolean[]
  /**
   * 1-based index of the set that settled the match -- the clincher in a
   * best-of, the last set in a fixed-set match -- or null while it is still
   * live. In a best-of, sets after it are surplus and dropped on save.
   */
  decidedAt: number | null
  /** A set before the decider that was left unfinished -- a data-entry slip. */
  firstIncompleteBeforeDecider: number | null
  /** A fixed-set match that finished level. Never true for a best-of. */
  isDraw: boolean
  /** Sets still to be played before the match can be finalized. */
  setsRemaining: number
}

/** Count completed set wins and work out whether the match is over. */
export function tallySets(sets: SetInput[], format: MatchFormat, rules: ScoringRules): Tally {
  const maxSets = maxSetsOf(format)
  const fixed = isFixedSets(format)
  const needed = setsNeeded(format.bestOf)
  const complete: boolean[] = []
  let homeSets = 0
  let awaySets = 0
  let decidedAt: number | null = null

  sets.forEach((set, index) => {
    const done = isSetComplete(set.home, set.away, index + 1, maxSets, rules)
    complete.push(done)
    if (!done) return
    if (set.home > set.away) homeSets += 1
    else awaySets += 1
    if (decidedAt !== null) return

    if (fixed) {
      // Over only once every set has actually been played.
      if (homeSets + awaySets >= maxSets) decidedAt = index + 1
    } else if (homeSets >= needed || awaySets >= needed) {
      decidedAt = index + 1
    }
  })

  let firstIncompleteBeforeDecider: number | null = null
  if (decidedAt !== null) {
    for (let i = 0; i < decidedAt; i++) {
      if (!complete[i]) {
        firstIncompleteBeforeDecider = i + 1
        break
      }
    }
  }

  return {
    homeSets,
    awaySets,
    complete,
    decidedAt,
    firstIncompleteBeforeDecider,
    isDraw: decidedAt !== null && homeSets === awaySets,
    setsRemaining: fixed ? Math.max(0, maxSets - (homeSets + awaySets)) : 0,
  }
}
