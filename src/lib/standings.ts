import type { Match, MatchSet, Team } from './types'

export interface TeamRecord {
  teamId: string
  teamName: string
  played: number
  matchWins: number
  matchLosses: number
  setWins: number
  setLosses: number
  pointsFor: number
  pointsAgainst: number
  /** Rank within the pool, 1-based. Assigned by rankPool(). */
  rank: number
}

export const winPct = (r: TeamRecord) => (r.played === 0 ? 0 : r.matchWins / r.played)
export const setRatio = (r: TeamRecord) =>
  r.setWins + r.setLosses === 0 ? 0 : r.setWins / (r.setWins + r.setLosses)
export const pointRatio = (r: TeamRecord) =>
  r.pointsAgainst === 0 ? (r.pointsFor > 0 ? Infinity : 0) : r.pointsFor / r.pointsAgainst
export const pointDiff = (r: TeamRecord) => r.pointsFor - r.pointsAgainst
export const setDiff = (r: TeamRecord) => r.setWins - r.setLosses

const emptyRecord = (team: Team): TeamRecord => ({
  teamId: team.id,
  teamName: team.name,
  played: 0,
  matchWins: 0,
  matchLosses: 0,
  setWins: 0,
  setLosses: 0,
  pointsFor: 0,
  pointsAgainst: 0,
  rank: 0,
})

/**
 * Build raw win/loss/set/point records from completed matches.
 * Matches that are not final (and byes) contribute nothing.
 */
export function buildRecords(
  teams: Team[],
  matches: Match[],
  setsByMatch: Map<string, MatchSet[]>,
): Map<string, TeamRecord> {
  const records = new Map<string, TeamRecord>()
  for (const team of teams) records.set(team.id, emptyRecord(team))

  for (const match of matches) {
    if (match.status !== 'final' || match.is_bye) continue
    const home = match.home_team_id ? records.get(match.home_team_id) : undefined
    const away = match.away_team_id ? records.get(match.away_team_id) : undefined
    if (!home || !away) continue

    home.played += 1
    away.played += 1

    if (match.winner_team_id === home.teamId) {
      home.matchWins += 1
      away.matchLosses += 1
    } else if (match.winner_team_id === away.teamId) {
      away.matchWins += 1
      home.matchLosses += 1
    }

    for (const set of setsByMatch.get(match.id) ?? []) {
      home.pointsFor += set.home_score
      home.pointsAgainst += set.away_score
      away.pointsFor += set.away_score
      away.pointsAgainst += set.home_score
      if (set.home_score > set.away_score) {
        home.setWins += 1
        away.setLosses += 1
      } else if (set.away_score > set.home_score) {
        away.setWins += 1
        home.setLosses += 1
      }
    }
  }

  return records
}

/**
 * Head-to-head between two teams: negative if `a` finished ahead of `b`.
 * Returns 0 when they never met or split every measure.
 */
export function headToHead(
  aId: string,
  bId: string,
  matches: Match[],
  setsByMatch: Map<string, MatchSet[]>,
): number {
  let aWins = 0
  let bWins = 0
  let aSets = 0
  let bSets = 0
  let aPoints = 0
  let bPoints = 0
  let met = false

  for (const match of matches) {
    if (match.status !== 'final' || match.is_bye) continue
    const ids = [match.home_team_id, match.away_team_id]
    if (!ids.includes(aId) || !ids.includes(bId)) continue
    met = true

    if (match.winner_team_id === aId) aWins += 1
    else if (match.winner_team_id === bId) bWins += 1

    const aIsHome = match.home_team_id === aId
    for (const set of setsByMatch.get(match.id) ?? []) {
      const forA = aIsHome ? set.home_score : set.away_score
      const forB = aIsHome ? set.away_score : set.home_score
      aPoints += forA
      bPoints += forB
      if (forA > forB) aSets += 1
      else if (forB > forA) bSets += 1
    }
  }

  if (!met) return 0
  if (aWins !== bWins) return bWins - aWins
  if (aSets !== bSets) return bSets - aSets
  if (aPoints !== bPoints) return bPoints - aPoints
  return 0
}

const byNumberDesc = (a: number, b: number) => (a === b ? 0 : b - a)

/** Ratio-based comparison, used once win percentage has already tied. */
function compareRatios(a: TeamRecord, b: TeamRecord): number {
  return (
    byNumberDesc(setRatio(a), setRatio(b)) ||
    byNumberDesc(pointRatio(a), pointRatio(b)) ||
    byNumberDesc(pointDiff(a), pointDiff(b))
  )
}

/**
 * Overall comparison used to seed teams across pools, where head-to-head is
 * meaningless because the teams never played each other.
 */
export function compareOverall(a: TeamRecord, b: TeamRecord): number {
  return (
    byNumberDesc(winPct(a), winPct(b)) ||
    compareRatios(a, b) ||
    a.teamName.localeCompare(b.teamName)
  )
}

function groupBy<T>(items: T[], equal: (a: T, b: T) => boolean): T[][] {
  const groups: T[][] = []
  for (const item of items) {
    const last = groups[groups.length - 1]
    if (last && equal(last[0], item)) last.push(item)
    else groups.push([item])
  }
  return groups
}

/**
 * Order a pool's teams, applying tiebreakers in the conventional order:
 *   1. match win percentage
 *   2. head-to-head (only meaningful when exactly two teams are tied)
 *   3. set ratio
 *   4. point ratio
 *   5. point differential
 *   6. team name, so the order is at least stable and reproducible
 */
export function rankPool(
  teams: Team[],
  matches: Match[],
  setsByMatch: Map<string, MatchSet[]>,
): TeamRecord[] {
  const records = [...buildRecords(teams, matches, setsByMatch).values()]
  records.sort((a, b) => byNumberDesc(winPct(a), winPct(b)))

  const resolved: TeamRecord[] = []

  for (const tiedOnWins of groupBy(records, (a, b) => winPct(a) === winPct(b))) {
    if (tiedOnWins.length === 1) {
      resolved.push(tiedOnWins[0])
      continue
    }

    if (tiedOnWins.length === 2) {
      const h2h = headToHead(tiedOnWins[0].teamId, tiedOnWins[1].teamId, matches, setsByMatch)
      if (h2h !== 0) {
        resolved.push(...(h2h < 0 ? tiedOnWins : [tiedOnWins[1], tiedOnWins[0]]))
        continue
      }
    }

    // Three or more tied (or a two-way tie head-to-head could not break):
    // fall through to the ratio tiebreakers, then retry head-to-head on any
    // pair that is still deadlocked.
    const byRatio = [...tiedOnWins].sort(compareRatios)
    for (const stillTied of groupBy(byRatio, (a, b) => compareRatios(a, b) === 0)) {
      if (stillTied.length === 2) {
        const h2h = headToHead(stillTied[0].teamId, stillTied[1].teamId, matches, setsByMatch)
        if (h2h !== 0) {
          resolved.push(...(h2h < 0 ? stillTied : [stillTied[1], stillTied[0]]))
          continue
        }
      }
      resolved.push(...[...stillTied].sort((a, b) => a.teamName.localeCompare(b.teamName)))
    }
  }

  resolved.forEach((record, index) => {
    record.rank = index + 1
  })
  return resolved
}

/** True once every pool match involving these teams has a final result. */
export function poolIsComplete(matches: Match[]): boolean {
  return matches.length > 0 && matches.every((m) => m.status === 'final')
}
