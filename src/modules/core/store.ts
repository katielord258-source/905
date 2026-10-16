import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { Profile, AppRole } from '@/lib/database.types'
import { toApiError } from '@/lib/errors'
import { get as idbGet, set as idbSet } from 'idb-keyval'
import { startOutboxSync, stopOutboxSync } from '@/lib/outbox'

type AuthState = 'loading' | 'bootstrap' | 'login' | 'ready' | 'no-connection'

interface AuthStore {
  state: AuthState
  profile: Profile | null
  error: string | null
  init: () => Promise<void>
  signIn: (login: string, password: string) => Promise<void>
  bootstrap: (login: string, fullName: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  retryInit: () => Promise<void>
}

const PROFILE_CACHE_KEY = 'sv_profile_cache'

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id,login,full_name,role,active,created_at')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return data
}

async function cacheProfile(profile: Profile | null): Promise<void> {
  if (profile) await idbSet(PROFILE_CACHE_KEY, profile)
}

async function getCachedProfile(): Promise<Profile | null> {
  return (await idbGet<Profile>(PROFILE_CACHE_KEY)) ?? null
}

export const useAuth = create<AuthStore>((set, get) => ({
  state: 'loading',
  profile: null,
  error: null,

  init: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        const { data: needsB } = await supabase.rpc('needs_bootstrap')
        if (needsB) {
          set({ state: 'bootstrap', error: null })
        } else {
          set({ state: 'login', error: null })
        }
        return
      }

      try {
        const profile = await fetchProfile(session.user.id)
        if (!profile || !profile.active) {
          await supabase.auth.signOut()
          set({ state: 'login', profile: null, error: 'Ваш аккаунт отключён. Обратитесь к администратору.' })
          return
        }
        await cacheProfile(profile)
        startOutboxSync(profile.id)
        set({ state: 'ready', profile, error: null })
      } catch (e) {
        const apiError = toApiError(e)
        if (apiError.isNetwork) {
          const cached = await getCachedProfile()
          if (cached && cached.active) {
            startOutboxSync(cached.id)
            set({ state: 'ready', profile: cached, error: null })
          } else {
            set({ state: 'no-connection', profile: null, error: null })
          }
        } else {
          if (apiError.isAuth) {
            await supabase.auth.signOut()
            set({ state: 'login', profile: null, error: null })
          } else {
            set({ state: 'login', profile: null, error: apiError.message })
          }
        }
      }
    } catch (e) {
      const apiError = toApiError(e)
      if (apiError.isNetwork) {
        set({ state: 'no-connection', profile: null, error: null })
      } else {
        set({ state: 'login', profile: null, error: apiError.message })
      }
    }
  },

  retryInit: async () => {
    set({ state: 'loading', error: null })
    await get().init()
  },

  signIn: async (login, password) => {
    set({ error: null })
    const email = `${login.toLowerCase().trim()}@sklad.internal`
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) {
      set({ error: 'Неверный логин или пароль' })
      return
    }
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      set({ error: 'Неверный логин или пароль' })
      return
    }
    try {
      const profile = await fetchProfile(session.user.id)
      if (!profile || !profile.active) {
        await supabase.auth.signOut()
        set({ state: 'login', profile: null, error: 'Ваш аккаунт отключён. Обратитесь к администратору.' })
        return
      }
      await cacheProfile(profile)
      startOutboxSync(profile.id)
      set({ state: 'ready', profile, error: null })
    } catch (e) {
      const apiError = toApiError(e)
      if (apiError.isNetwork) {
        const cached = await getCachedProfile()
        if (cached && cached.active) {
          startOutboxSync(cached.id)
          set({ state: 'ready', profile: cached, error: null })
        } else {
          set({ error: 'Нет соединения с сервером' })
        }
      } else {
        set({ error: apiError.message })
      }
    }
  },

  bootstrap: async (login, fullName, password) => {
    set({ error: null })
    const email = `${login.toLowerCase().trim()}@sklad.internal`
    const { data, error: signUpError } = await supabase.auth.signUp({ email, password })
    if (signUpError) {
      set({ error: signUpError.message })
      return
    }
    if (!data.session) {
      set({ error: 'Отключите подтверждение email в настройках Auth' })
      return
    }
    const { error: claimError } = await supabase.rpc('claim_first_admin', {
      p_login: login.toLowerCase().trim(),
      p_full_name: fullName.trim(),
    })
    if (claimError) {
      set({ error: claimError.message })
      return
    }
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      set({ error: 'Ошибка создания сессии' })
      return
    }
    const profile = await fetchProfile(session.user.id)
    if (!profile || !profile.active) {
      set({ error: 'Ошибка: профиль не создан' })
      return
    }
    await cacheProfile(profile)
    startOutboxSync(profile.id)
    set({ state: 'ready', profile, error: null })
  },

  signOut: async () => {
    stopOutboxSync()
    await supabase.auth.signOut()
    set({ state: 'login', profile: null, error: null })
  },
}))

let authListenerSetup = false

export function setupAuthListener() {
  if (authListenerSetup) return
  authListenerSetup = true

  supabase.auth.onAuthStateChange((event) => {
    const store = useAuth.getState()

    if (event === 'SIGNED_OUT') {
      stopOutboxSync()
      store.signOut()
      return
    }

    if (event === 'USER_UPDATED') {
      const session = supabase.auth.getSession()
      session.then(({ data: { session: s } }) => {
        if (s) {
          fetchProfile(s.user.id).then((profile) => {
            if (profile && profile.active) {
              cacheProfile(profile)
              useAuth.setState({ profile, error: null })
            }
          }).catch(() => {})
        }
      })
      return
    }

    if (event === 'TOKEN_REFRESHED') {
      // Session refreshed successfully — no action needed
      return
    }

    // For any other event, check if token refresh failed
    // This is handled by the error in onAuthStateChange
  })
}

export function homePathForRole(role: AppRole): string {
  if (role === 'admin') return '/admin'
  if (role === 'manager') return '/qr'
  return '/sv'
}
