import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** False when the app has not been pointed at a Supabase project yet. */
export const isConfigured = Boolean(url && anonKey && !url.includes('YOUR-PROJECT-REF'))

export const supabase: SupabaseClient = createClient(
  url ?? 'https://placeholder.supabase.co',
  anonKey ?? 'placeholder-key',
  {
    auth: { persistSession: true, autoRefreshToken: true },
    realtime: { params: { eventsPerSecond: 5 } },
  },
)

/** Turn a PostgREST/RPC error into something worth showing a scorekeeper. */
export function friendlyError(error: unknown): string {
  if (!error) return 'Something went wrong.'
  const message =
    typeof error === 'string'
      ? error
      : ((error as { message?: string }).message ?? String(error))

  if (message.includes('permission') || message.includes('42501') || message.includes('row-level security')) {
    return 'You do not have permission to do that. Ask an admin to change your role.'
  }
  if (message.toLowerCase().includes('email not confirmed')) {
    return 'This account has not confirmed its email yet. Check your inbox, or ask an admin to confirm it in Supabase.'
  }
  if (message.toLowerCase().includes('invalid login credentials')) {
    return 'That email and password do not match an account. If you are sure of the email, use "Forgot password".'
  }
  if (message.toLowerCase().includes('rate limit') || message.includes('429')) {
    return 'Too many attempts just now. Wait a minute and try again.'
  }
  if (message.includes('duplicate key') && message.includes('teams')) {
    return 'A team with that name already exists in this division.'
  }
  if (message.includes('duplicate key')) return 'That name is already taken.'
  if (message.includes('Failed to fetch')) return 'Cannot reach the server. Check your connection.'
  return message
}
