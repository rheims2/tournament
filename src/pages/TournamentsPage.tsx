import { useNavigate } from 'react-router-dom'
import { useTournamentContext } from '../lib/tournamentContext'
import { Empty, formatDate } from '../components/ui'

export function TournamentsPage() {
  const { tournaments, tournament, setTournamentId } = useTournamentContext()
  const navigate = useNavigate()

  if (tournaments.length === 0) {
    return <Empty>No tournaments yet. An admin can create one from the Admin tab.</Empty>
  }

  return (
    <>
      <h3 className="section-title">Choose a tournament</h3>
      {tournaments.map((t) => (
        <button
          key={t.id}
          className="match"
          onClick={() => {
            setTournamentId(t.id)
            navigate('/games')
          }}
        >
          <div className="spread">
            <strong>{t.name}</strong>
            {t.id === tournament?.id ? <span className="pill final">Viewing</span> : null}
          </div>
          <div className="tiny muted" style={{ marginTop: 4 }}>
            {[formatDate(t.tourney_date), t.location].filter(Boolean).join(' · ') || 'No date set'}
            {t.is_active ? '' : ' · archived'}
          </div>
        </button>
      ))}
    </>
  )
}
