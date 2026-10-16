import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { Profile, AppRole } from '@/lib/database.types'

type AuthState = 'loading' | 'bootstrap' | 'login' | 'ready'

interface AuthStore {
  state: AuthState
  profile: Profile | null
  error: string | null
  init: () => Promise<void>
  signIn: (login: string, password: string) => Promise<void>
  bootstrap: (login: string, fullName: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

export const useAuth = create<AuthStore>((set) => ({
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
      const { data: profile } = await supabase
        .from('profiles')
        .select('id,login,full_name,role,active,created_at')
        .eq('id', session.user.id)
        .single()
      if (!profile || !profile.active) {
        await supabase.auth.signOut()
        set({ state: 'login', profile: null, error: 'Ваш аккаунт отключён. Обратитесь к администратору.' })
        return
      }
      set({ state: 'ready', profile, error: null })
    } catch (e) {
      set({ state: 'login', profile: null, error: e instanceof Error ? e.message : String(e) })
    }
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
    const { data: profile } = await supabase
      .from('profiles')
      .select('id,login,full_name,role,active,created_at')
      .eq('id', session.user.id)
      .single()
    if (!profile || !profile.active) {
      await supabase.auth.signOut()
      set({ state: 'login', profile: null, error: 'Ваш аккаунт отключён. Обратитесь к администратору.' })
      return
    }
    set({ state: 'ready', profile, error: null })
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
    const { data: profile } = await supabase
      .from('profiles')
      .select('id,login,full_name,role,active,created_at')
      .eq('id', session.user.id)
      .single()
    if (!profile || !profile.active) {
      set({ error: 'Ошибка: профиль не создан' })
      return
    }
    set({ state: 'ready', profile, error: null })
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ state: 'login', profile: null, error: null })
  },
}))

export function homePathForRole(role: AppRole): string {
  if (role === 'admin') return '/admin'
  if (role === 'manager') return '/qr'
  return '/sv'
}
