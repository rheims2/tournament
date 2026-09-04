import type { TeamRecord } from '../lib/standings'
import { pointDiff, setDiff } from '../lib/standings'
import type { PoolScoringMode } from '../lib/types'

const signed = (n: number) => (n > 0 ? `+${n}` : String(n))

/**
 * @param advancing how many teams from this pool carry a highlighted line --
 *        purely visual, since every team is seeded into the bracket.
 * @param mode a fixed-set pool is ranked on sets won, so sets lead the table
 *        and the match record moves to the back as context.
 */
export function StandingsTable({
  records,
  advancing = 0,
  mode = 'best_of',
}: {
  records: TeamRecord[]
  advancing?: number
  mode?: PoolScoringMode
}) {
  if (records.length === 0) return <p className="small muted">No teams in this pool yet.</p>

  const fixed = mode === 'fixed_sets'
  const anyTies = records.some((r) => r.matchTies > 0)

  return (
    <div className="table-wrap">
      <table>
        <thead>
          {fixed ? (
            <tr>
              <th>Team</th>
              <th title="Sets won — this is what decides the standings">Sets</th>
              <th title="Point differential">Pts</th>
              <th title={anyTies ? 'Matches won–lost–drawn' : 'Matches won–lost'}>
                {anyTies ? 'W–L–D' : 'W–L'}
              </th>
            </tr>
          ) : (
            <tr>
              <th>Team</th>
              <th title="Matches won–lost">W–L</th>
              <th title="Sets won–lost">Sets</th>
              <th title="Set differential">+/-</th>
              <th title="Point differential">Pts</th>
            </tr>
          )}
        </thead>
        <tbody>
          {records.map((record, index) => (
            <tr key={record.teamId} className={index < advancing ? 'advancing' : ''}>
              <td>
                <span className="rank">{record.rank}</span>
                {record.teamName}
              </td>
              {fixed ? (
                <>
                  <td>
                    <strong>{record.setWins}</strong>
                    <span className="muted">–{record.setLosses}</span>
                  </td>
                  <td>{signed(pointDiff(record))}</td>
                  <td className="muted">
                    {record.matchWins}–{record.matchLosses}
                    {anyTies ? `–${record.matchTies}` : ''}
                  </td>
                </>
              ) : (
                <>
                  <td>
                    {record.matchWins}–{record.matchLosses}
                  </td>
                  <td>
                    {record.setWins}–{record.setLosses}
                  </td>
                  <td>{signed(setDiff(record))}</td>
                  <td>{signed(pointDiff(record))}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
