import { describe, expect, it } from 'vitest'
import { isSetComplete, setTarget, tallySets, type ScoringRules } from '../scoring'

const rules: ScoringRules = {
  pointsToWin: 25,
  decidingSetPoints: 15,
  winBy: 2,
  pointCap: null,
}
const capped: ScoringRules = { ...rules, pointCap: 27 }

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
    const t = tallySets([{ home: 25, away: 21 }, { home: 14, away: 12 }], 3, rules)
    expect(t.homeSets).toBe(1)
    expect(t.awaySets).toBe(0)
    expect(t.decidedAt).toBeNull()
  })

  it('finalizes a straight-sets win', () => {
    const t = tallySets([{ home: 25, away: 21 }, { home: 25, away: 19 }], 3, rules)
    expect([t.homeSets, t.awaySets]).toEqual([2, 0])
    expect(t.decidedAt).toBe(2)
  })

  it('finalizes a three-set win on the deciding set', () => {
    const t = tallySets(
      [{ home: 25, away: 21 }, { home: 20, away: 25 }, { home: 15, away: 11 }],
      3,
      rules,
    )
    expect([t.homeSets, t.awaySets]).toEqual([2, 1])
    expect(t.decidedAt).toBe(3)
  })

  it('flags a surplus set entered after the match was already won', () => {
    const t = tallySets(
      [{ home: 25, away: 21 }, { home: 25, away: 19 }, { home: 5, away: 3 }],
      3,
      rules,
    )
    expect(t.decidedAt).toBe(2)
    expect(t.complete[2]).toBe(false)
  })

  it('flags an unfinished set that comes before the decider', () => {
    const t = tallySets(
      [{ home: 25, away: 21 }, { home: 14, away: 12 }, { home: 25, away: 19 }],
      3,
      rules,
    )
    expect(t.decidedAt).toBe(3)
    expect(t.firstIncompleteBeforeDecider).toBe(2)
  })

  it('handles a single-set match', () => {
    const t = tallySets([{ home: 25, away: 23 }], 1, rules)
    expect(t.decidedAt).toBe(1)
    expect(t.homeSets).toBe(1)
  })

  it('reports nothing for an empty sheet', () => {
    const t = tallySets([], 3, rules)
    expect(t).toMatchObject({ homeSets: 0, awaySets: 0, decidedAt: null })
  })
})
