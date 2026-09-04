import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { ROLE_LABEL } from '../lib/types'
import { Card } from '../components/ui'
import { LoginPage } from './LoginPage'

export function AccountPage() {
  const { session, profile, role, signOut } = useAuth()
  const navigate = useNavigate()

  if (!session) {
    return (
      <>
        <Card title="Following along?">
          <p className="small muted" style={{ margin: 0 }}>
            You can browse pools, brackets and live scores without an account. Sign in only if you
            need to enter scores or run the tournament.
          </p>
        </Card>
        <LoginPage />
        <p className="tiny muted center">
          Build {__BUILD_ID__} · {__BUILD_DATE__} UTC
        </p>
      </>
    )
  }

  const capability =
    role === 'admin'
      ? 'You can do anything: create divisions, build pools and brackets, enter scores, and change roles.'
      : role === 'scorekeeper'
        ? 'You can enter and correct scores. Teams, pools and brackets are admin-only.'
        : 'You have read-only access. Ask an admin to make you a scorekeeper if you need to post scores.'

  return (
    <>
      <Card title="Account">
        <div className="spread" style={{ marginBottom: 10 }}>
          <div className="grow">
            <div style={{ fontWeight: 650 }}>{profile?.full_name || session.user.email}</div>
            <div className="tiny muted">{session.user.email}</div>
          </div>
          <span className="pill final">{ROLE_LABEL[role]}</span>
        </div>
        <p className="small muted">{capability}</p>
        <button style={{ width: '100%' }} onClick={() => void signOut().then(() => navigate('/games'))}>
          Sign out
        </button>
      </Card>

      <Card title="This device">
        <p className="small muted" style={{ margin: 0 }}>
          Running build <strong>{__BUILD_ID__}</strong>, made {__BUILD_DATE__} UTC.
        </p>
        <p className="tiny muted" style={{ marginBottom: 0 }}>
          If this does not match the latest deploy, your phone is holding a cached copy —
          close the app or tab completely and reopen it.
        </p>
      </Card>

      <Card title="Roles">
        <ul className="small muted" style={{ paddingLeft: 18, margin: 0, lineHeight: 1.8 }}>
          <li>
            <strong>Read only</strong> — view schedules, standings and brackets.
          </li>
          <li>
            <strong>Enter scores</strong> — everything above, plus posting and correcting results.
          </li>
          <li>
            <strong>Admin</strong> — everything, including teams, pools, brackets and user roles.
          </li>
        </ul>
      </Card>
    </>
  )
}
