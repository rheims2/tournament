/**
 * Bottom-navigation icons.
 *
 * Drawn as strokes on a 24x24 grid so they inherit the nav's colour and can
 * thicken when a tab is active. Emoji were doing neither, and rendered as a
 * different picture on every platform.
 */
interface IconProps {
  className?: string
}

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false as const,
}

/**
 * Volleyball: the ball outline with three seams.
 *
 * The seam arcs are pushed out so they sweep near the edge instead of meeting
 * in the middle -- converging seams turn into a solid knot at nav size and the
 * ball stops reading as a ball.
 */
export const BallIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <defs>
      <clipPath id="vb-ball-clip">
        <circle cx="12" cy="12" r="9" />
      </clipPath>
    </defs>
    <circle cx="12" cy="12" r="9" />
    <g clipPath="url(#vb-ball-clip)">
      <circle cx="12" cy="-2" r="8" />
      <circle cx="24.12" cy="19" r="8" />
      <circle cx="-0.12" cy="19" r="8" />
    </g>
  </svg>
)

/**
 * Divisions as grouped cells. A bracket glyph was the obvious choice but
 * collapses into a "-|" symbol at nav size; the label already carries the
 * meaning, so the icon only has to be clean and distinct from the others.
 */
export const GroupsIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <rect x="4" y="4" width="6.5" height="6.5" rx="1.7" />
    <rect x="14" y="4" width="6.5" height="6.5" rx="1.7" />
    <rect x="4" y="14" width="6.5" height="6.5" rx="1.7" />
    <rect x="14" y="14" width="6.5" height="6.5" rx="1.7" />
  </svg>
)

/** Sliders read as "settings" far more clearly than a gear at this size. */
export const SlidersIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M4 8h16" />
    <path d="M4 16h16" />
    <circle cx="15" cy="8" r="2.4" />
    <circle cx="9" cy="16" r="2.4" />
  </svg>
)

export const PersonIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="8.5" r="3.75" />
    <path d="M4.5 20c0-3.6 3.4-5.75 7.5-5.75s7.5 2.15 7.5 5.75" />
  </svg>
)

/** Shown over the champion of a finished bracket. */
export const TrophyIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M8 4h8v4.5a4 4 0 0 1-8 0z" />
    <path d="M8 6H5.5A2.5 2.5 0 0 0 8 9.8" />
    <path d="M16 6h2.5A2.5 2.5 0 0 1 16 9.8" />
    <path d="M12 12.5V16" />
    <path d="M8.5 20h7" />
  </svg>
)
