import type { Division } from './types'

export interface ScoringRules {
  pointsToWin: number
  decidingSetPoints: number
  winBy: number
  /** Hard cap: at this score the set ends even without the win-by margin. */
  pointCap: number | null
}

export const rulesFor = (division: Division): ScoringRules => ({
  pointsToWin: division.points_to_win,
  decidingSetPoints: division.deciding_set_points,
  winBy: division.win_by,
  pointCap: division.point_cap,
})

/** The deciding set of a best-of-3 or best-of-5 is played to a lower target. */
export function setTarget(setNumber: number, bestOf: number, rules: ScoringRules): number {
  return bestOf > 1 && setNumber === bestOf ? rules.decidingSetPoints : rules.pointsToWin
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
  bestOf: number,
  rules: ScoringRules,
): boolean {
  const high = Math.max(home, away)
  const low = Math.min(home, away)
  if (high === low) return false
  if (high < setTarget(setNumber, bestOf, rules)) return false
  if (rules.pointCap !== null && high >= rules.pointCap) return true
  return high - low >= rules.winBy
}

export const setsNeeded = (bestOf: number) => Math.floor(bestOf / 2) + 1

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
   * 1-based index of the set that clinched the match, or null if no one has
   * won enough sets yet. Sets after it are surplus and are discarded on save.
   */
  decidedAt: number | null
  /** A set before the decider that was left unfinished -- a data-entry slip. */
  firstIncompleteBeforeDecider: number | null
}

/** Count completed set wins and work out whether the match is over. */
export function tallySets(sets: SetInput[], bestOf: number, rules: ScoringRules): Tally {
  const needed = setsNeeded(bestOf)
  const complete: boolean[] = []
  let homeSets = 0
  let awaySets = 0
  let decidedAt: number | null = null

  sets.forEach((set, index) => {
    const done = isSetComplete(set.home, set.away, index + 1, bestOf, rules)
    complete.push(done)
    if (!done) return
    if (set.home > set.away) homeSets += 1
    else awaySets += 1
    if (decidedAt === null && (homeSets >= needed || awaySets >= needed)) {
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

  return { homeSets, awaySets, complete, decidedAt, firstIncompleteBeforeDecider }
}
