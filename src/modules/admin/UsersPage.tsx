import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/i18n'
import { toast, errorMessage } from '@/lib/toast'
import { Plus, Trash2, Eye, EyeOff, Copy, Check, X, Lock, CreditCard as Edit3, Shield, QrCode, UserCheck } from 'lucide-react'
import type { AppRole } from '@/lib/database.types'

async function invokeAdminUsers(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke('admin-users', { body })
  if (!error && data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
    throw new Error(data.error)
  }
  if (!error) return (data ?? {}) as Record<string, unknown>
  const context = (error as { context?: unknown }).context
  if (context instanceof Response) {
    try {
      const bodyData = await context.json() as { error?: string }
      if (bodyData.error) throw new Error(bodyData.error)
    } catch (responseError) {
      if (responseError instanceof Error && responseError.message !== 'Unexpected end of JSON input') throw responseError
    }
  }
  throw error
}

interface AdminUser {
  id: string
  login: string
  full_name: string
  role: AppRole
  active: boolean
  created_at: string
}

const ROLE_BADGE: Record<AppRole, { bg: string; text: string; icon: typeof Shield }> = {
  admin: { bg: 'bg-warn-soft', text: 'text-warn', icon: Shield },
  manager: { bg: 'bg-accent-soft', text: 'text-accent', icon: QrCode },
  supervisor: { bg: 'bg-ok-soft', text: 'text-ok', icon: UserCheck },
}

export function UsersPage() {
  const { t } = useI18n()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [createdCreds, setCreatedCreds] = useState<{ login: string; password: string } | null>(null)
  const [copied, setCopied] = useState<'login' | 'password' | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [roleFilter, setRoleFilter] = useState<AppRole | 'all'>('all')

  const load = async () => {
    try {
      const data = await invokeAdminUsers({ action: 'list' })
      setUsers((data.users ?? []) as AdminUser[])
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleSetActive = async (id: string, active: boolean) => {
    try {
      await invokeAdminUsers({ action: 'set_active', id, active: !active })
      toast(active ? t.admin.users.inactive : t.admin.users.active, 'success')
      load()
    } catch (e) {
      const msg = errorMessage(e)
      if (msg === 'self') toast(t.admin.users.selfDeactivateError, 'error')
      else if (msg === 'last_admin') toast(t.admin.users.lastAdminError, 'error')
      else toast(msg, 'error')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t.admin.users.confirmDelete)) return
    try {
      await invokeAdminUsers({ action: 'delete', id })
      toast(t.admin.users.delete, 'success')
      load()
    } catch (e) {
      const msg = errorMessage(e)
      if (msg === 'self') toast(t.admin.users.selfDeleteError, 'error')
      else if (msg === 'last_admin') toast(t.admin.users.lastAdminError, 'error')
      else toast(msg, 'error')
    }
  }

  const copy = (text: string, what: 'login' | 'password') => {
    navigator.clipboard.writeText(text)
    setCopied(what)
    setTimeout(() => setCopied(null), 2000)
  }

  const roleLabel = (role: AppRole): string => {
    if (role === 'admin') return t.admin.users.filterAdmin
    if (role === 'manager') return t.admin.users.filterManager
    return t.admin.users.filterSupervisor
  }

  const filteredUsers = roleFilter === 'all' ? users : users.filter((u) => u.role === roleFilter)

  if (loading) return <div className="px-4 pt-8 text-center text-muted">{t.app.loading}</div>

  return (
    <div className="px-4 pt-6 pb-28">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-ink">{t.admin.users.title}</h1>
        <button
          onClick={() => setAdding(true)}
          className="bg-accent text-white rounded-xl px-4 py-2 text-sm font-medium flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          {t.admin.users.add}
        </button>
      </div>

      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
        {(['all', 'admin', 'manager', 'supervisor'] as const).map((rf) => (
          <button
            key={rf}
            onClick={() => setRoleFilter(rf)}
            className={`rounded-full px-3 py-1.5 text-sm whitespace-nowrap transition-colors border ${
              roleFilter === rf ? 'bg-accent border-accent text-white' : 'bg-surface border-line text-muted'
            }`}
          >
            {rf === 'all' ? t.admin.users.filterAll : roleLabel(rf)}
          </button>
        ))}
      </div>

      {filteredUsers.length === 0 ? (
        <p className="text-sm text-muted text-center mt-8">{t.admin.users.noUsers}</p>
      ) : (
        <div className="space-y-2">
          {filteredUsers.map((u) => {
            const badge = ROLE_BADGE[u.role] ?? ROLE_BADGE.supervisor
            const RoleIcon = badge.icon
            return (
              <div key={u.id} className="bg-surface rounded-xl border border-line px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-ink truncate">{u.full_name}</p>
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${badge.bg} ${badge.text}`}>
                        <RoleIcon className="w-3 h-3" />
                        {roleLabel(u.role)}
                      </span>
                    </div>
                    <p className="text-xs text-muted">{u.login}</p>
                  </div>
                  <button
                    onClick={() => handleSetActive(u.id, u.active)}
                    className={`text-xs px-3 py-1.5 rounded-full font-medium shrink-0 ${u.active ? 'bg-ok-soft text-ok' : 'bg-app text-muted'}`}
                  >
                    {u.active ? t.admin.users.active : t.admin.users.inactive}
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const pw = prompt(t.admin.users.setPassword)
                      if (pw && pw.length >= 8) {
                        invokeAdminUsers({ action: 'set_password', id: u.id, password: pw })
                          .then(() => toast(t.admin.users.setPassword, 'success'))
                          .catch((e: unknown) => toast(errorMessage(e), 'error'))
                      } else if (pw) {
                        toast(t.auth.bootstrapPassword, 'error')
                      }
                    }}
                    className="text-xs bg-app text-ink rounded-lg px-3 py-1.5 flex items-center gap-1.5"
                  >
                    <Lock className="w-3 h-3" />
                    {t.admin.users.setPassword}
                  </button>
                  <button
                    onClick={() => { setRenaming(u.id); setRenameValue(u.full_name) }}
                    className="text-xs bg-app text-ink rounded-lg px-3 py-1.5 flex items-center gap-1.5"
                  >
                    <Edit3 className="w-3 h-3" />
                    {t.admin.users.rename}
                  </button>
                  <button
                    onClick={() => handleDelete(u.id)}
                    className="text-xs bg-bad-soft text-bad rounded-lg px-3 py-1.5 flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3 h-3" />
                    {t.admin.users.delete}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {adding && (
        <UserCreateForm
          onClose={() => setAdding(false)}
          onCreated={(login, password) => {
            setAdding(false)
            setCreatedCreds({ login, password })
            load()
          }}
        />
      )}

      {renaming && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-6">
          <div className="bg-surface rounded-2xl w-full max-w-sm p-5 border border-line">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-ink">{t.admin.users.renameTitle}</h3>
              <button onClick={() => setRenaming(null)}><X className="w-5 h-5 text-muted" /></button>
            </div>
            <input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="w-full bg-app rounded-xl px-4 py-2.5 text-sm focus:outline-none mb-4"
            />
            <div className="flex gap-3">
              <button onClick={() => setRenaming(null)} className="flex-1 bg-app text-ink rounded-xl py-3 font-medium">
                {t.cleaning.cancel}
              </button>
              <button
                onClick={async () => {
                  try {
                    await invokeAdminUsers({ action: 'rename', id: renaming, full_name: renameValue.trim() })
                    toast(t.admin.users.renamed, 'success')
                    setRenaming(null)
                    load()
                  } catch (e) {
                    toast(errorMessage(e), 'error')
                  }
                }}
                disabled={!renameValue.trim()}
                className="flex-1 bg-accent text-white rounded-xl py-3 font-medium disabled:opacity-40"
              >
                {t.admin.users.rename}
              </button>
            </div>
          </div>
        </div>
      )}

      {createdCreds && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-6">
          <div className="bg-surface rounded-2xl w-full max-w-sm p-5 border border-line">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-ink">{t.admin.users.credentialsTitle}</h3>
              <button onClick={() => setCreatedCreds(null)}><X className="w-5 h-5 text-muted" /></button>
            </div>
            <p className="text-sm text-warn bg-warn-soft rounded-xl px-3 py-2.5 mb-4">{t.admin.users.credentialsHint}</p>
            <div className="space-y-3">
              <div className="bg-app rounded-xl px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted">{t.admin.users.login}</p>
                  <p className="text-sm font-medium text-ink">{createdCreds.login}</p>
                </div>
                <button onClick={() => copy(createdCreds.login, 'login')} className="text-accent">
                  {copied === 'login' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <div className="bg-app rounded-xl px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted">{t.admin.users.password}</p>
                  <p className="text-sm font-medium text-ink">{createdCreds.password}</p>
                </div>
                <button onClick={() => copy(createdCreds.password, 'password')} className="text-accent">
                  {copied === 'password' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <button onClick={() => setCreatedCreds(null)} className="w-full mt-4 bg-accent text-white rounded-xl py-3 font-medium">
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function UserCreateForm({ onClose, onCreated }: { onClose: () => void; onCreated: (login: string, password: string) => void }) {
  const { t } = useI18n()
  const [login, setLogin] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<AppRole>('supervisor')
  const [showPw, setShowPw] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const handleCreate = async () => {
    setSubmitting(true)
    try {
      await invokeAdminUsers({ action: 'create', login, full_name: fullName, password, role })
      toast(t.admin.users.created, 'success')
      onCreated(login, password)
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const roleOptions: { value: AppRole; label: string }[] = [
    { value: 'admin', label: t.admin.users.filterAdmin },
    { value: 'manager', label: t.admin.users.filterManager },
    { value: 'supervisor', label: t.admin.users.filterSupervisor },
  ]

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-6">
      <div className="bg-surface rounded-2xl w-full max-w-sm p-5 border border-line">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-ink">{t.admin.users.add}</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-muted" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-ink mb-1">{t.admin.users.login}</label>
            <input
              value={login}
              onChange={(e) => setLogin(e.target.value.toLowerCase())}
              placeholder="a-z 0-9 . _ -"
              className="w-full bg-app rounded-xl px-4 py-2.5 text-sm focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-ink mb-1">{t.admin.users.fullName}</label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full bg-app rounded-xl px-4 py-2.5 text-sm focus:outline-none" />
          </div>
          <div>
            <label className="block text-sm text-ink mb-1">{t.admin.users.roleLabel}</label>
            <div className="flex gap-1.5">
              {roleOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setRole(opt.value)}
                  className={`flex-1 rounded-xl py-2.5 text-sm font-medium transition-colors border ${
                    role === opt.value ? 'bg-accent border-accent text-white' : 'bg-app border-line text-muted'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm text-ink mb-1">{t.admin.users.password}</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="мин. 8 символов"
                className="w-full bg-app rounded-xl px-4 py-2.5 pr-10 text-sm focus:outline-none"
              />
              <button onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
        <div className="flex gap-3 mt-4">
          <button onClick={onClose} className="flex-1 bg-app text-ink rounded-xl py-3 font-medium">{t.cleaning.cancel}</button>
          <button
            onClick={handleCreate}
            disabled={submitting || !login.trim() || !fullName.trim() || password.length < 8}
            className="flex-1 bg-accent text-white rounded-xl py-3 font-medium disabled:opacity-40"
          >
            {t.admin.users.add}
          </button>
        </div>
      </div>
    </div>
  )
}
