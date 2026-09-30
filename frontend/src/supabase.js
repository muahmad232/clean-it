import { createClient } from '@supabase/supabase-js'

let supabaseInstance = null
let initPromise = null

export function syncAuthSession(session) {
  if (session?.user?.id) {
    localStorage.setItem('cleanit_user_id', session.user.id)
  } else {
    localStorage.removeItem('cleanit_user_id')
  }
  if (session?.access_token) {
    localStorage.setItem('cleanit_access_token', session.access_token)
  } else {
    localStorage.removeItem('cleanit_access_token')
  }
}

/**
 * Initializes and returns the Supabase client instance.
 * Automatically fetches the public project URL and anon key from backend or env.
 */
export async function getSupabase() {
  if (supabaseInstance) return supabaseInstance
  if (initPromise) return initPromise

  initPromise = (async () => {
    // 1. Check Vite env variables first
    let url = import.meta.env.VITE_SUPABASE_URL
    let anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

    // 2. Fallback to backend config endpoint
    if (!url || !anonKey) {
      try {
        const res = await fetch('/api/v1/auth/config')
        if (res.ok) {
          const data = await res.json()
          url = data.supabase_url
          anonKey = data.supabase_anon_key
        }
      } catch (err) {
        console.warn('Could not fetch Supabase auth config from backend:', err)
      }
    }

    if (!url || !anonKey) {
      console.warn('Supabase credentials not configured yet.')
      return null
    }

    supabaseInstance = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })

    // Auto-sync session tokens
    supabaseInstance.auth.onAuthStateChange((_event, session) => {
      syncAuthSession(session)
    })
    supabaseInstance.auth.getSession().then(({ data }) => {
      if (data?.session) syncAuthSession(data.session)
    })

    return supabaseInstance
  })()

  return initPromise
}

/**
 * Sign up with Email and Password
 */
export async function signUpWithEmail(email, password, fullName = '') {
  const client = await getSupabase()
  if (!client) throw new Error('Supabase client not initialized')

  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
      },
    },
  })

  if (error) throw error
  return data
}

/**
 * Sign in with Email and Password
 */
export async function signInWithEmail(email, password) {
  const client = await getSupabase()
  if (!client) throw new Error('Supabase client not initialized')

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  })

  if (error) throw error
  return data
}

/**
 * Sign in with Google (OAuth)
 */
export async function signInWithGoogle() {
  const client = await getSupabase()
  if (!client) throw new Error('Supabase client not initialized')

  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
    },
  })

  if (error) throw error
  return data
}

/**
 * Sign out
 */
export async function signOutUser() {
  const client = await getSupabase()
  if (!client) return

  const { error } = await client.auth.signOut()
  if (error) console.error('Sign out error:', error)
  localStorage.removeItem('cleanit_user_id')
}

/**
 * Get current session
 */
export async function getCurrentSession() {
  const client = await getSupabase()
  if (!client) return null

  const { data } = await client.auth.getSession()
  return data.session
}
