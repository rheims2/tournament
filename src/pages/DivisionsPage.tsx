import { Link } from 'react-router-dom'
import { useAllDivisionData, useDivisions } from '../lib/hooks'
import { useTournamentContext } from '../lib/tournamentContext'
import { FORMAT_LABEL } from '../lib/types'
import { Empty, Spinner } from '../components/ui'

export function DivisionsPage() {
  const { tournament, loading } = useTournamentContext()
  const { data: divisions = [], isLoading } = useDivisions(tournament?.id)
  const { byDivision } = useAllDivisionData(divisions)

  if (loading || isLoading) return <Spinner />

  if (!tournament) {
    return <Empty>No tournament yet. An admin can create one from the Admin tab.</Empty>
  }

  if (divisions.length === 0) {
    return <Empty>No divisions yet. An admin can add them from the Admin tab.</Empty>
  }

  return (
    <>
      {divisions.map((division) => {
        const data = byDivision.get(division.id)
        const poolMatches = data?.matches.filter((m) => m.phase === 'pool') ?? []
        const poolDone = poolMatches.filter((m) => m.status === 'final').length
        const bracketMatches = data?.matches.filter((m) => m.phase === 'bracket' && !m.is_bye) ?? []
        const bracketDone = bracketMatches.filter((m) => m.status === 'final').length

        return (
          <Link
            key={division.id}
            to={`/divisions/${division.id}`}
            className="card"
            style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}
          >
            <div className="spread">
              <strong>{division.name}</strong>
              <span className="pill">{data?.teams.length ?? 0} teams</span>
            </div>
            <div className="tiny muted" style={{ marginTop: 6 }}>
              {data?.pools.length ?? 0} {data?.pools.length === 1 ? 'pool' : 'pools'} ·{' '}
              {FORMAT_LABEL[division.bracket_format]}
            </div>
            <div className="row" style={{ marginTop: 10, gap: 6 }}>
              <span className={`pill ${poolMatches.length > 0 && poolDone === poolMatches.length ? 'final' : ''}`}>
                Pool {poolDone}/{poolMatches.length}
              </span>
              {bracketMatches.length > 0 ? (
                <span className={`pill ${bracketDone === bracketMatches.length ? 'final' : ''}`}>
                  Bracket {bracketDone}/{bracketMatches.length}
                </span>
              ) : (
                <span className="pill bye">Bracket not set</span>
              )}
            </div>
          </Link>
        )
      })}
    </>
  )
}
