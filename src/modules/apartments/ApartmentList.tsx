import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchApartments } from '@/modules/apartments/api'
import { getPendingOutbox } from '@/lib/outbox'
import type { SvApartment, AptType } from '@/lib/database.types'
import { useI18n } from '@/i18n'
import { isToday } from '@/lib/format'
import { Search, CheckCircle2, ChevronRight } from 'lucide-react'

const typeOrder: AptType[] = ['studio', '1br', '2br']

type TypeFilter = 'all' | AptType

export function ApartmentList() {
  const { t, n } = useI18n()
  const typeLabels: Record<AptType, string> = {
    studio: t.apartments.typeStudio,
    '1br': t.apartments.type1br,
    '2br': t.apartments.type2br,
  }
  const navigate = useNavigate()
  const [apartments, setApartments] = useState<SvApartment[]>([])
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [loading, setLoading] = useState(true)
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    fetchApartments()
      .then(setApartments)
      .catch(() => {})
      .finally(() => setLoading(false))
    getPendingOutbox().then((e) => setPendingCount(e.length))
  }, [])

  const grouped = useMemo(() => {
    const filtered = apartments.filter((a) => {
      if (typeFilter !== 'all' && a.type !== typeFilter) return false
      if (search.trim() && !a.code.toLowerCase().includes(search.toLowerCase().trim())) return false
      return true
    })
    const map = new Map<AptType, SvApartment[]>()
    for (const a of filtered) {
      const list = map.get(a.type) ?? []
      list.push(a)
      map.set(a.type, list)
    }
    return typeOrder
      .filter((tp) => map.has(tp))
      .map((tp) => [tp, map.get(tp)!] as const)
  }, [apartments, search, typeFilter])

  return (
    <div className="px-4 pt-6">
      <div className="flex gap-2.5 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.apartments.search}
            className="w-full bg-surface rounded-xl pl-10 pr-4 py-2.5 text-sm border border-line focus:border-accent focus:outline-none"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
          className="bg-surface rounded-xl px-3 py-2.5 text-sm border border-line focus:border-accent focus:outline-none"
        >
          <option value="all">{t.apartments.typeAll}</option>
          {typeOrder.map((tp) => (
            <option key={tp} value={tp}>{typeLabels[tp]}</option>
          ))}
        </select>
      </div>

      {pendingCount > 0 && (
        <div className="mb-4 bg-warn-soft border border-line rounded-xl px-4 py-2.5 text-sm text-warn">
          {t.cleaning.pending}: {n(String(pendingCount))}
        </div>
      )}

      {loading ? (
        <p className="text-center text-muted mt-8">{t.app.loading}</p>
      ) : (
        <div className="space-y-6">
          {grouped.map(([type, apts]) => (
            <div key={type}>
              <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2 px-1">
                {typeLabels[type]}
              </h2>
              <div className="space-y-2">
                {apts.map((apt) => {
                  const cleaned = isToday(apt.last_cleaned_at)
                  return (
                    <button
                      key={apt.id}
                      onClick={() => navigate(`/sv/apartments/${apt.id}`)}
                      className="w-full bg-surface rounded-xl px-4 py-3 flex items-center justify-between border border-line hover:border-accent transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-ink">{apt.code}</span>
                        <span className="text-xs text-muted">{apt.building}</span>
                        {cleaned && (
                          <span className="flex items-center gap-1 text-xs text-ok bg-ok-soft px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="w-3 h-3" />
                            {t.apartments.cleanedToday}
                          </span>
                        )}
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted" />
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
