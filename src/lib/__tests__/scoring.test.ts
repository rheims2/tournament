import { describe, expect, it } from 'vitest'
import {
  isSetComplete,
  poolScoringMode,
  rulesFor,
  setTarget,
  tallySets,
  type MatchFormat,
  type ScoringRules,
} from '../scoring'

const rules: ScoringRules = {
  pointsToWin: 25,
  decidingSetPoints: 15,
  winBy: 2,
  pointCap: null,
  startScore: 0,
}
const capped: ScoringRules = { ...rules, pointCap: 27 }

/** Conventional best-of-N. */
const bestOf = (n: number): MatchFormat => ({ setsToPlay: null, bestOf: n })
/** Play exactly N sets, whatever the score. */
const fixed = (n: number): MatchFormat => ({ setsToPlay: n, bestOf: n })

describe('set targets', () => {
  it('drops to the deciding-set target for the last set', () => {
    expect(setTarget(1, 3, rules)).toBe(25)
    expect(setTarget(3, 3, rules)).toBe(15)
    expect(setTarget(5, 5, rules)).toBe(15)
    expect(setTarget(3, 5, rules)).toBe(25)
  })

  it('uses the normal target for a single-set match', () => {
    expect(setTarget(1, 1, rules)).toBe(25)
  })
})

describe('set completion', () => {
  it('treats a running score as unfinished', () => {
    expect(isSetComplete(14, 12, 1, 3, rules)).toBe(false)
    expect(isSetComplete(0, 0, 1, 3, rules)).toBe(false)
    expect(isSetComplete(24, 20, 1, 3, rules)).toBe(false)
  })

  it('accepts a set won at the target', () => {
    expect(isSetComplete(25, 20, 1, 3, rules)).toBe(true)
    expect(isSetComplete(20, 25, 1, 3, rules)).toBe(true)
  })

  it('requires the win-by margin', () => {
    expect(isSetComplete(25, 24, 1, 3, rules)).toBe(false)
    expect(isSetComplete(26, 24, 1, 3, rules)).toBe(true)
    expect(isSetComplete(30, 28, 1, 3, rules)).toBe(true)
  })

  it('ends the set at a hard cap even without the margin', () => {
    expect(isSetComplete(27, 26, 1, 3, capped)).toBe(true)
    expect(isSetComplete(26, 25, 1, 3, capped)).toBe(false)
  })

  it('uses the lower target in a deciding set', () => {
    expect(isSetComplete(15, 12, 3, 3, rules)).toBe(true)
    expect(isSetComplete(15, 12, 1, 3, rules)).toBe(false)
  })

  it('never completes a tied set', () => {
    expect(isSetComplete(25, 25, 1, 3, rules)).toBe(false)
  })
})

describe('match tally', () => {
  it('does not finalize on an in-progress second set', () => {
    const t = tallySets([{ home: 25, away: 21 }, { home: 14, away: 12 }], bestOf(3), rules)
    expect(t.homeSets).toBe(1)
    expect(t.awaySets).toBe(0)
    expect(t.decidedAt).toBeNull()
  })

  it('finalizes a straight-sets win', () => {
    const t = tallySets([{ home: 25, away: 21 }, { home: 25, away: 19 }], bestOf(3), rules)
    expect([t.homeSets, t.awaySets]).toEqual([2, 0])
    expect(t.decidedAt).toBe(2)
  })

  it('finalizes a three-set win on the deciding set', () => {
    const t = tallySets(
      [{ home: 25, away: 21 }, { home: 20, away: 25 }, { home: 15, away: 11 }],
      bestOf(3),
      rules,
    )
    expect([t.homeSets, t.awaySets]).toEqual([2, 1])
    expect(t.decidedAt).toBe(3)
  })

  it('flags a surplus set entered after the match was already won', () => {
    const t = tallySets(
      [{ home: 25, away: 21 }, { home: 25, away: 19 }, { home: 5, away: 3 }],
      bestOf(3),
      rules,
    )
    expect(t.decidedAt).toBe(2)
    expect(t.complete[2]).toBe(false)
  })

  it('flags an unfinished set that comes before the decider', () => {
    const t = tallySets(
      [{ home: 25, away: 21 }, { home: 14, away: 12 }, { home: 25, away: 19 }],
      bestOf(3),
      rules,
    )
    expect(t.decidedAt).toBe(3)
    expect(t.firstIncompleteBeforeDecider).toBe(2)
  })

  it('handles a single-set match', () => {
    const t = tallySets([{ home: 25, away: 23 }], bestOf(1), rules)
    expect(t.decidedAt).toBe(1)
    expect(t.homeSets).toBe(1)
  })

  it('reports nothing for an empty sheet', () => {
    const t = tallySets([], bestOf(3), rules)
    expect(t).toMatchObject({ homeSets: 0, awaySets: 0, decidedAt: null })
  })
})

describe('fixed-set matches', () => {
  // The tournament format: two sets to 25, both played out, teams start 4-4.
  const twoTo25: ScoringRules = { ...rules, decidingSetPoints: 25, startScore: 4 }

  it('does not finish after one set even when a side is ahead', () => {
    const t = tallySets([{ home: 25, away: 18 }], fixed(2), twoTo25)
    expect(t.homeSets).toBe(1)
    expect(t.decidedAt).toBeNull()
    expect(t.setsRemaining).toBe(1)
  })

  it('finishes once both sets are played', () => {
    const t = tallySets([{ home: 25, away: 18 }, { home: 25, away: 20 }], fixed(2), twoTo25)
    expect(t.decidedAt).toBe(2)
    expect(t.isDraw).toBe(false)
    expect(t.setsRemaining).toBe(0)
  })

  it('allows a 1-1 draw', () => {
    const t = tallySets([{ home: 25, away: 18 }, { home: 21, away: 25 }], fixed(2), twoTo25)
    expect([t.homeSets, t.awaySets]).toEqual([1, 1])
    expect(t.decidedAt).toBe(2)
    expect(t.isDraw).toBe(true)
  })

  it('plays the third set of a three-set pool match even at 2-0', () => {
    // A best-of-3 would stop here; a fixed three-set match does not.
    const twoNil = tallySets([{ home: 25, away: 18 }, { home: 25, away: 20 }], fixed(3), twoTo25)
    expect(twoNil.decidedAt).toBeNull()
    expect(twoNil.setsRemaining).toBe(1)

    const all = tallySets(
      [{ home: 25, away: 18 }, { home: 25, away: 20 }, { home: 19, away: 25 }],
      fixed(3),
      twoTo25,
    )
    expect([all.homeSets, all.awaySets]).toEqual([2, 1])
    expect(all.decidedAt).toBe(3)
    expect(all.isDraw).toBe(false)
  })

  it('never draws an odd fixed-set match', () => {
    const t = tallySets(
      [{ home: 25, away: 18 }, { home: 19, away: 25 }, { home: 25, away: 23 }],
      fixed(3),
      twoTo25,
    )
    expect(t.isDraw).toBe(false)
    expect(t.homeSets).toBe(2)
  })

  it('plays every set to the same target -- no shortened decider', () => {
    // 15-11 would end a best-of-3 decider, but here the target is 25.
    const t = tallySets([{ home: 25, away: 18 }, { home: 15, away: 11 }], fixed(2), twoTo25)
    expect(t.awaySets + t.homeSets).toBe(1)
    expect(t.decidedAt).toBeNull()
  })

  it('still rejects an unfinished set before the last one', () => {
    const t = tallySets([{ home: 14, away: 12 }, { home: 25, away: 20 }], fixed(2), twoTo25)
    expect(t.firstIncompleteBeforeDecider).toBeNull()
    expect(t.decidedAt).toBeNull() // only one completed set of two
  })
})

describe('a division row from before the fixed-set migration', () => {
  // Only the columns migration 0001 created. A deploy can reach browsers
  // before its migration runs, and pool scoring must not silently loosen.
  const legacy = {
    points_to_win: 25,
    deciding_set_points: 15,
    win_by: 2,
    point_cap: null,
  } as unknown as Parameters<typeof rulesFor>[0]

  it('falls back to the division target instead of undefined', () => {
    const r = rulesFor(legacy, 'pool')
    expect(r.pointsToWin).toBe(25)
    expect(r.decidingSetPoints).toBe(15)
    expect(r.startScore).toBe(0)
  })

  it('still refuses to call 5-3 a completed set', () => {
    expect(isSetComplete(5, 3, 1, 3, rulesFor(legacy, 'pool'))).toBe(false)
    expect(isSetComplete(25, 20, 1, 3, rulesFor(legacy, 'pool'))).toBe(true)
  })

  it('treats a missing mode as best-of', () => {
    expect(poolScoringMode(legacy)).toBe('best_of')
  })
})
