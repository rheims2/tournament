import type { TeamRecord } from '../lib/standings'
import { pointDiff, setDiff } from '../lib/standings'

/**
 * @param advancing how many teams from this pool carry a highlighted line --
 *        purely visual, since every team is seeded into the bracket.
 */
export function StandingsTable({
  records,
  advancing = 0,
}: {
  records: TeamRecord[]
  advancing?: number
}) {
  if (records.length === 0) return <p className="small muted">No teams in this pool yet.</p>

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Team</th>
            <th title="Matches won–lost">W–L</th>
            <th title="Sets won–lost">Sets</th>
            <th title="Set differential">+/-</th>
            <th title="Point differential">Pts</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record, index) => (
            <tr key={record.teamId} className={index < advancing ? 'advancing' : ''}>
              <td>
                <span className="rank">{record.rank}</span>
                {record.teamName}
              </td>
              <td>
                {record.matchWins}–{record.matchLosses}
              </td>
              <td>
                {record.setWins}–{record.setLosses}
              </td>
              <td>{setDiff(record) > 0 ? `+${setDiff(record)}` : setDiff(record)}</td>
              <td>{pointDiff(record) > 0 ? `+${pointDiff(record)}` : pointDiff(record)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
