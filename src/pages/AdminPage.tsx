import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useDivisionData, useDivisions, useProfiles, useRefreshTournament } from '../lib/hooks'
import { useTournamentContext } from '../lib/tournamentContext'
import { friendlyError } from '../lib/supabase'
import {
  addTeams,
  clearBracket,
  createDivision,
  createTournament,
  deleteDivision,
  deleteTeam,
  deleteTournament,
  generateBracketForDivision,
  generatePools,
  scheduleDivision,
  setUserRole,
  updateDivision,
  updateTournament,
} from '../lib/api'
import { poolCountFor } from '../lib/pools'
import { FORMAT_LABEL, ROLE_LABEL, type AppRole, type BracketFormat } from '../lib/types'
import { Banner, Card, Confirm, Empty, Field, Spinner, formatDate } from '../components/ui'
import { LoginPage } from './LoginPage'

const FORMATS: BracketFormat[] = ['single', 'single_consolation', 'double']
const ROLES: AppRole[] = ['viewer', 'scorekeeper', 'admin']

export function AdminPage() {
  const { isAdmin, session, profile } = useAuth()

  if (!session) {
    return (
      <>
        <Card title="Admin sign-in">
          <p className="small muted" style={{ margin: 0 }}>
            Running the tournament needs an admin account.
          </p>
        </Card>
        <LoginPage />
      </>
    )
  }

  if (!isAdmin) {
    return (
      <Empty>
        You are signed in as <strong>{ROLE_LABEL[profile?.role ?? 'viewer']}</strong>.
        <br />
        <span className="tiny">Ask an admin to grant you access.</span>
      </Empty>
    )
  }

  return <AdminConsole />
}

function AdminConsole() {
  const { tournament, tournaments, setTournamentId } = useTournamentContext()
  const { data: divisions = [] } = useDivisions(tournament?.id)
  const refresh = useRefreshTournament()

  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  /** Wrap a mutation so every panel reports errors the same way. */
  async function run(label: string, fn: () => Promise<unknown>) {
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      await fn()
      refresh()
      setNotice(label)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Banner kind="error">{error}</Banner>
      <Banner kind="ok">{notice}</Banner>

      <TournamentPanel
        busy={busy}
        run={run}
        onCreated={(id) => setTournamentId(id)}
        tournaments={tournaments}
        tournament={tournament}
        setTournamentId={setTournamentId}
      />

      {tournament ? (
        <>
          <DivisionsPanel busy={busy} run={run} tournamentId={tournament.id} divisions={divisions} />
          {divisions.map((division) => (
            <DivisionAdmin key={division.id} divisionId={division.id} busy={busy} run={run} />
          ))}
        </>
      ) : null}

      <UsersPanel busy={busy} run={run} />
    </>
  )
}

type Run = (label: string, fn: () => Promise<unknown>) => Promise<void>

// ---------------------------------------------------------------------------

function TournamentPanel({
  busy,
  run,
  onCreated,
  tournaments,
  tournament,
  setTournamentId,
}: {
  busy: boolean
  run: Run
  onCreated: (id: string) => void
  tournaments: ReturnType<typeof useTournamentContext>['tournaments']
  tournament: ReturnType<typeof useTournamentContext>['tournament']
  setTournamentId: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [location, setLocation] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <Card title="Tournament">
      {tournaments.length === 0 ? (
        <p className="small muted">Create a tournament to get started.</p>
      ) : (
        <div className="field">
          <label>Currently editing</label>
          <select value={tournament?.id ?? ''} onChange={(e) => setTournamentId(e.target.value)}>
            {tournaments.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.tourney_date ? ` — ${formatDate(t.tourney_date)}` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {tournament ? (
        <div className="row wrap" style={{ marginBottom: 10 }}>
          <button
            className="small"
            disabled={busy}
            onClick={() =>
              run(
                tournament.is_active ? 'Tournament archived.' : 'Tournament reactivated.',
                () => updateTournament(tournament.id, { is_active: !tournament.is_active }),
              )
            }
          >
            {tournament.is_active ? 'Archive' : 'Reactivate'}
          </button>
          <button className="small danger" disabled={busy} onClick={() => setConfirmDelete(true)}>
            Delete
          </button>
        </div>
      ) : null}

      {open || tournaments.length === 0 ? (
        <>
          <hr className="rule" />
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Spring Slam 2026"
            />
          </Field>
          <Field label="Date">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Location">
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Community Center"
            />
          </Field>
          <button
            className="primary"
            style={{ width: '100%' }}
            disabled={busy || !name.trim()}
            onClick={() =>
              run('Tournament created.', async () => {
                const created = await createTournament({
                  name: name.trim(),
                  tourney_date: date || null,
                  location: location.trim() || null,
                })
                onCreated(created.id)
                setName('')
                setDate('')
                setLocation('')
                setOpen(false)
              })
            }
          >
            Create tournament
          </button>
        </>
      ) : (
        <button style={{ width: '100%' }} onClick={() => setOpen(true)}>
          + New tournament
        </button>
      )}

      {confirmDelete && tournament ? (
        <Confirm
          message={`Delete "${tournament.name}"? Every division, team, pool and result goes with it.`}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false)
            void run('Tournament deleted.', () => deleteTournament(tournament.id))
          }}
        />
      ) : null}
    </Card>
  )
}

// ---------------------------------------------------------------------------

function DivisionsPanel({
  busy,
  run,
  tournamentId,
  divisions,
}: {
  busy: boolean
  run: Run
  tournamentId: string
  divisions: ReturnType<typeof useDivisions>['data'] & object
}) {
  const [name, setName] = useState('')
  const [format, setFormat] = useState<BracketFormat>('single')
  const [poolBestOf, setPoolBestOf] = useState(3)
  const [bracketBestOf, setBracketBestOf] = useState(3)

  return (
    <Card title="Divisions">
      {divisions.length === 0 ? (
        <p className="small muted">No divisions yet.</p>
      ) : (
        <p className="small muted">
          {divisions.length} {divisions.length === 1 ? 'division' : 'divisions'}. Each one is
          configured below.
        </p>
      )}

      <hr className="rule" />
      <Field label="Add a division">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="18U Girls, Coed B, …"
        />
      </Field>
      <div className="row wrap">
        <div className="grow">
          <label>Bracket format</label>
          <select value={format} onChange={(e) => setFormat(e.target.value as BracketFormat)}>
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {FORMAT_LABEL[f]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="row wrap" style={{ marginTop: 10 }}>
        <div className="grow">
          <label>Pool games</label>
          <select value={poolBestOf} onChange={(e) => setPoolBestOf(Number(e.target.value))}>
            <option value={1}>Single set</option>
            <option value={3}>Best of 3</option>
            <option value={5}>Best of 5</option>
          </select>
        </div>
        <div className="grow">
          <label>Bracket games</label>
          <select value={bracketBestOf} onChange={(e) => setBracketBestOf(Number(e.target.value))}>
            <option value={1}>Single set</option>
            <option value={3}>Best of 3</option>
            <option value={5}>Best of 5</option>
          </select>
        </div>
      </div>

      <button
        className="primary"
        style={{ width: '100%', marginTop: 12 }}
        disabled={busy || !name.trim()}
        onClick={() =>
          run('Division added.', async () => {
            await createDivision({
              tournament_id: tournamentId,
              name: name.trim(),
              bracket_format: format,
              pool_best_of: poolBestOf,
              bracket_best_of: bracketBestOf,
              position: divisions.length,
            })
            setName('')
          })
        }
      >
        Add division
      </button>
    </Card>
  )
}

// ---------------------------------------------------------------------------

function DivisionAdmin({ divisionId, busy, run }: { divisionId: string; busy: boolean; run: Run }) {
  const { tournament } = useTournamentContext()
  const { data: divisions = [] } = useDivisions(tournament?.id)
  const { data, isLoading } = useDivisionData(divisionId)

  const [teamInput, setTeamInput] = useState('')
  const [maxPerPool, setMaxPerPool] = useState(4)
  const [courts, setCourts] = useState('1, 2, 3')
  const [startTime, setStartTime] = useState('08:00')
  const [slotMinutes, setSlotMinutes] = useState(45)
  const [confirm, setConfirm] = useState<{ message: string; action: () => void } | null>(null)
  const [expanded, setExpanded] = useState(false)

  const division = divisions.find((d) => d.id === divisionId)

  const poolMatches = useMemo(
    () => data?.matches.filter((m) => m.phase === 'pool') ?? [],
    [data],
  )
  const bracketMatches = useMemo(
    () => data?.matches.filter((m) => m.phase === 'bracket') ?? [],
    [data],
  )
  const poolPlayed = poolMatches.filter((m) => m.status === 'final').length
  const poolComplete = poolMatches.length > 0 && poolPlayed === poolMatches.length
  const anyPoolResults = poolPlayed > 0

  if (!division) return null
  if (isLoading || !data) return <Card title="Loading…"><Spinner /></Card>

  const teamCount = data.teams.length
  const projectedPools = poolCountFor(teamCount, maxPerPool)
  const courtList = courts.split(',').map((c) => c.trim()).filter(Boolean)

  /** Combine today's date with the chosen wall-clock start time. */
  const startAt = () => {
    const base = division && tournament?.tourney_date ? tournament.tourney_date : null
    const [hours, minutes] = startTime.split(':').map(Number)
    const date = base ? new Date(`${base}T00:00:00`) : new Date()
    date.setHours(hours || 0, minutes || 0, 0, 0)
    return date
  }

  return (
    <Card
      title={
        <span className="spread" style={{ display: 'flex' }}>
          <span>{division.name}</span>
          <button className="small ghost" onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Hide' : 'Manage'}
          </button>
        </span>
      }
    >
      <div className="row wrap" style={{ gap: 6, marginBottom: expanded ? 12 : 0 }}>
        <span className="pill">{teamCount} teams</span>
        <span className="pill">{data.pools.length} pools</span>
        <span className={`pill ${poolComplete ? 'final' : ''}`}>
          Pool {poolPlayed}/{poolMatches.length}
        </span>
        {division.bracket_generated ? <span className="pill final">Bracket built</span> : null}
        <Link to={`/divisions/${division.id}`} className="pill" style={{ textDecoration: 'none' }}>
          View →
        </Link>
      </div>

      {!expanded ? null : (
        <>
          <hr className="rule" />
          <h3>Teams</h3>
          <Field label="Add teams" hint="One per line, or comma separated. Paste a whole roster.">
            <textarea
              rows={3}
              value={teamInput}
              onChange={(e) => setTeamInput(e.target.value)}
              placeholder={'Thunder\nRiptide\nSpike Squad'}
            />
          </Field>
          <button
            disabled={busy || !teamInput.trim()}
            style={{ width: '100%' }}
            onClick={() =>
              run('Teams added.', async () => {
                const names = teamInput
                  .split(/[\n,]/)
                  .map((n) => n.trim())
                  .filter(Boolean)
                await addTeams(division.id, names)
                setTeamInput('')
              })
            }
          >
            Add {teamInput.split(/[\n,]/).filter((n) => n.trim()).length || ''} teams
          </button>

          {data.teams.length > 0 ? (
            <div style={{ marginTop: 12 }}>
              {data.teams.map((team) => {
                const pool = data.pools.find((p) => p.id === team.pool_id)
                return (
                  <div className="spread" key={team.id} style={{ padding: '6px 0' }}>
                    <span className="grow small">
                      {team.name}
                      {pool ? <span className="muted"> · Pool {pool.name}</span> : null}
                      {team.bracket_seed ? (
                        <span className="muted"> · seed {team.bracket_seed}</span>
                      ) : null}
                    </span>
                    <button
                      className="small ghost"
                      aria-label={`Remove ${team.name}`}
                      disabled={busy}
                      onClick={() =>
                        setConfirm({
                          message: `Remove ${team.name}? Any games it appears in are removed too.`,
                          action: () => void run('Team removed.', () => deleteTeam(team.id)),
                        })
                      }
                    >
                      ✕
                    </button>
                  </div>
                )
              })}
            </div>
          ) : null}

          <hr className="rule" />
          <h3>Pool play</h3>
          <Field
            label="Max teams per pool"
            hint={
              teamCount > 0
                ? `${teamCount} teams → ${projectedPools} ${projectedPools === 1 ? 'pool' : 'pools'}, round robin inside each.`
                : 'Add teams first.'
            }
          >
            <select value={maxPerPool} onChange={(e) => setMaxPerPool(Number(e.target.value))}>
              {[3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n} per pool
                </option>
              ))}
            </select>
          </Field>
          <button
            className="primary"
            style={{ width: '100%' }}
            disabled={busy || teamCount < 2}
            onClick={() =>
              setConfirm({
                message: anyPoolResults
                  ? 'Rebuilding pools deletes every pool game and the scores already entered. Continue?'
                  : `Split ${teamCount} teams into ${projectedPools} ${projectedPools === 1 ? 'pool' : 'pools'} and create the round-robin games?`,
                action: () =>
                  void run('Pools and games created.', () =>
                    generatePools(division, data.teams, maxPerPool),
                  ),
              })
            }
          >
            {data.pools.length > 0 ? 'Rebuild pools & games' : 'Build pools & games'}
          </button>

          <hr className="rule" />
          <h3>Courts &amp; times</h3>
          <div className="row wrap">
            <div className="grow">
              <label>Courts</label>
              <input value={courts} onChange={(e) => setCourts(e.target.value)} placeholder="1, 2, 3" />
            </div>
          </div>
          <div className="row wrap" style={{ marginTop: 10 }}>
            <div className="grow">
              <label>First game</label>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div className="grow">
              <label>Minutes per slot</label>
              <input
                type="number"
                min={10}
                max={180}
                value={slotMinutes}
                onChange={(e) => setSlotMinutes(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="row wrap" style={{ marginTop: 10 }}>
            <button
              className="grow"
              disabled={busy || poolMatches.length === 0 || courtList.length === 0}
              onClick={() =>
                run('Pool games scheduled.', () =>
                  scheduleDivision(poolMatches, {
                    courts: courtList,
                    startAt: startAt(),
                    minutesPerSlot: slotMinutes,
                  }),
                )
              }
            >
              Schedule pool play
            </button>
            <button
              className="grow"
              disabled={busy || bracketMatches.length === 0 || courtList.length === 0}
              onClick={() =>
                run('Bracket games scheduled.', () =>
                  scheduleDivision(bracketMatches, {
                    courts: courtList,
                    startAt: startAt(),
                    minutesPerSlot: slotMinutes,
                  }),
                )
              }
            >
              Schedule bracket
            </button>
          </div>
          <p className="tiny muted" style={{ marginBottom: 0 }}>
            Games are laid out across {courtList.length || 0} courts in {slotMinutes}-minute slots,
            never putting a team on two courts at once. Set the bracket start time before scheduling
            the afternoon.
          </p>

          <hr className="rule" />
          <h3>Bracket</h3>
          <Field label="Format">
            <select
              value={division.bracket_format}
              disabled={busy}
              onChange={(e) =>
                run('Format updated.', () =>
                  updateDivision(division.id, {
                    bracket_format: e.target.value as BracketFormat,
                  }),
                )
              }
            >
              {FORMATS.map((f) => (
                <option key={f} value={f}>
                  {FORMAT_LABEL[f]}
                </option>
              ))}
            </select>
          </Field>

          {!poolComplete && poolMatches.length > 0 ? (
            <Banner kind="info">
              {poolMatches.length - poolPlayed} pool {poolMatches.length - poolPlayed === 1 ? 'game' : 'games'}{' '}
              still to play. You can generate the bracket now, but the seeding will change as
              results come in.
            </Banner>
          ) : null}

          <button
            className="primary"
            style={{ width: '100%' }}
            disabled={busy || !anyPoolResults}
            onClick={() =>
              setConfirm({
                message: division.bracket_generated
                  ? 'Regenerating reseeds the bracket from current pool standings and erases every bracket result. Continue?'
                  : 'Seed the bracket from pool standings and create every match?',
                action: () =>
                  void run('Bracket generated.', () =>
                    generateBracketForDivision(division, data),
                  ),
              })
            }
          >
            {division.bracket_generated ? 'Regenerate bracket' : 'Generate bracket from pools'}
          </button>

          {!anyPoolResults ? (
            <p className="tiny muted">Enter at least one pool result before seeding the bracket.</p>
          ) : null}

          {division.bracket_generated ? (
            <button
              className="danger"
              style={{ width: '100%', marginTop: 8 }}
              disabled={busy}
              onClick={() =>
                setConfirm({
                  message: 'Delete the bracket and all its results?',
                  action: () => void run('Bracket cleared.', () => clearBracket(division.id)),
                })
              }
            >
              Clear bracket
            </button>
          ) : null}

          <hr className="rule" />
          <button
            className="danger"
            style={{ width: '100%' }}
            disabled={busy}
            onClick={() =>
              setConfirm({
                message: `Delete the ${division.name} division and everything in it?`,
                action: () => void run('Division deleted.', () => deleteDivision(division.id)),
              })
            }
          >
            Delete division
          </button>
        </>
      )}

      {confirm ? (
        <Confirm
          message={confirm.message}
          confirmLabel="Continue"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const action = confirm.action
            setConfirm(null)
            action()
          }}
        />
      ) : null}
    </Card>
  )
}

// ---------------------------------------------------------------------------

function UsersPanel({ busy, run }: { busy: boolean; run: Run }) {
  const { profile } = useAuth()
  const { data: profiles = [], isLoading } = useProfiles(true)

  return (
    <Card title="People & roles">
      <p className="small muted" style={{ marginTop: 0 }}>
        Everyone can read the tournament without signing in. Accounts are only needed to enter
        scores or administer. New accounts start as read only.
      </p>

      {isLoading ? <Spinner /> : null}

      {profiles.map((person) => (
        <div className="spread" key={person.id} style={{ padding: '8px 0' }}>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="small" style={{ fontWeight: 600 }}>
              {person.full_name || person.email}
              {person.id === profile?.id ? <span className="muted"> (you)</span> : null}
            </div>
            <div className="tiny muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {person.email}
            </div>
          </div>
          <select
            style={{ width: 150 }}
            aria-label={`Role for ${person.email}`}
            value={person.role}
            disabled={busy}
            onChange={(e) =>
              run('Role updated.', () => setUserRole(person.id, e.target.value as AppRole))
            }
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABEL[role]}
              </option>
            ))}
          </select>
        </div>
      ))}
    </Card>
  )
}
