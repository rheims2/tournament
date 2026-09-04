import { useMemo, useState } from 'react'
import { reopenMatch, submitScore, type SetScore } from '../lib/api'
import { friendlyError } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { formatFor, isFixedSets, maxSetsOf, rulesFor, setTarget, setsNeeded, tallySets } from '../lib/scoring'
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

const toRows = (sets: MatchSet[], startScore: number, minRows: number): Row[] => {
  const rows: Row[] =
    sets.length > 0
      ? sets.map((s) => ({ home: String(s.home_score), away: String(s.away_score) }))
      : []
  // A format that starts both teams at 4 pre-fills 4-4 so the scorekeeper only
  // types what actually changed.
  const blank = (): Row =>
    startScore > 0
      ? { home: String(startScore), away: String(startScore) }
      : { home: '', away: '' }
  while (rows.length < Math.max(1, minRows)) rows.push(blank())
  return rows
}

const num = (value: string) => {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

/** Both blank means the set has not been played and is dropped on save. */
const isBlank = (row: Row) => row.home.trim() === '' && row.away.trim() === ''

export function ScoreSheet({ match, division, sets, teamsById, onClose, onSaved }: Props) {
  const { isAdmin } = useAuth()
  const rules = useMemo(() => rulesFor(division, match.phase), [division, match.phase])
  const format = useMemo(() => formatFor(match), [match])
  const fixedSets = isFixedSets(format)
  const maxSets = maxSetsOf(format)

  const [rows, setRows] = useState<Row[]>(() =>
    // A fixed-set match shows every set up front -- they all get played.
    toRows(sets, rules.startScore, fixedSets ? maxSets : 1),
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const homeTeam = match.home_team_id ? teamsById.get(match.home_team_id) : undefined
  const awayTeam = match.away_team_id ? teamsById.get(match.away_team_id) : undefined

  const needed = setsNeeded(format.bestOf)

  const played = useMemo(
    () => rows.filter((r) => !isBlank(r)).map((r) => ({ home: num(r.home), away: num(r.away) })),
    [rows],
  )
  const tally = useMemo(() => tallySets(played, format, rules), [played, format, rules])

  const decided = tally.decidedAt !== null
  const leader = tally.homeSets > tally.awaySets ? homeTeam?.name : awayTeam?.name

  // A set left unfinished before the clinching one is almost always a typo,
  // so block the save rather than banking a bogus set score.
  const badSet = tally.firstIncompleteBeforeDecider

  const targetFor = (index: number) => setTarget(index + 1, maxSets, rules)

  function setRow(index: number, side: 'home' | 'away', value: string) {
    const clean = value.replace(/\D/g, '').slice(0, 3)
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [side]: clean } : row)))
  }

  async function save(finalize: boolean) {
    setError(null)
    setBusy(true)
    try {
      // Discard anything entered after the match was already decided.
      const payload: SetScore[] =
        finalize && tally.decidedAt !== null ? played.slice(0, tally.decidedAt) : played
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
        {fixedSets
          ? `${maxSets} ${maxSets === 1 ? 'set' : 'sets'}, all played`
          : `Best of ${format.bestOf} · first to ${needed} ${needed === 1 ? 'set' : 'sets'}`}
        {' · '}
        {rules.startScore > 0 ? `from ${rules.startScore}-${rules.startScore} ` : ''}
        to {rules.pointsToWin}, win by {rules.winBy}
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
            disabled={rows.length === 1 || fixedSets}
            onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
          >
            ✕
          </button>
        </div>
      ))}

      {rows.length < maxSets && !fixedSets ? (
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
        <span className="muted">Completed sets</span>
        <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
          {tally.homeSets} – {tally.awaySets}
        </strong>
      </div>
      <p className="tiny muted" style={{ margin: '6px 0 0' }}>
        {badSet !== null
          ? `Set ${badSet} is not a finished set — first to ${targetFor(badSet - 1)}, win by ${rules.winBy}. Fix it to finalize.`
          : played.length === 0
            ? 'Enter at least one set.'
            : decided
              ? tally.isDraw
                ? 'Saving will finalize this match as a 1–1 draw. Both teams bank one set.'
                : `Saving will finalize this match — ${leader} wins.${
                    match.phase === 'bracket' ? ' The bracket advances automatically.' : ''
                  }`
              : fixedSets
                ? `${tally.setsRemaining} more ${tally.setsRemaining === 1 ? 'set' : 'sets'} to play. Saving keeps the match live.`
                : `In progress: first to ${needed} ${needed === 1 ? 'set' : 'sets'} wins. Saving keeps the match live.`}
      </p>

      <div className="sticky-actions">
        {decided && badSet === null ? (
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
