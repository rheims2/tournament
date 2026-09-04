import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SETS_BY_POOL_SIZE,
  planPoolMatches,
  poolCountFor,
  poolName,
  roundRobinPairings,
  scheduleMatches,
  setsForPoolSize,
  splitIntoPools,
} from '../pools'
import type { Team } from '../types'

describe('pool division', () => {
  it('never puts more than the max in a pool', () => {
    for (let teams = 1; teams <= 40; teams++) {
      const pools = splitIntoPools(
        Array.from({ length: teams }, (_, i) => `t${i}`),
        4,
      )
      expect(pools.length).toBe(poolCountFor(teams, 4))
      for (const pool of pools) expect(pool.length).toBeLessThanOrEqual(4)
      expect(pools.flat().length).toBe(teams)
      expect(new Set(pools.flat()).size).toBe(teams)
    }
  })

  it('keeps pool sizes within one of each other', () => {
    const pools = splitIntoPools(Array.from({ length: 10 }, (_, i) => i), 4)
    const sizes = pools.map((p) => p.length).sort()
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1)
    expect(sizes).toEqual([3, 3, 4])
  })

  it('snakes the strongest teams apart', () => {
    // Teams listed strongest first: the top 3 must land in different pools.
    const pools = splitIntoPools(['s1', 's2', 's3', 's4', 's5', 's6'], 2)
    expect(pools.length).toBe(3)
    expect(pools.map((p) => p[0])).toEqual(['s1', 's2', 's3'])
    // ...and the snake reverses, so the strongest pool gets the weakest partner.
    expect(pools[0]).toEqual(['s1', 's6'])
  })

  it('names pools A, B, C', () => {
    expect([0, 1, 25, 26].map(poolName)).toEqual(['A', 'B', 'Z', 'AA'])
  })
})

describe('round robin', () => {
  it('has every team play every other team exactly once', () => {
    for (const size of [2, 3, 4, 5, 6]) {
      const ids = Array.from({ length: size }, (_, i) => `t${i}`)
      const pairings = roundRobinPairings(ids)
      expect(pairings.length).toBe((size * (size - 1)) / 2)

      const seen = new Set(pairings.map((p) => [p.home, p.away].sort().join('|')))
      expect(seen.size).toBe(pairings.length)
    }
  })

  it('never schedules a team twice in the same round', () => {
    const pairings = roundRobinPairings(['a', 'b', 'c', 'd'])
    const byRound = new Map<number, string[]>()
    for (const p of pairings) {
      const list = byRound.get(p.round) ?? []
      list.push(p.home, p.away)
      byRound.set(p.round, list)
    }
    for (const teams of byRound.values()) {
      expect(new Set(teams).size).toBe(teams.length)
    }
  })

  it('produces 6 games for a pool of 4 and 3 for a pool of 3', () => {
    expect(roundRobinPairings(['a', 'b', 'c', 'd']).length).toBe(6)
    expect(roundRobinPairings(['a', 'b', 'c']).length).toBe(3)
    expect(roundRobinPairings(['a']).length).toBe(0)
  })
})

describe('scheduling', () => {
  const start = new Date('2026-05-02T08:00:00.000Z')

  it('places every match and never double-books a team or a court', () => {
    const matches = [
      { id: 'm1', round: 1, teamIds: ['a', 'b'] },
      { id: 'm2', round: 1, teamIds: ['c', 'd'] },
      { id: 'm3', round: 2, teamIds: ['a', 'c'] },
      { id: 'm4', round: 2, teamIds: ['b', 'd'] },
    ]
    const slots = scheduleMatches(matches, {
      courts: ['1', '2'],
      startAt: start,
      minutesPerSlot: 45,
    })

    expect(slots.length).toBe(4)
    const byTime = new Map<string, typeof slots>()
    for (const slot of slots) {
      const list = byTime.get(slot.scheduledAt) ?? []
      list.push(slot)
      byTime.set(slot.scheduledAt, list)
    }
    for (const group of byTime.values()) {
      expect(new Set(group.map((g) => g.court)).size).toBe(group.length)
      const teams = group.flatMap((g) => matches.find((m) => m.id === g.matchId)!.teamIds)
      expect(new Set(teams).size).toBe(teams.length)
    }
  })

  it('spills onto later time slots when courts run out', () => {
    const matches = Array.from({ length: 5 }, (_, i) => ({
      id: `m${i}`,
      round: 1,
      teamIds: [`h${i}`, `a${i}`],
    }))
    const slots = scheduleMatches(matches, {
      courts: ['1', '2'],
      startAt: start,
      minutesPerSlot: 30,
    })
    expect(slots.length).toBe(5)
    expect(new Set(slots.map((s) => s.scheduledAt)).size).toBe(3)
  })

  it('returns nothing when there are no courts', () => {
    expect(
      scheduleMatches([{ id: 'm', round: 1, teamIds: ['a', 'b'] }], {
        courts: [],
        startAt: start,
        minutesPerSlot: 30,
      }),
    ).toEqual([])
  })
})

describe('sets per pool size', () => {
  it('gives a 4-team pool 2 sets and a 3-team pool 3', () => {
    expect(setsForPoolSize(4)).toBe(2)
    expect(setsForPoolSize(3)).toBe(3)
  })

  it('honours a custom map', () => {
    expect(setsForPoolSize(4, { '3': 3, '4': 1 })).toBe(1)
  })

  it('falls back to the nearest smaller size for an unlisted pool', () => {
    // 8 is not listed, so it takes the rule for the largest listed size (6).
    expect(setsForPoolSize(8, DEFAULT_SETS_BY_POOL_SIZE)).toBe(2)
    // 1 is below everything listed, so it takes the smallest entry.
    expect(setsForPoolSize(1, { '3': 3, '4': 2 })).toBe(3)
  })

  it('keeps total sets per team comparable across pool sizes', () => {
    // A 4-team pool: 3 matches each x 2 sets = 6. A 3-team pool: 2 x 3 = 6.
    const four = (4 - 1) * setsForPoolSize(4)
    const three = (3 - 1) * setsForPoolSize(3)
    expect(four).toBe(6)
    expect(three).toBe(6)
  })
})

describe('planning fixed-set pool matches', () => {
  const teams = (n: number): Team[] =>
    Array.from({ length: n }, (_, i) => ({
      id: `t${i}`,
      division_id: 'd',
      pool_id: 'p',
      name: `T${i}`,
      club: null,
      bracket_seed: null,
      created_at: '',
    }))

  it('stamps the fixed set count on every match in the pool', () => {
    const planned = planPoolMatches({ id: 'p', name: 'A' }, teams(4), 3, 2)
    expect(planned.length).toBe(6)
    for (const m of planned) {
      expect(m.setsToPlay).toBe(2)
      // best_of doubles as the ceiling on sets, so it must match.
      expect(m.bestOf).toBe(2)
    }
  })

  it('leaves best-of matches unmarked', () => {
    const planned = planPoolMatches({ id: 'p', name: 'A' }, teams(3), 3)
    expect(planned.every((m) => m.setsToPlay === null)).toBe(true)
    expect(planned.every((m) => m.bestOf === 3)).toBe(true)
  })
})
