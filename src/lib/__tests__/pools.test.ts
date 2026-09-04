import { describe, expect, it } from 'vitest'
import {
  poolCountFor,
  poolName,
  roundRobinPairings,
  scheduleMatches,
  splitIntoPools,
} from '../pools'

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
