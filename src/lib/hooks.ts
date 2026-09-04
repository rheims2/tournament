import { useEffect } from 'react'
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, isConfigured } from './supabase'
import {
  fetchDivisionData,
  fetchDivisions,
  fetchProfiles,
  fetchTournaments,
  type DivisionData,
} from './api'

export const keys = {
  tournaments: ['tournaments'] as const,
  divisions: (tournamentId: string) => ['divisions', tournamentId] as const,
  divisionData: (divisionId: string) => ['division-data', divisionId] as const,
  profiles: ['profiles'] as const,
}

export function useTournaments() {
  return useQuery({
    queryKey: keys.tournaments,
    queryFn: fetchTournaments,
    enabled: isConfigured,
  })
}

export function useDivisions(tournamentId: string | undefined) {
  return useQuery({
    queryKey: keys.divisions(tournamentId ?? ''),
    queryFn: () => fetchDivisions(tournamentId!),
    enabled: isConfigured && Boolean(tournamentId),
  })
}

export function useDivisionData(divisionId: string | undefined) {
  return useQuery<DivisionData>({
    queryKey: keys.divisionData(divisionId ?? ''),
    queryFn: () => fetchDivisionData(divisionId!),
    enabled: isConfigured && Boolean(divisionId),
  })
}

/**
 * Load every division's data at once, for the tournament-wide schedule.
 * Each division keeps its own cache entry, so a score posted in one division
 * does not refetch the others.
 */
export function useAllDivisionData(divisions: { id: string }[]) {
  const results = useQueries({
    queries: divisions.map((division) => ({
      queryKey: keys.divisionData(division.id),
      queryFn: () => fetchDivisionData(division.id),
      enabled: isConfigured,
    })),
  })

  return {
    byDivision: new Map(
      results
        .map((result, index) => [divisions[index]?.id, result.data] as const)
        .filter((entry): entry is [string, DivisionData] => Boolean(entry[0] && entry[1])),
    ),
    isLoading: results.some((r) => r.isLoading),
    error: results.find((r) => r.error)?.error ?? null,
  }
}

export function useProfiles(enabled: boolean) {
  return useQuery({
    queryKey: keys.profiles,
    queryFn: fetchProfiles,
    enabled: isConfigured && enabled,
  })
}

/**
 * Keep every device in sync. A score posted on the scorekeeper's phone shows
 * up on the spectators' phones without anyone refreshing.
 */
export function useRealtimeSync() {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!isConfigured) return

    const invalidateAll = () => {
      queryClient.invalidateQueries({ queryKey: ['division-data'] })
      queryClient.invalidateQueries({ queryKey: ['divisions'] })
      queryClient.invalidateQueries({ queryKey: keys.tournaments })
    }

    const channel = supabase
      .channel('tournament-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, invalidateAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_sets' }, invalidateAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, invalidateAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pools' }, invalidateAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'divisions' }, invalidateAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournaments' }, invalidateAll)
      .subscribe()

    // Realtime can silently drop on mobile when the screen sleeps; refetch on
    // wake so a scorekeeper never works from a stale bracket.
    const onVisible = () => {
      if (document.visibilityState === 'visible') invalidateAll()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', invalidateAll)

    return () => {
      supabase.removeChannel(channel)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', invalidateAll)
    }
  }, [queryClient])
}

/** Convenience: invalidate everything after a mutation. */
export function useRefreshTournament() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: ['division-data'] })
    queryClient.invalidateQueries({ queryKey: ['divisions'] })
    queryClient.invalidateQueries({ queryKey: keys.tournaments })
    queryClient.invalidateQueries({ queryKey: keys.profiles })
  }
}
