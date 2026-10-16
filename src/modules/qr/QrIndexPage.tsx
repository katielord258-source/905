import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/i18n'
import type { SvApartment } from '@/lib/database.types'
import { Search, ChevronRight } from 'lucide-react'

export function QrIndexPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [apartments, setApartments] = useState<SvApartment[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    supabase
      .from('sv_apartments')
      .select('id,code,building,type,status,last_cleaned_at')
      .order('code')
      .then(({ data, error }) => {
        if (error) console.error(error.message)
        setApartments(data ?? [])
        setLoading(false)
      })
  }, [])

  const grouped = useMemo(() => {
    const map = new Map<string, SvApartment[]>()
    const q = search.toLowerCase().trim()
    for (const a of apartments) {
      if (q && !a.code.toLowerCase().includes(q) && !a.building.toLowerCase().includes(q)) continue
      const list = map.get(a.building) ?? []
      list.push(a)
      map.set(a.building, list)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [apartments, search])

  if (loading) return <div className="px-4 pt-8 text-center text-muted">{t.app.loading}</div>

  return (
    <div className="px-4 pt-4 pb-8">
      <h1 className="text-lg font-semibold text-ink mb-4">{t.qr.qrIndexTitle}</h1>
      <div className="relative mb-4">
        <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t.qr.search}
          className="w-full bg-surface rounded-lg pl-10 pr-4 py-2.5 text-sm border border-line focus:border-accent focus:outline-none"
        />
      </div>
      {grouped.length === 0 ? (
        <p className="text-sm text-muted text-center mt-8">{t.qr.noApartments}</p>
      ) : (
        <div className="space-y-4">
          {grouped.map(([building, list]) => (
            <div key={building}>
              <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">{building}</h2>
              <div className="bg-surface rounded-xl border border-line divide-y divide-[var(--line)]">
                {list.map((apt) => (
                  <button
                    key={apt.id}
                    onClick={() => navigate(`/qr/${apt.id}`)}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-app transition-colors text-left"
                  >
                    <div>
                      <span className="text-sm font-medium text-ink">{apt.code}</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted" />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
