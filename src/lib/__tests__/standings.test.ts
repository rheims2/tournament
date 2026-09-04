import { describe, expect, it } from 'vitest'
import { buildRecords, compareFixedSets, headToHead, rankPool } from '../standings'
import type { Match, MatchSet, Team } from '../../lib/types'

const team = (id: string, name = id.toUpperCase()): Team => ({
  id,
  division_id: 'd',
  pool_id: 'p',
  name,
  club: null,
  bracket_seed: null,
  created_at: '',
})

let counter = 0

/** A finished pool match with the given set scores. */
function match(home: string, away: string, sets: [number, number][]): {
  match: Match
  sets: MatchSet[]
} {
  const id = `m${counter++}`
  let homeSets = 0
  let awaySets = 0
  for (const [h, a] of sets) {
    if (h > a) homeSets++
    else if (a > h) awaySets++
  }
  return {
    match: {
      id,
      division_id: 'd',
      phase: 'pool',
      pool_id: 'p',
      bracket: null,
      round: 1,
      slot: 0,
      label: null,
      home_team_id: home,
      away_team_id: away,
      home_source_match_id: null,
      home_source_outcome: null,
      away_source_match_id: null,
      away_source_outcome: null,
      home_placeholder: null,
      away_placeholder: null,
      best_of: 3,
      sets_to_play: null,
      court: null,
      scheduled_at: null,
      status: 'final',
      is_bye: false,
      home_sets_won: homeSets,
      away_sets_won: awaySets,
      winner_team_id: homeSets > awaySets ? home : away,
      loser_team_id: homeSets > awaySets ? away : home,
      created_at: '',
      updated_at: '',
    },
    sets: sets.map(([h, a], i) => ({
      id: `${id}s${i}`,
      match_id: id,
      set_number: i + 1,
      home_score: h,
      away_score: a,
    })),
  }
}

/** A fixed-set match: every set played, winner is whoever took more. */
function fixedMatch(home: string, away: string, sets: [number, number][], setsToPlay = 2) {
  const built = match(home, away, sets)
  built.match.sets_to_play = setsToPlay
  built.match.best_of = setsToPlay
  const hs = built.match.home_sets_won
  const as = built.match.away_sets_won
  built.match.winner_team_id = hs === as ? null : hs > as ? home : away
  built.match.loser_team_id = hs === as ? null : hs > as ? away : home
  return built
}

function fixture(results: ReturnType<typeof match>[]) {
  return {
    matches: results.map((r) => r.match),
    setsByMatch: new Map(results.map((r) => [r.match.id, r.sets])),
  }
}

describe('records', () => {
  it('accumulates wins, sets and points from both sides', () => {
    const { matches, setsByMatch } = fixture([match('a', 'b', [[25, 20], [25, 22]])])
    const records = buildRecords([team('a'), team('b')], matches, setsByMatch)

    const a = records.get('a')!
    expect(a).toMatchObject({ played: 1, matchWins: 1, matchLosses: 0, setWins: 2, setLosses: 0 })
    expect(a.pointsFor).toBe(50)
    expect(a.pointsAgainst).toBe(42)

    const b = records.get('b')!
    expect(b).toMatchObject({ played: 1, matchWins: 0, matchLosses: 1, setWins: 0, setLosses: 2 })
    expect(b.pointsFor).toBe(42)
  })

  it('ignores matches that are not final', () => {
    const { matches, setsByMatch } = fixture([match('a', 'b', [[25, 20]])])
    matches[0].status = 'in_progress'
    const records = buildRecords([team('a'), team('b')], matches, setsByMatch)
    expect(records.get('a')!.played).toBe(0)
  })

  it('ignores byes', () => {
    const { matches, setsByMatch } = fixture([match('a', 'b', [[25, 0]])])
    matches[0].is_bye = true
    expect(buildRecords([team('a'), team('b')], matches, setsByMatch).get('a')!.played).toBe(0)
  })
})

describe('tiebreakers', () => {
  it('orders by match wins first', () => {
    const { matches, setsByMatch } = fixture([
      match('a', 'b', [[25, 10], [25, 10]]),
      match('a', 'c', [[25, 10], [25, 10]]),
      match('b', 'c', [[25, 23], [25, 23]]),
    ])
    const ranked = rankPool([team('a'), team('b'), team('c')], matches, setsByMatch)
    expect(ranked.map((r) => r.teamId)).toEqual(['a', 'b', 'c'])
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3])
  })

  it('breaks a two-way tie on head-to-head, even against a worse point ratio', () => {
    const { matches, setsByMatch } = fixture([
      // A and B both go 1-1. B blew out C; A beat B.
      match('a', 'b', [[25, 23], [25, 23]]),
      match('b', 'c', [[25, 5], [25, 5]]),
      match('c', 'a', [[25, 20], [25, 20]]),
    ])
    const ranked = rankPool([team('a'), team('b'), team('c')], matches, setsByMatch)
    // All three are 1-1, so this is a three-way tie -> ratios decide, not H2H.
    expect(ranked.length).toBe(3)
    expect(ranked[0].teamId).toBe('b')

    // Now make it a genuine two-way tie: C loses both.
    const two = fixture([
      match('a', 'b', [[25, 23], [25, 23]]),
      match('a', 'c', [[25, 23], [23, 25], [15, 13]]),
      match('b', 'c', [[25, 5], [25, 5]]),
    ])
    const ranked2 = rankPool([team('a'), team('b'), team('c')], two.matches, two.setsByMatch)
    expect(ranked2.map((r) => r.teamId)).toEqual(['a', 'b', 'c'])
  })

  it('falls back to set ratio then point ratio in a three-way tie', () => {
    const { matches, setsByMatch } = fixture([
      match('a', 'b', [[25, 20], [25, 20]]), // a 2-0
      match('b', 'c', [[25, 20], [25, 20]]), // b 2-0
      match('c', 'a', [[25, 20], [25, 20]]), // c 2-0
    ])
    const ranked = rankPool([team('a'), team('b'), team('c')], matches, setsByMatch)
    // Perfectly symmetric: every measure ties, so it settles on team name.
    expect(ranked.map((r) => r.teamId)).toEqual(['a', 'b', 'c'])
    expect(new Set(ranked.map((r) => r.rank)).size).toBe(3)
  })

  it('separates equal records on point differential', () => {
    const { matches, setsByMatch } = fixture([
      match('a', 'b', [[25, 10], [25, 10]]),
      match('c', 'd', [[25, 23], [25, 23]]),
      match('a', 'c', [[25, 23], [23, 25], [15, 13]]),
      match('b', 'd', [[25, 23], [23, 25], [15, 13]]),
      match('a', 'd', [[25, 20], [25, 20]]),
      match('b', 'c', [[20, 25], [20, 25]]),
    ])
    const ranked = rankPool(
      [team('a'), team('b'), team('c'), team('d')],
      matches,
      setsByMatch,
    )
    expect(ranked[0].teamId).toBe('a')
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3, 4])
  })

  it('ranks teams that have not played yet without crashing', () => {
    const ranked = rankPool([team('a'), team('b')], [], new Map())
    expect(ranked.map((r) => r.teamId)).toEqual(['a', 'b'])
    expect(ranked.every((r) => r.played === 0)).toBe(true)
  })
})

describe('head to head', () => {
  it('returns 0 when the teams never met', () => {
    const { matches, setsByMatch } = fixture([match('a', 'b', [[25, 20], [25, 20]])])
    expect(headToHead('a', 'c', matches, setsByMatch)).toBe(0)
  })

  it('prefers the winner regardless of listed side', () => {
    const { matches, setsByMatch } = fixture([match('b', 'a', [[20, 25], [20, 25]])])
    expect(headToHead('a', 'b', matches, setsByMatch)).toBeLessThan(0)
    expect(headToHead('b', 'a', matches, setsByMatch)).toBeGreaterThan(0)
  })
})

describe('fixed-set pools', () => {
  it('records a 1-1 split as a draw for both teams', () => {
    const { matches, setsByMatch } = fixture([fixedMatch('a', 'b', [[25, 20], [22, 25]])])
    const records = buildRecords([team('a'), team('b')], matches, setsByMatch)

    for (const id of ['a', 'b']) {
      expect(records.get(id)).toMatchObject({
        played: 1,
        matchWins: 0,
        matchLosses: 0,
        matchTies: 1,
        setWins: 1,
        setLosses: 1,
      })
    }
  })

  it('ranks on sets won, not match wins', () => {
    // "a" draws both its matches but banks 2 sets.
    // "b" wins one match 2-0 and loses one 0-2, so also 2 sets -- separated on points.
    const { matches, setsByMatch } = fixture([
      fixedMatch('a', 'b', [[25, 20], [20, 25]]),
      fixedMatch('a', 'c', [[25, 20], [20, 25]]),
      fixedMatch('b', 'c', [[25, 5], [25, 5]]),
    ])
    const ranked = rankPool(
      [team('a'), team('b'), team('c')],
      matches,
      setsByMatch,
      'fixed_sets',
    )

    expect(ranked.map((r) => [r.teamName, r.setWins])).toEqual([
      ['B', 3],
      ['A', 2],
      ['C', 1],
    ])
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3])
  })

  it('puts a team with more sets ahead of one with more match wins', () => {
    // Three-set pool matches. "a" loses all three but takes a set each time;
    // "b" wins one match yet gets swept in the other two. Ranked on match
    // wins b would be ahead; ranked on sets banked, a is.
    const loseNarrowly: [number, number][] = [[25, 20], [20, 25], [20, 25]]
    const swept: [number, number][] = [[20, 25], [20, 25], [20, 25]]

    const { matches, setsByMatch } = fixture([
      fixedMatch('a', 'b', loseNarrowly, 3),
      fixedMatch('a', 'c', loseNarrowly, 3),
      fixedMatch('a', 'd', loseNarrowly, 3),
      fixedMatch('b', 'c', swept, 3),
      fixedMatch('b', 'd', swept, 3),
      fixedMatch('c', 'd', [[25, 20], [20, 25], [25, 20]], 3),
    ])
    const ranked = rankPool(
      [team('a'), team('b'), team('c'), team('d')],
      matches,
      setsByMatch,
      'fixed_sets',
    )
    const a = ranked.find((r) => r.teamId === 'a')!
    const b = ranked.find((r) => r.teamId === 'b')!

    expect([a.matchWins, a.setWins]).toEqual([0, 3])
    expect([b.matchWins, b.setWins]).toEqual([1, 2])
    expect(a.rank).toBeLessThan(b.rank)
  })

  it('breaks a sets tie on point differential', () => {
    const both = compareFixedSets(
      { teamId: 'a', teamName: 'A', played: 2, matchWins: 1, matchLosses: 1, matchTies: 0, setWins: 2, setLosses: 2, pointsFor: 100, pointsAgainst: 80, rank: 0 },
      { teamId: 'b', teamName: 'B', played: 2, matchWins: 1, matchLosses: 1, matchTies: 0, setWins: 2, setLosses: 2, pointsFor: 100, pointsAgainst: 95, rank: 0 },
    )
    expect(both).toBeLessThan(0)
  })

  it('falls back to head-to-head when sets and points both tie', () => {
    const { matches, setsByMatch } = fixture([fixedMatch('a', 'b', [[25, 20], [20, 25]])])
    // Both 1-1 on sets and dead level on points; "a" won the higher-scoring set.
    const ranked = rankPool([team('a'), team('b')], matches, setsByMatch, 'fixed_sets')
    expect(ranked.length).toBe(2)
    expect(new Set(ranked.map((r) => r.rank)).size).toBe(2)
  })

  it('leaves best-of pools ranking on match wins', () => {
    const { matches, setsByMatch } = fixture([
      match('a', 'b', [[25, 10], [25, 10]]),
      match('a', 'c', [[25, 10], [25, 10]]),
      match('b', 'c', [[25, 23], [25, 23]]),
    ])
    const ranked = rankPool([team('a'), team('b'), team('c')], matches, setsByMatch, 'best_of')
    expect(ranked.map((r) => r.teamId)).toEqual(['a', 'b', 'c'])
    expect(ranked.every((r) => r.matchTies === 0)).toBe(true)
  })
})
