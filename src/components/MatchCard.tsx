import type { Division, Match, MatchSet, Team } from '../lib/types'
import { formatTime } from './ui'

interface Props {
  match: Match
  teamsById: Map<string, Team>
  sets: MatchSet[]
  division?: Division
  onSelect?: (match: Match) => void
  showLabel?: boolean
}

function sideName(
  teamId: string | null,
  placeholder: string | null,
  teamsById: Map<string, Team>,
): { text: string; tbd: boolean; seed: number | null } {
  const team = teamId ? teamsById.get(teamId) : undefined
  if (team) return { text: team.name, tbd: false, seed: team.bracket_seed }
  return { text: placeholder || 'TBD', tbd: true, seed: null }
}

export function MatchCard({ match, teamsById, sets, division, onSelect, showLabel = true }: Props) {
  const home = sideName(match.home_team_id, match.home_placeholder, teamsById)
  const away = sideName(match.away_team_id, match.away_placeholder, teamsById)

  const isFinal = match.status === 'final'
  const homeWon = isFinal && match.winner_team_id === match.home_team_id
  const awayWon = isFinal && match.winner_team_id === match.away_team_id

  const playable = Boolean(onSelect) && !match.is_bye && Boolean(match.home_team_id && match.away_team_id)
  const scoreLine = (side: 'home' | 'away') =>
    sets.map((s) => (side === 'home' ? s.home_score : s.away_score)).join('  ')

  const bestOf = division ? (match.phase === 'pool' ? division.pool_best_of : division.bracket_best_of) : match.best_of

  const body = (
    <>
      <div className="meta">
        {showLabel && match.label ? <span>{match.label}</span> : null}
        {match.court ? <span>Court {match.court}</span> : null}
        {match.scheduled_at ? <span>{formatTime(match.scheduled_at)}</span> : null}
        {bestOf > 1 ? <span>Bo{bestOf}</span> : null}
        <span style={{ flex: 1 }} />
        {match.is_bye ? (
          <span className="pill bye">Bye</span>
        ) : isFinal ? (
          <span className="pill final">Final</span>
        ) : match.status === 'in_progress' ? (
          <span className="pill live">Live</span>
        ) : null}
      </div>

      <div className={`side ${homeWon ? 'won' : isFinal ? 'lost' : ''}`}>
        {home.seed ? <span className="seed">{home.seed}</span> : null}
        <span className={`name ${home.tbd ? 'tbd' : ''}`}>{home.text}</span>
        {sets.length > 0 ? <span className="pts">{scoreLine('home')}</span> : null}
        <span className="sets">{sets.length > 0 || isFinal ? match.home_sets_won : ''}</span>
      </div>

      <div className={`side ${awayWon ? 'won' : isFinal ? 'lost' : ''}`}>
        {away.seed ? <span className="seed">{away.seed}</span> : null}
        <span className={`name ${away.tbd ? 'tbd' : ''}`}>{away.text}</span>
        {sets.length > 0 ? <span className="pts">{scoreLine('away')}</span> : null}
        <span className="sets">{sets.length > 0 || isFinal ? match.away_sets_won : ''}</span>
      </div>
    </>
  )

  if (!playable) {
    return <div className={`match ${match.is_bye ? 'is-bye' : ''}`}>{body}</div>
  }

  return (
    <button className="match" onClick={() => onSelect?.(match)}>
      {body}
    </button>
  )
}
