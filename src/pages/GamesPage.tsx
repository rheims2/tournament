import { useMemo, useState } from 'react'
import { useAuth } from '../lib/auth'
import { useAllDivisionData, useDivisions, useRefreshTournament } from '../lib/hooks'
import { useTournamentContext } from '../lib/tournamentContext'
import type { Division, Match, MatchSet, Team } from '../lib/types'
import { MatchCard } from '../components/MatchCard'
import { ScoreSheet } from '../components/ScoreSheet'
import { Banner, Empty, Spinner, formatTime } from '../components/ui'
import { friendlyError } from '../lib/supabase'

type Filter = 'up-next' | 'live' | 'final' | 'all'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'up-next', label: 'Up next' },
  { key: 'live', label: 'Live' },
  { key: 'final', label: 'Final' },
  { key: 'all', label: 'All' },
]

interface Row {
  match: Match
  division: Division
  teamsById: Map<string, Team>
  sets: MatchSet[]
}

/** Group by scheduled time, falling back to a bucket per phase. */
function groupRows(rows: Row[]): { heading: string; rows: Row[] }[] {
  const groups = new Map<string, Row[]>()
  for (const row of rows) {
    const heading = row.match.scheduled_at
      ? formatTime(row.match.scheduled_at)
      : row.match.phase === 'pool'
        ? 'Pool play · unscheduled'
        : 'Bracket · unscheduled'
    const list = groups.get(heading) ?? []
    list.push(row)
    groups.set(heading, list)
  }
  return [...groups.entries()].map(([heading, list]) => ({ heading, rows: list }))
}

export function GamesPage() {
  const { canScore } = useAuth()
  const { tournament, loading: tournamentLoading } = useTournamentContext()
  const { data: divisions = [], isLoading: divisionsLoading } = useDivisions(tournament?.id)
  const { byDivision, isLoading, error } = useAllDivisionData(divisions)
  const refresh = useRefreshTournament()

  const [filter, setFilter] = useState<Filter>('up-next')
  const [divisionFilter, setDivisionFilter] = useState<string>('all')
  const [courtFilter, setCourtFilter] = useState<string>('all')
  const [selected, setSelected] = useState<Row | null>(null)

  const allRows = useMemo<Row[]>(() => {
    const rows: Row[] = []
    for (const division of divisions) {
      const data = byDivision.get(division.id)
      if (!data) continue
      for (const match of data.matches) {
        if (match.is_bye) continue
        rows.push({
          match,
          division,
          teamsById: data.teamsById,
          sets: data.setsByMatch.get(match.id) ?? [],
        })
      }
    }

    // Unscheduled games sort last; otherwise by time, then court.
    return rows.sort((a, b) => {
      const at = a.match.scheduled_at ?? '9999'
      const bt = b.match.scheduled_at ?? '9999'
      if (at !== bt) return at < bt ? -1 : 1
      return (a.match.court ?? '').localeCompare(b.match.court ?? '', undefined, { numeric: true })
    })
  }, [divisions, byDivision])

  const courts = useMemo(
    () => [...new Set(allRows.map((r) => r.match.court).filter((c): c is string => Boolean(c)))].sort(
      (a, b) => a.localeCompare(b, undefined, { numeric: true }),
    ),
    [allRows],
  )

  const rows = useMemo(() => {
    return allRows.filter(({ match, division }) => {
      if (divisionFilter !== 'all' && division.id !== divisionFilter) return false
      if (courtFilter !== 'all' && match.court !== courtFilter) return false
      if (filter === 'live') return match.status === 'in_progress'
      if (filter === 'final') return match.status === 'final'
      if (filter === 'up-next') return match.status !== 'final'
      return true
    })
  }, [allRows, filter, divisionFilter, courtFilter])

  if (tournamentLoading || divisionsLoading) return <Spinner />

  if (!tournament) {
    return (
      <Empty>
        No tournament yet.
        <br />
        An admin can create one from the Admin tab.
      </Empty>
    )
  }

  const grouped = groupRows(rows)

  return (
    <>
      <Banner kind="error">{error ? friendlyError(error) : null}</Banner>

      <div className="tabs">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={filter === f.key ? 'active' : ''}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {(divisions.length > 1 || courts.length > 1) && (
        <div className="row wrap" style={{ marginBottom: 12 }}>
          {divisions.length > 1 ? (
            <select
              className="grow"
              aria-label="Filter by division"
              value={divisionFilter}
              onChange={(e) => setDivisionFilter(e.target.value)}
            >
              <option value="all">All divisions</option>
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          ) : null}
          {courts.length > 1 ? (
            <select
              className="grow"
              aria-label="Filter by court"
              value={courtFilter}
              onChange={(e) => setCourtFilter(e.target.value)}
            >
              <option value="all">All courts</option>
              {courts.map((court) => (
                <option key={court} value={court}>
                  Court {court}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      )}

      {isLoading && rows.length === 0 ? <Spinner /> : null}

      {!isLoading && rows.length === 0 ? (
        <Empty>
          {allRows.length === 0
            ? 'No games yet. An admin can build pools from the Admin tab.'
            : 'Nothing matches these filters.'}
        </Empty>
      ) : null}

      {grouped.map((group) => (
        <section key={group.heading}>
          <h3 className="section-title">{group.heading}</h3>
          {group.rows.map((row) => (
            <MatchCard
              key={row.match.id}
              match={row.match}
              sets={row.sets}
              teamsById={row.teamsById}
              division={row.division}
              onSelect={canScore ? () => setSelected(row) : undefined}
            />
          ))}
        </section>
      ))}

      {!canScore && rows.length > 0 ? (
        <p className="tiny muted center" style={{ marginTop: 16 }}>
          Sign in as a scorekeeper to enter results.
        </p>
      ) : null}

      {selected ? (
        <ScoreSheet
          match={selected.match}
          division={selected.division}
          sets={selected.sets}
          teamsById={selected.teamsById}
          onClose={() => setSelected(null)}
          onSaved={refresh}
        />
      ) : null}
    </>
  )
}
