import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { friendlyError } from '../lib/supabase'
import { Banner, Card, Field, Spinner } from '../components/ui'

/**
 * Landing page for a password-reset link. Supabase signs the visitor in with a
 * short-lived recovery session, so having a session here is what proves the
 * link was genuine.
 */
export function ResetPasswordPage() {
  const { session, loading, updatePassword } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (loading) return <Spinner />

  if (!session) {
    return (
      <Card title="This link is no longer valid">
        <p className="small muted">
          Reset links expire, and each one can only be used once. Ask for a new one and open it on
          this device.
        </p>
        <button className="primary" style={{ width: '100%' }} onClick={() => navigate('/account')}>
          Back to sign in
        </button>
      </Card>
    )
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError('Use at least 6 characters.')
      return
    }
    if (password !== confirm) {
      setError('Those two passwords do not match.')
      return
    }

    setBusy(true)
    try {
      await updatePassword(password)
      navigate('/games')
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Choose a new password">
      <p className="small muted" style={{ marginTop: 0 }}>
        Setting a password for <strong>{session.user.email}</strong>.
      </p>

      <Banner kind="error">{error}</Banner>

      <form onSubmit={onSubmit}>
        <Field label="New password" hint="At least 6 characters.">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={6}
            required
            autoFocus
          />
        </Field>
        <Field label="Confirm new password">
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            minLength={6}
            required
          />
        </Field>
        <button className="primary" style={{ width: '100%' }} disabled={busy}>
          {busy ? 'Saving…' : 'Save password & sign in'}
        </button>
      </form>
    </Card>
  )
}
