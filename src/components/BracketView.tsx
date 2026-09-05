import { BRACKET_LABEL, BRACKET_ORDER } from '../lib/bracket'
import type { BracketGroup, Match, MatchSet, Team } from '../lib/types'
import { MatchCard } from './MatchCard'
import { TrophyIcon } from './icons'
import { Empty } from './ui'

interface Props {
  matches: Match[]
  teamsById: Map<string, Team>
  setsByMatch: Map<string, MatchSet[]>
  onSelect?: (match: Match) => void
}

function roundsOf(matches: Match[]): { round: number; matches: Match[] }[] {
  const byRound = new Map<number, Match[]>()
  for (const match of matches) {
    const list = byRound.get(match.round) ?? []
    list.push(match)
    byRound.set(match.round, list)
  }
  return [...byRound.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([round, list]) => ({ round, matches: list.sort((a, b) => a.slot - b.slot) }))
}

const roundHeading = (matches: Match[], round: number): string => {
  // Every match in a round shares a round name; strip the trailing index.
  const label = matches[0]?.label ?? `Round ${round}`
  return label.replace(/\s\d+$/, '')
}

export function BracketView({ matches, teamsById, setsByMatch, onSelect }: Props) {
  if (matches.length === 0) {
    return (
      <Empty>
        The bracket has not been generated yet.
        <br />
        <span className="tiny">An admin builds it from pool results once pool play is done.</span>
      </Empty>
    )
  }

  const groups = BRACKET_ORDER.map((group) => ({
    group,
    matches: matches.filter((m) => m.bracket === group),
  })).filter((g) => g.matches.length > 0)

  const champion = (() => {
    const decider =
      matches.find((m) => m.bracket === 'grand_final') ??
      matches.filter((m) => m.bracket === 'winners').sort((a, b) => b.round - a.round)[0]
    if (!decider || decider.status !== 'final' || !decider.winner_team_id) return null
    return teamsById.get(decider.winner_team_id)?.name ?? null
  })()

  return (
    <>
      {champion ? (
        <div className="card center">
          <TrophyIcon className="champion-mark" />
          <div className="tiny muted" style={{ letterSpacing: '0.08em' }}>
            CHAMPION
          </div>
          <div style={{ fontSize: 20, fontWeight: 750, marginTop: 4 }}>{champion}</div>
        </div>
      ) : null}

      {groups.map(({ group, matches: groupMatches }) => (
        <section key={group}>
          {groups.length > 1 ? (
            <h3 className="section-title">{BRACKET_LABEL[group as BracketGroup]}</h3>
          ) : null}
          <div className="bracket-scroll">
            <div className="bracket-rounds">
              {roundsOf(groupMatches).map(({ round, matches: roundMatches }) => (
                <div className="bracket-round" key={`${group}-${round}`}>
                  <h4>{roundHeading(roundMatches, round)}</h4>
                  {roundMatches.map((match) => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      sets={setsByMatch.get(match.id) ?? []}
                      teamsById={teamsById}
                      onSelect={onSelect}
                      showLabel={false}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>
      ))}
      <p className="tiny muted center">Swipe sideways to see later rounds.</p>
    </>
  )
}
