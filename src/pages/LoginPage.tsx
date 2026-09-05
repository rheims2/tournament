import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { friendlyError } from '../lib/supabase'
import { Banner, Field } from '../components/ui'

export function LoginPage() {
  const { signIn, signUp, sendPasswordReset, session } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'in' | 'up' | 'forgot'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (session) {
    navigate('/account', { replace: true })
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      if (mode === 'forgot') {
        await sendPasswordReset(email.trim())
        // Never reveal whether an address has an account.
        setNotice(
          `If ${email.trim()} has an account, a reset link is on its way. Open it on this device — the link works once and expires.`,
        )
      } else if (mode === 'in') {
        await signIn(email.trim(), password)
        navigate('/games')
      } else {
        await signUp(email.trim(), password, fullName.trim())
        setNotice(
          'Account created. If your project has email confirmation on, check your inbox before signing in.',
        )
        setMode('in')
      }
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="tabs">
        <button className={mode === 'in' ? 'active' : ''} onClick={() => setMode('in')}>
          Sign in
        </button>
        <button className={mode === 'up' ? 'active' : ''} onClick={() => setMode('up')}>
          Create account
        </button>
        <button className={mode === 'forgot' ? 'active' : ''} onClick={() => setMode('forgot')}>
          Forgot password
        </button>
      </div>

      <div className="card">
        <Banner kind="error">{error}</Banner>
        <Banner kind="ok">{notice}</Banner>

        <form onSubmit={onSubmit}>
          {mode === 'forgot' ? (
            <p className="small muted" style={{ marginTop: 0 }}>
              Enter the address you signed up with and we will email you a link to set a new
              password.
            </p>
          ) : null}

          {mode === 'up' ? (
            <Field label="Name">
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
                required
              />
            </Field>
          ) : null}

          <Field label="Email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </Field>

          {mode !== 'forgot' ? (
            <Field label="Password" hint={mode === 'up' ? 'At least 6 characters.' : undefined}>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
                minLength={6}
                required
              />
            </Field>
          ) : null}

          <button className="primary" style={{ width: '100%' }} disabled={busy}>
            {busy
              ? 'Working…'
              : mode === 'in'
                ? 'Sign in'
                : mode === 'up'
                  ? 'Create account'
                  : 'Email me a reset link'}
          </button>

          {mode === 'in' ? (
            <button
              type="button"
              className="ghost small"
              style={{ width: '100%', marginTop: 8 }}
              onClick={() => {
                setMode('forgot')
                setError(null)
                setNotice(null)
              }}
            >
              Forgot your password?
            </button>
          ) : null}
        </form>
      </div>

      <p className="tiny muted center">
        New accounts start as read only. An admin can grant score entry from the Admin tab.
      </p>
    </>
  )
}
