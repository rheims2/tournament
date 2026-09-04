import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useDivisionData, useDivisions, useRefreshTournament } from '../lib/hooks'
import { useTournamentContext } from '../lib/tournamentContext'
import { rankPool } from '../lib/standings'
import { buildSeeds } from '../lib/api'
import { FORMAT_LABEL, type Match } from '../lib/types'
import { MatchCard } from '../components/MatchCard'
import { ScoreSheet } from '../components/ScoreSheet'
import { StandingsTable } from '../components/StandingsTable'
import { BracketView } from '../components/BracketView'
import { Empty, Spinner } from '../components/ui'

type Tab = 'pools' | 'bracket' | 'seeds'

export function DivisionPage() {
  const { divisionId } = useParams<{ divisionId: string }>()
  const { tournament } = useTournamentContext()
  const { data: divisions = [] } = useDivisions(tournament?.id)
  const { data, isLoading } = useDivisionData(divisionId)
  const { canScore } = useAuth()
  const refresh = useRefreshTournament()

  const [tab, setTab] = useState<Tab>('pools')
  const [selected, setSelected] = useState<Match | null>(null)

  const division = divisions.find((d) => d.id === divisionId)

  const pools = useMemo(() => {
    if (!data) return []
    return data.pools.map((pool) => {
      const poolTeams = data.teams.filter((t) => t.pool_id === pool.id)
      const poolMatches = data.matches.filter((m) => m.phase === 'pool' && m.pool_id === pool.id)
      return {
        pool,
        teams: poolTeams,
        matches: poolMatches,
        standings: rankPool(poolTeams, poolMatches, data.setsByMatch),
        complete: poolMatches.length > 0 && poolMatches.every((m) => m.status === 'final'),
      }
    })
  }, [data])

  const seeds = useMemo(
    () => (division && data ? buildSeeds(division, data).seeds : []),
    [division, data],
  )

  if (isLoading || !data) return <Spinner />
  if (!division) return <Empty>Division not found.</Empty>

  const bracketMatches = data.matches.filter((m) => m.phase === 'bracket')
  const unpooled = data.teams.filter((t) => !t.pool_id)

  return (
    <>
      <div className="spread" style={{ marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17 }}>{division.name}</h2>
          <div className="tiny muted">{FORMAT_LABEL[division.bracket_format]}</div>
        </div>
        <Link to="/divisions" className="btn small ghost">
          All divisions
        </Link>
      </div>

      <div className="tabs">
        <button className={tab === 'pools' ? 'active' : ''} onClick={() => setTab('pools')}>
          Pools
        </button>
        <button className={tab === 'bracket' ? 'active' : ''} onClick={() => setTab('bracket')}>
          Bracket
        </button>
        <button className={tab === 'seeds' ? 'active' : ''} onClick={() => setTab('seeds')}>
          Seeding
        </button>
      </div>

      {tab === 'pools' ? (
        pools.length === 0 ? (
          <Empty>
            No pools yet.
            <br />
            <span className="tiny">An admin builds them from the Admin tab.</span>
          </Empty>
        ) : (
          <>
            {pools.map(({ pool, standings, matches, complete }) => (
              <div className="card" key={pool.id}>
                <div className="spread" style={{ marginBottom: 8 }}>
                  <h3 style={{ margin: 0 }}>Pool {pool.name}</h3>
                  <span className={`pill ${complete ? 'final' : ''}`}>
                    {matches.filter((m) => m.status === 'final').length}/{matches.length} played
                  </span>
                </div>
                <StandingsTable records={standings} />
                <details style={{ marginTop: 10 }}>
                  <summary className="small muted" style={{ cursor: 'pointer' }}>
                    {matches.length} games
                  </summary>
                  <div style={{ marginTop: 8 }}>
                    {matches.map((match) => (
                      <MatchCard
                        key={match.id}
                        match={match}
                        sets={data.setsByMatch.get(match.id) ?? []}
                        teamsById={data.teamsById}
                        division={division}
                        onSelect={canScore ? setSelected : undefined}
                      />
                    ))}
                  </div>
                </details>
              </div>
            ))}
            {unpooled.length > 0 ? (
              <p className="tiny muted center">
                {unpooled.length} {unpooled.length === 1 ? 'team is' : 'teams are'} not in a pool yet.
              </p>
            ) : null}
          </>
        )
      ) : null}

      {tab === 'bracket' ? (
        <BracketView
          division={division}
          matches={bracketMatches}
          teamsById={data.teamsById}
          setsByMatch={data.setsByMatch}
          onSelect={canScore ? setSelected : undefined}
        />
      ) : null}

      {tab === 'seeds' ? (
        seeds.length === 0 ? (
          <Empty>Seeding appears once pool games have results.</Empty>
        ) : (
          <div className="card">
            <h3>Bracket seeding</h3>
            <p className="tiny muted" style={{ marginTop: -4 }}>
              Pool winners take the top seeds, then runners-up, and so on. Within a finishing
              position teams are ordered by record, set ratio, then point ratio.
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Team</th>
                    <th>From</th>
                  </tr>
                </thead>
                <tbody>
                  {seeds.map((seed) => (
                    <tr key={seed.teamId}>
                      <td>
                        <span className="rank">{seed.seed}</span>
                        {seed.teamName}
                      </td>
                      <td className="muted">{seed.label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {division.bracket_generated ? (
              <p className="tiny muted" style={{ marginBottom: 0 }}>
                The bracket has been generated. Regenerating it from the Admin tab would use this
                seeding and discard any bracket results.
              </p>
            ) : null}
          </div>
        )
      ) : null}

      {selected ? (
        <ScoreSheet
          match={selected}
          division={division}
          sets={data.setsByMatch.get(selected.id) ?? []}
          teamsById={data.teamsById}
          onClose={() => setSelected(null)}
          onSaved={refresh}
        />
      ) : null}
    </>
  )
}
