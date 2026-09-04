import { describe, expect, it } from 'vitest'
import {
  generateBracket,
  nextPowerOfTwo,
  seedFromPools,
  seedOrder,
  type PlannedMatch,
  type SeededTeam,
} from '../bracket'
import type { TeamRecord } from '../standings'

const seeds = (n: number): SeededTeam[] =>
  Array.from({ length: n }, (_, i) => ({
    seed: i + 1,
    teamId: `team-${i + 1}`,
    teamName: `Team ${i + 1}`,
    label: `Seed ${i + 1}`,
  }))

const record = (over: Partial<TeamRecord>): TeamRecord => ({
  teamId: 'x',
  teamName: 'X',
  played: 3,
  matchWins: 0,
  matchLosses: 0,
  matchTies: 0,
  setWins: 0,
  setLosses: 0,
  pointsFor: 0,
  pointsAgainst: 0,
  rank: 0,
  ...over,
})

/**
 * Walk the bracket the way the database does: mark a winner, push it into the
 * slots that feed from the match, and auto-complete any match left with a
 * single team.
 */
function playOut(matches: PlannedMatch[], pickWinner: (m: PlannedMatch) => string) {
  const byId = new Map(matches.map((m) => [m.id, m]))
  let progressed = true
  let guard = 0

  while (progressed && guard++ < 500) {
    progressed = false
    for (const match of matches) {
      if (match.status === 'final') continue
      if (!match.homeTeamId || !match.awayTeamId) continue
      match.winnerTeamId = pickWinner(match)
      match.loserTeamId =
        match.winnerTeamId === match.homeTeamId ? match.awayTeamId : match.homeTeamId
      match.status = 'final'
      progressed = true

      for (const dep of matches) {
        if (dep.homeSourceMatchId === match.id) {
          dep.homeTeamId =
            dep.homeSourceOutcome === 'winner' ? match.winnerTeamId : match.loserTeamId
        }
        if (dep.awaySourceMatchId === match.id) {
          dep.awayTeamId =
            dep.awaySourceOutcome === 'winner' ? match.winnerTeamId : match.loserTeamId
        }
      }
    }

    // Byes created mid-bracket (a feed whose source had no loser).
    for (const match of matches) {
      if (match.status === 'final') continue
      const homeReady =
        !match.homeSourceMatchId || byId.get(match.homeSourceMatchId)!.status === 'final'
      const awayReady =
        !match.awaySourceMatchId || byId.get(match.awaySourceMatchId)!.status === 'final'
      if (homeReady && awayReady && (!match.homeTeamId || !match.awayTeamId)) {
        match.status = 'final'
        match.isBye = true
        match.winnerTeamId = match.homeTeamId ?? match.awayTeamId
        progressed = true
      }
    }
  }
}

const higherSeedWins = (m: PlannedMatch) => {
  const num = (id: string | null) => Number(id?.split('-')[1] ?? 999)
  return num(m.homeTeamId) < num(m.awayTeamId) ? m.homeTeamId! : m.awayTeamId!
}

describe('seed ordering', () => {
  it('rounds up to a power of two', () => {
    expect([1, 2, 3, 5, 8, 9, 17].map(nextPowerOfTwo)).toEqual([1, 2, 4, 8, 8, 16, 32])
  })

  it('puts 1v4 and 2v3 in a four-team bracket', () => {
    expect(seedOrder(4)).toEqual([1, 4, 2, 3])
  })

  it('keeps 1 and 2 apart until the final', () => {
    const order = seedOrder(8)
    expect(order).toEqual([1, 8, 4, 5, 2, 7, 3, 6])
    // Seeds 1 and 2 sit in opposite halves.
    expect(order.slice(0, 4)).toContain(1)
    expect(order.slice(4)).toContain(2)
  })
})

describe('seeding from pool play', () => {
  it('ranks every pool winner above every runner-up', () => {
    const result = seedFromPools([
      {
        poolName: 'Pool A',
        standings: [
          record({ teamId: 'a1', teamName: 'A1', matchWins: 3, setWins: 6, pointsFor: 150, pointsAgainst: 100 }),
          record({ teamId: 'a2', teamName: 'A2', matchWins: 1, setWins: 3, setLosses: 4, pointsFor: 120, pointsAgainst: 130 }),
        ],
      },
      {
        poolName: 'Pool B',
        standings: [
          record({ teamId: 'b1', teamName: 'B1', matchWins: 2, matchLosses: 1, setWins: 5, setLosses: 2, pointsFor: 140, pointsAgainst: 120 }),
          record({ teamId: 'b2', teamName: 'B2', matchWins: 2, matchLosses: 1, setWins: 4, setLosses: 3, pointsFor: 135, pointsAgainst: 125 }),
        ],
      },
    ])

    expect(result.map((s) => s.teamId)).toEqual(['a1', 'b1', 'b2', 'a2'])
    expect(result.map((s) => s.seed)).toEqual([1, 2, 3, 4])
    expect(result[0].label).toBe('Pool A #1')
  })

  it('handles uneven pool sizes', () => {
    const result = seedFromPools([
      { poolName: 'Pool A', standings: [record({ teamId: 'a1', teamName: 'A1', matchWins: 3 })] },
      {
        poolName: 'Pool B',
        standings: [
          record({ teamId: 'b1', teamName: 'B1', matchWins: 2 }),
          record({ teamId: 'b2', teamName: 'B2', matchWins: 1 }),
        ],
      },
    ])
    expect(result.map((s) => s.teamId)).toEqual(['a1', 'b1', 'b2'])
  })
})

describe('single elimination', () => {
  it('builds the right number of matches', () => {
    const matches = generateBracket({ seeds: seeds(8), format: 'single', bestOf: 3 })
    expect(matches.length).toBe(7)
    expect(matches.filter((m) => m.round === 1).length).toBe(4)
    expect(matches.find((m) => m.label === 'Final')).toBeTruthy()
  })

  it('gives byes to the top seeds and advances them automatically', () => {
    const matches = generateBracket({ seeds: seeds(5), format: 'single', bestOf: 3 })
    const round1 = matches.filter((m) => m.round === 1)
    expect(round1.length).toBe(4)

    const byes = round1.filter((m) => m.isBye)
    expect(byes.length).toBe(3)
    expect(byes.map((b) => b.winnerTeamId).sort()).toEqual(['team-1', 'team-2', 'team-3'])

    // The byes already placed seeds 1-3 into the semifinals; the one real
    // first-round match (4v5) still has to be played.
    const semis = matches.filter((m) => m.round === 2)
    const placed = semis.flatMap((m) => [m.homeTeamId, m.awayTeamId]).filter(Boolean)
    expect(placed.sort()).toEqual(['team-1', 'team-2', 'team-3'])

    const contested = round1.find((m) => !m.isBye)!
    expect([contested.homeTeamId, contested.awayTeamId].sort()).toEqual(['team-4', 'team-5'])
  })

  it('crowns the top seed when the favourite always wins', () => {
    for (const n of [2, 3, 4, 5, 6, 7, 8, 11, 16]) {
      const matches = generateBracket({ seeds: seeds(n), format: 'single', bestOf: 3 })
      playOut(matches, higherSeedWins)
      const final = matches.find((m) => m.label === 'Final')!
      expect(final.winnerTeamId, `n=${n}`).toBe('team-1')
      expect(matches.every((m) => m.status === 'final')).toBe(true)
    }
  })

  it('lets an upset carry through the bracket', () => {
    const matches = generateBracket({ seeds: seeds(4), format: 'single', bestOf: 3 })
    // Seed 4 beats seed 1, then wins the final.
    playOut(matches, (m) =>
      [m.homeTeamId, m.awayTeamId].includes('team-4') ? 'team-4' : higherSeedWins(m),
    )
    expect(matches.find((m) => m.label === 'Final')!.winnerTeamId).toBe('team-4')
  })

  it('returns nothing for fewer than two teams', () => {
    expect(generateBracket({ seeds: seeds(1), format: 'single', bestOf: 3 })).toEqual([])
    expect(generateBracket({ seeds: [], format: 'single', bestOf: 3 })).toEqual([])
  })
})

describe('single elimination with consolation', () => {
  it('feeds first-round losers into a second bracket', () => {
    const matches = generateBracket({ seeds: seeds(8), format: 'single_consolation', bestOf: 3 })
    const consolation = matches.filter((m) => m.bracket === 'consolation')
    expect(consolation.length).toBe(3)

    const firstRound = consolation.filter((m) => m.round === 1)
    expect(firstRound.length).toBe(2)
    for (const m of firstRound) {
      expect(m.homeSourceOutcome).toBe('loser')
      expect(m.awaySourceOutcome).toBe('loser')
    }

    playOut(matches, higherSeedWins)
    // Losers of round 1 are seeds 5-8; the best of them wins consolation.
    expect(matches.find((m) => m.label === 'Consolation Final')!.winnerTeamId).toBe('team-5')
  })

  it('handles byes without stranding a consolation slot', () => {
    const matches = generateBracket({ seeds: seeds(6), format: 'single_consolation', bestOf: 3 })
    playOut(matches, higherSeedWins)
    expect(matches.every((m) => m.status === 'final')).toBe(true)
    expect(matches.find((m) => m.label === 'Final')!.winnerTeamId).toBe('team-1')
  })
})

describe('double elimination', () => {
  it('builds 2N-2 matches for a full bracket', () => {
    for (const n of [4, 8, 16]) {
      const matches = generateBracket({ seeds: seeds(n), format: 'double', bestOf: 3 })
      expect(matches.length, `n=${n}`).toBe(2 * n - 2)
      expect(matches.filter((m) => m.bracket === 'grand_final').length).toBe(1)
    }
  })

  it('sends every winners-bracket loser into the losers bracket', () => {
    const matches = generateBracket({ seeds: seeds(8), format: 'double', bestOf: 3 })
    const winners = matches.filter((m) => m.bracket === 'winners')
    const loserFeeds = new Set(
      matches
        .flatMap((m) => [
          m.homeSourceOutcome === 'loser' ? m.homeSourceMatchId : null,
          m.awaySourceOutcome === 'loser' ? m.awaySourceMatchId : null,
        ])
        .filter(Boolean),
    )
    for (const w of winners) expect(loserFeeds.has(w.id), `${w.label} has no drop`).toBe(true)
  })

  it('runs to a grand final between the two bracket winners', () => {
    const matches = generateBracket({ seeds: seeds(8), format: 'double', bestOf: 3 })
    playOut(matches, higherSeedWins)

    const grandFinal = matches.find((m) => m.bracket === 'grand_final')!
    expect(grandFinal.status).toBe('final')
    expect(grandFinal.winnerTeamId).toBe('team-1')
    // Seed 2 lost only to seed 1, so it comes back through the losers bracket.
    expect(grandFinal.awayTeamId).toBe('team-2')
    expect(matches.every((m) => m.status === 'final')).toBe(true)
  })

  it('completes with a non-power-of-two field', () => {
    for (const n of [3, 5, 6, 7, 9, 12]) {
      const matches = generateBracket({ seeds: seeds(n), format: 'double', bestOf: 3 })
      playOut(matches, higherSeedWins)
      const unfinished = matches.filter((m) => m.status !== 'final')
      expect(unfinished.map((m) => m.label), `n=${n}`).toEqual([])
      expect(matches.find((m) => m.bracket === 'grand_final')!.winnerTeamId, `n=${n}`).toBe('team-1')
    }
  })

  it('collapses to single elimination when only two teams entered', () => {
    const matches = generateBracket({ seeds: seeds(2), format: 'double', bestOf: 3 })
    expect(matches.some((m) => m.bracket === 'losers')).toBe(false)
    expect(matches.length).toBe(1)

    // Three teams still round up to a four-team bracket, so the losers side is real.
    const three = generateBracket({ seeds: seeds(3), format: 'double', bestOf: 3 })
    expect(three.some((m) => m.bracket === 'losers')).toBe(true)
  })

  it('gives a team two lives', () => {
    const matches = generateBracket({ seeds: seeds(4), format: 'double', bestOf: 3 })
    // Seed 4 loses its opener but wins everything after.
    let firstLossTaken = false
    playOut(matches, (m) => {
      const has4 = [m.homeTeamId, m.awayTeamId].includes('team-4')
      if (has4 && !firstLossTaken) {
        firstLossTaken = true
        return m.homeTeamId === 'team-4' ? m.awayTeamId! : m.homeTeamId!
      }
      return has4 ? 'team-4' : higherSeedWins(m)
    })
    expect(matches.find((m) => m.bracket === 'grand_final')!.winnerTeamId).toBe('team-4')
  })
})
