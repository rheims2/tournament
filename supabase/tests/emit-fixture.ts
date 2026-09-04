// Emits the SQL fixture for a real generated bracket, so the database is
// exercised against exactly what the app inserts.
import { generateBracket, type SeededTeam } from '../../src/lib/bracket'

const q = (v: string | null) => (v === null ? 'null' : `'${v.replace(/'/g, "''")}'`)

function emit(divId: string, n: number, format: 'single' | 'single_consolation' | 'double') {
  const seeds: SeededTeam[] = Array.from({ length: n }, (_, i) => ({
    seed: i + 1,
    teamId: `${divId.slice(0, 24)}${String(i + 1).padStart(12, '0')}`,
    teamName: `Team ${i + 1}`,
    label: `Seed ${i + 1}`,
  }))
  const planned = generateBracket({ seeds, format, bestOf: 3 })

  const lines: string[] = []
  for (const t of seeds) {
    lines.push(
      `insert into teams (id, division_id, name, bracket_seed) values (${q(t.teamId)}::uuid, ${q(divId)}::uuid, ${q(t.teamName)}, ${t.seed});`,
    )
  }
  for (const m of planned) {
    lines.push(
      `insert into matches (id, division_id, phase, bracket, round, slot, label, best_of, home_team_id, away_team_id, home_placeholder, away_placeholder, status, is_bye, winner_team_id, loser_team_id) values (` +
        [
          `${q(m.id)}::uuid`, `${q(divId)}::uuid`, `'bracket'`, `'${m.bracket}'`,
          m.round, m.slot, q(m.label), m.bestOf,
          m.homeTeamId ? `${q(m.homeTeamId)}::uuid` : 'null',
          m.awayTeamId ? `${q(m.awayTeamId)}::uuid` : 'null',
          q(m.homePlaceholder), q(m.awayPlaceholder),
          `'${m.status}'`, m.isBye,
          m.winnerTeamId ? `${q(m.winnerTeamId)}::uuid` : 'null',
          m.loserTeamId ? `${q(m.loserTeamId)}::uuid` : 'null',
        ].join(', ') + `);`,
    )
  }
  for (const m of planned) {
    if (!m.homeSourceMatchId && !m.awaySourceMatchId) continue
    lines.push(
      `update matches set home_source_match_id = ${m.homeSourceMatchId ? `${q(m.homeSourceMatchId)}::uuid` : 'null'}, ` +
        `home_source_outcome = ${m.homeSourceOutcome ? `'${m.homeSourceOutcome}'` : 'null'}, ` +
        `away_source_match_id = ${m.awaySourceMatchId ? `${q(m.awaySourceMatchId)}::uuid` : 'null'}, ` +
        `away_source_outcome = ${m.awaySourceOutcome ? `'${m.awaySourceOutcome}'` : 'null'} where id = ${q(m.id)}::uuid;`,
    )
  }
  return lines.join('\n')
}

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'
console.log(`-- 8-team single elim\n${emit(A, 8, 'single')}`)
console.log(`-- 5-team single elim (byes)\n${emit(B, 5, 'single')}`)
console.log(`-- 6-team double elim (byes)\n${emit(C, 6, 'double')}`)
