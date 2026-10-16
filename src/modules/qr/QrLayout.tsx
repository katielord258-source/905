import { useEffect } from 'react'
import { useI18n } from '@/i18n'
import { useAuth } from '@/modules/core/store'
import { LangSwitcher } from '@/components/LangSwitcher'
import { LogOut, Shield } from 'lucide-react'

export function QrLayout({ children }: { children: React.ReactNode }) {
  const { t, lang } = useI18n()
  const profile = useAuth((s) => s.profile)
  const signOut = useAuth((s) => s.signOut)

  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
    document.documentElement.lang = lang
  }, [lang])

  return (
    <div className="min-h-screen bg-app flex flex-col">
      {profile?.role === 'admin' && (
        <div className="bg-warn-soft text-warn text-center text-sm py-2 font-medium flex items-center justify-center gap-2">
          <Shield className="w-4 h-4" />
          {t.qr.adminNotice}
        </div>
      )}
      <div className="flex items-center justify-between px-4 py-2 bg-surface border-b border-line sticky top-0 z-30 max-w-lg mx-auto w-full">
        <span className="font-semibold text-ink text-sm">{t.app.name}</span>
        <div className="flex items-center gap-3">
          <LangSwitcher compact />
          <button onClick={signOut} className="text-muted hover:text-bad">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
      <main className="flex-1 pb-20 max-w-lg mx-auto w-full">{children}</main>
    </div>
  )
}
