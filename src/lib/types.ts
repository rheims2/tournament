export type AppRole = 'viewer' | 'scorekeeper' | 'admin'
export type BracketFormat = 'single' | 'single_consolation' | 'double'
export type MatchPhase = 'pool' | 'bracket'
export type BracketGroup = 'winners' | 'losers' | 'consolation' | 'grand_final'
export type MatchStatus = 'scheduled' | 'in_progress' | 'final'
export type FeedOutcome = 'winner' | 'loser'
export type PoolScoringMode = 'best_of' | 'fixed_sets'

export interface Profile {
  id: string
  email: string | null
  full_name: string | null
  role: AppRole
  created_at: string
}

export interface Tournament {
  id: string
  name: string
  tourney_date: string | null
  location: string | null
  is_active: boolean
  created_at: string
}

export interface Division {
  id: string
  tournament_id: string
  name: string
  position: number
  bracket_format: BracketFormat
  pool_best_of: number
  bracket_best_of: number
  points_to_win: number
  deciding_set_points: number
  win_by: number
  point_cap: number | null
  bracket_generated: boolean
  created_at: string

  /** How pool matches are scored: a best-of, or a fixed number of sets. */
  pool_scoring_mode: PoolScoringMode
  /** Sets per match keyed by pool size, e.g. {"3": 3, "4": 2}. */
  pool_sets_by_size: Record<string, number>
  pool_points_to_win: number
  /** Points both teams start a pool set with. */
  pool_start_score: number
}

export interface Pool {
  id: string
  division_id: string
  name: string
  position: number
  created_at: string
}

export interface Team {
  id: string
  division_id: string
  pool_id: string | null
  name: string
  club: string | null
  bracket_seed: number | null
  created_at: string
}

export interface MatchSet {
  id: string
  match_id: string
  set_number: number
  home_score: number
  away_score: number
}

export interface Match {
  id: string
  division_id: string
  phase: MatchPhase
  pool_id: string | null
  bracket: BracketGroup | null
  round: number
  slot: number
  label: string | null

  home_team_id: string | null
  away_team_id: string | null

  home_source_match_id: string | null
  home_source_outcome: FeedOutcome | null
  away_source_match_id: string | null
  away_source_outcome: FeedOutcome | null

  home_placeholder: string | null
  away_placeholder: string | null

  best_of: number
  /** Play exactly this many sets; null means best-of on best_of. */
  sets_to_play: number | null
  court: string | null
  scheduled_at: string | null

  status: MatchStatus
  is_bye: boolean
  home_sets_won: number
  away_sets_won: number
  winner_team_id: string | null
  loser_team_id: string | null

  created_at: string
  updated_at: string
}

/** A match plus the sets that have been entered for it. */
export interface MatchWithSets extends Match {
  sets: MatchSet[]
}

export const ROLE_LABEL: Record<AppRole, string> = {
  viewer: 'Read only',
  scorekeeper: 'Enter scores',
  admin: 'Admin',
}

export const POOL_MODE_LABEL: Record<PoolScoringMode, string> = {
  best_of: 'Best of N (stops at the clincher)',
  fixed_sets: 'Fixed sets (play them all)',
}

export const FORMAT_LABEL: Record<BracketFormat, string> = {
  single: 'Single elimination',
  single_consolation: 'Single elim + consolation',
  double: 'Double elimination',
}
