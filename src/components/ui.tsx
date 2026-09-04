import type { ReactNode } from 'react'

export const Spinner = () => <div className="spinner" role="status" aria-label="Loading" />

export const Empty = ({ children }: { children: ReactNode }) => (
  <div className="empty">{children}</div>
)

export function Banner({
  kind = 'info',
  children,
}: {
  kind?: 'info' | 'error' | 'ok'
  children: ReactNode
}) {
  if (!children) return null
  return (
    <div className={`banner ${kind}`} role={kind === 'error' ? 'alert' : undefined}>
      {children}
    </div>
  )
}

export function Card({ title, children }: { title?: ReactNode; children: ReactNode }) {
  return (
    <div className="card">
      {title ? <h2>{title}</h2> : null}
      {children}
    </div>
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint ? <div className="tiny muted" style={{ marginTop: 4 }}>{hint}</div> : null}
    </div>
  )
}

/** Bottom sheet -- the mobile-friendly stand-in for a modal. */
export function Sheet({
  open,
  onClose,
  children,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
}) {
  if (!open) return null
  return (
    <div
      className="sheet-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        {children}
      </div>
    </div>
  )
}

export function Confirm({
  message,
  confirmLabel = 'Delete',
  onConfirm,
  onCancel,
}: {
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Sheet open onClose={onCancel}>
      <h2 style={{ marginTop: 0 }}>Are you sure?</h2>
      <p className="muted small">{message}</p>
      <div className="sticky-actions">
        <button onClick={onCancel}>Cancel</button>
        <button className="danger" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Sheet>
  )
}

export const formatTime = (iso: string | null): string => {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export const formatDate = (iso: string | null): string => {
  if (!iso) return ''
  // A bare date (YYYY-MM-DD) would otherwise be read as UTC and slip a day.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : new Date(iso)
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}
