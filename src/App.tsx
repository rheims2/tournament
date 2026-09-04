import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { useRealtimeSync } from './lib/hooks'
import { useTournamentContext } from './lib/tournamentContext'
import { isConfigured } from './lib/supabase'
import { ROLE_LABEL } from './lib/types'
import { Spinner, formatDate } from './components/ui'
import { SetupPage } from './pages/SetupPage'
import { LoginPage } from './pages/LoginPage'
import { GamesPage } from './pages/GamesPage'
import { DivisionsPage } from './pages/DivisionsPage'
import { DivisionPage } from './pages/DivisionPage'
import { AdminPage } from './pages/AdminPage'
import { AccountPage } from './pages/AccountPage'
import { TournamentsPage } from './pages/TournamentsPage'

function BottomNav({ showAdmin }: { showAdmin: boolean }) {
  return (
    <nav className="bottom-nav">
      <NavLink to="/games">
        <span className="glyph" aria-hidden>🏐</span>
        Games
      </NavLink>
      <NavLink to="/divisions">
        <span className="glyph" aria-hidden>📋</span>
        Divisions
      </NavLink>
      {showAdmin ? (
        <NavLink to="/admin">
          <span className="glyph" aria-hidden>⚙️</span>
          Admin
        </NavLink>
      ) : null}
      <NavLink to="/account">
        <span className="glyph" aria-hidden>👤</span>
        Account
      </NavLink>
    </nav>
  )
}

function TopBar() {
  const { tournament, tournaments } = useTournamentContext()
  const { role, session } = useAuth()
  const navigate = useNavigate()

  return (
    <header className="topbar">
      <div className="grow">
        <h1>{tournament?.name ?? 'Volleyball Tournament'}</h1>
        {tournament ? (
          <div className="sub">
            {[formatDate(tournament.tourney_date), tournament.location].filter(Boolean).join(' · ')}
          </div>
        ) : null}
      </div>
      {tournaments.length > 1 ? (
        <button className="small ghost" onClick={() => navigate('/tournaments')}>
          Switch
        </button>
      ) : null}
      <span className="pill">{session ? ROLE_LABEL[role] : 'Read only'}</span>
    </header>
  )
}

export function App() {
  const { loading } = useAuth()
  useRealtimeSync()

  if (!isConfigured) return <SetupPage />
  if (loading) return <Spinner />

  return (
    <div className="app">
      <TopBar />
      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/games" replace />} />
          <Route path="/games" element={<GamesPage />} />
          <Route path="/divisions" element={<DivisionsPage />} />
          <Route path="/divisions/:divisionId" element={<DivisionPage />} />
          <Route path="/tournaments" element={<TournamentsPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<Navigate to="/games" replace />} />
        </Routes>
      </main>
      <AppNav />
    </div>
  )
}

function AppNav() {
  const { isAdmin } = useAuth()
  return <BottomNav showAdmin={isAdmin} />
}
