import { useMemo, useState } from 'react'
import { reopenMatch, submitScore, type SetScore } from '../lib/api'
import { friendlyError } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Division, Match, MatchSet, Team } from '../lib/types'
import { Banner, Sheet } from './ui'

interface Props {
  match: Match
  division: Division
  sets: MatchSet[]
  teamsById: Map<string, Team>
  onClose: () => void
  onSaved: () => void
}

interface Row {
  home: string
  away: string
}

const toRows = (sets: MatchSet[]): Row[] =>
  sets.length > 0
    ? sets.map((s) => ({ home: String(s.home_score), away: String(s.away_score) }))
    : [{ home: '', away: '' }]

const num = (value: string) => {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

/** Both blank means the set has not been played and is dropped on save. */
const isBlank = (row: Row) => row.home.trim() === '' && row.away.trim() === ''

export function ScoreSheet({ match, division, sets, teamsById, onClose, onSaved }: Props) {
  const { isAdmin } = useAuth()
  const [rows, setRows] = useState<Row[]>(() => toRows(sets))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const homeTeam = match.home_team_id ? teamsById.get(match.home_team_id) : undefined
  const awayTeam = match.away_team_id ? teamsById.get(match.away_team_id) : undefined

  const bestOf = match.best_of
  const setsNeeded = Math.floor(bestOf / 2) + 1

  const played = rows.filter((r) => !isBlank(r))
  const tally = useMemo(() => {
    let home = 0
    let away = 0
    for (const row of played) {
      const h = num(row.home)
      const a = num(row.away)
      if (h > a) home++
      else if (a > h) away++
    }
    return { home, away }
  }, [played])

  const decided = tally.home >= setsNeeded || tally.away >= setsNeeded
  const leader = tally.home > tally.away ? homeTeam?.name : awayTeam?.name

  const targetFor = (index: number) =>
    bestOf > 1 && index === bestOf - 1 ? division.deciding_set_points : division.points_to_win

  function setRow(index: number, side: 'home' | 'away', value: string) {
    const clean = value.replace(/\D/g, '').slice(0, 3)
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [side]: clean } : row)))
  }

  async function save(finalize: boolean) {
    setError(null)
    setBusy(true)
    try {
      const payload: SetScore[] = played.map((row) => ({ home: num(row.home), away: num(row.away) }))
      await submitScore(match.id, payload, finalize)
      onSaved()
      onClose()
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  async function clearResult() {
    setError(null)
    setBusy(true)
    try {
      await reopenMatch(match.id)
      onSaved()
      onClose()
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open onClose={onClose}>
      <div className="spread" style={{ marginBottom: 4 }}>
        <h2 style={{ margin: 0 }}>{match.label ?? 'Enter score'}</h2>
        <button className="small ghost" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="tiny muted" style={{ marginTop: 0 }}>
        Best of {bestOf} &middot; first to {setsNeeded} {setsNeeded === 1 ? 'set' : 'sets'}
        {match.court ? ` · Court ${match.court}` : ''}
      </p>

      <Banner kind="error">{error}</Banner>

      <div className="sheet-teams">
        <span />
        <span className="t">{homeTeam?.name ?? 'Home'}</span>
        <span />
        <span className="t away">{awayTeam?.name ?? 'Away'}</span>
        <span />
      </div>

      {rows.map((row, index) => (
        <div className="set-row" key={index}>
          <span className="set-no">Set {index + 1}</span>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={row.home}
            placeholder={String(targetFor(index))}
            aria-label={`Set ${index + 1}, ${homeTeam?.name ?? 'home'} score`}
            onChange={(e) => setRow(index, 'home', e.target.value)}
          />
          <span className="vs">–</span>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={row.away}
            placeholder={String(targetFor(index))}
            aria-label={`Set ${index + 1}, ${awayTeam?.name ?? 'away'} score`}
            onChange={(e) => setRow(index, 'away', e.target.value)}
          />
          <button
            className="small ghost drop"
            aria-label={`Remove set ${index + 1}`}
            disabled={rows.length === 1}
            onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
          >
            ✕
          </button>
        </div>
      ))}

      {rows.length < bestOf ? (
        <button
          className="small ghost"
          style={{ width: '100%' }}
          onClick={() => setRows((prev) => [...prev, { home: '', away: '' }])}
        >
          + Add set {rows.length + 1}
        </button>
      ) : null}

      <hr className="rule" />

      <div className="spread small">
        <span className="muted">Sets</span>
        <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
          {tally.home} – {tally.away}
        </strong>
      </div>
      <p className="tiny muted" style={{ margin: '6px 0 0' }}>
        {played.length === 0
          ? 'Enter at least one set.'
          : decided
            ? `Saving will finalize this match — ${leader} wins. The bracket advances automatically.`
            : `Not decided yet; saving keeps the match live.`}
      </p>

      <div className="sticky-actions">
        {decided ? (
          <button className="primary" disabled={busy} onClick={() => save(true)}>
            {busy ? 'Saving…' : 'Save & finalize'}
          </button>
        ) : (
          <button className="primary" disabled={busy || played.length === 0} onClick={() => save(false)}>
            {busy ? 'Saving…' : 'Save progress'}
          </button>
        )}
      </div>

      {isAdmin && (match.status === 'final' || sets.length > 0) ? (
        <button
          className="danger"
          style={{ width: '100%', marginTop: 8 }}
          disabled={busy}
          onClick={clearResult}
        >
          Clear result & reset later rounds
        </button>
      ) : null}
    </Sheet>
  )
}
