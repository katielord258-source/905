import { NavLink, useLocation } from 'react-router-dom'
import { useI18n } from '@/i18n'
import { LangSwitcher } from '@/components/LangSwitcher'
import { Building2, Wrench, Phone, User } from 'lucide-react'
import { useEffect } from 'react'

export function SvLayout({ children }: { children: React.ReactNode }) {
  const { t, lang } = useI18n()
  const { pathname } = useLocation()

  const tabs = [
    { to: '/sv', icon: Building2, label: t.nav.apartments, end: true },
    { to: '/sv/incidents', icon: Wrench, label: t.nav.incidents },
    { to: '/sv/contacts', icon: Phone, label: t.nav.contacts },
    { to: '/sv/profile', icon: User, label: t.nav.profile },
  ]

  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
    document.documentElement.lang = lang
  }, [lang])

  return (
    <div className="min-h-screen bg-app flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 bg-surface border-b border-line sticky top-0 z-30 max-w-lg mx-auto w-full">
        <span className="font-semibold text-ink text-sm">{t.app.name}</span>
        <LangSwitcher compact />
      </div>
      <main className="flex-1 pb-20 max-w-lg mx-auto w-full">{children}</main>
      <nav className="fixed bottom-0 left-0 right-0 bg-surface border-t border-line z-50">
        <div className="max-w-lg mx-auto flex">
          {tabs.map((tab) => {
            const active = tab.end ? pathname === tab.to : pathname.startsWith(tab.to)
            const Icon = tab.icon
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className="flex-1 flex flex-col items-center gap-0.5 py-2.5"
                style={{ paddingBottom: 'calc(0.625rem + env(safe-area-inset-bottom, 0px))' }}
              >
                <Icon
                  className={`w-5 h-5 transition-colors ${active ? 'text-accent' : 'text-muted'}`}
                  strokeWidth={active ? 2.2 : 1.8}
                />
                <span className={`text-[11px] transition-colors ${active ? 'text-accent font-medium' : 'text-muted'}`}>
                  {tab.label}
                </span>
              </NavLink>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
