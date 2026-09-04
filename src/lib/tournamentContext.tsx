import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTournaments } from './hooks'
import type { Tournament } from './types'

const STORAGE_KEY = 'vb.activeTournament'

interface Value {
  tournaments: Tournament[]
  tournament: Tournament | null
  setTournamentId: (id: string) => void
  loading: boolean
  error: unknown
}

const Ctx = createContext<Value | null>(null)

export function TournamentProvider({ children }: { children: ReactNode }) {
  const { data: tournaments = [], isLoading, error } = useTournaments()
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY)
    } catch {
      return null
    }
  })

  // Fall back to the first active tournament if nothing is chosen (or the
  // stored choice has since been deleted).
  const tournament = useMemo(() => {
    if (tournaments.length === 0) return null
    return (
      tournaments.find((t) => t.id === selectedId) ??
      tournaments.find((t) => t.is_active) ??
      tournaments[0]
    )
  }, [tournaments, selectedId])

  useEffect(() => {
    if (!tournament) return
    try {
      localStorage.setItem(STORAGE_KEY, tournament.id)
    } catch {
      // Private browsing; the fallback above still works.
    }
  }, [tournament])

  const value = useMemo<Value>(
    () => ({
      tournaments,
      tournament,
      setTournamentId: setSelectedId,
      loading: isLoading,
      error,
    }),
    [tournaments, tournament, isLoading, error],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTournamentContext(): Value {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTournamentContext must be used inside <TournamentProvider>')
  return ctx
}
