import { useState, useEffect, useMemo } from 'react'
import { fetchToOrder, fetchApartmentGaps, fetchShortageEvents, fetchApartmentsAdmin, fetchBuildings, fetchAllIncidents } from '@/modules/admin/api'
import type { ToOrderRow, ApartmentGapRow, EventRow, Apartment, Building, AptType, Incident } from '@/lib/database.types'
import { useI18n } from '@/i18n'
import { formatQty } from '@/lib/format'
import { AlertTriangle, TrendingDown, PackageX, ClipboardList, Boxes, Wrench, ArrowDownToLine, Trash2, CheckCircle2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

function pctColor(p: number): string {
  if (p >= 100) return 'var(--ok)'
  if (p >= 75) return 'var(--warn)'
  return 'var(--bad)'
}

function ProgressBar({ value, color, className }: { value: number; color: string; className?: string }) {
  const { t, n } = useI18n()
  return (
    <span className={`block h-1.5 rounded-full overflow-hidden ${className ?? ''}`} style={{ background: 'var(--line)' }}>
      <span
        className="block h-full rounded-full transition-all"
        style={{ width: `${Math.min(value, 100)}%`, background: color }}
      />
    </span>
  )
}

export function Dashboard() {
  const { t, n } = useI18n()
  const navigate = useNavigate()
  const [toOrder, setToOrder] = useState<ToOrderRow[]>([])
  const [gaps, setGaps] = useState<ApartmentGapRow[]>([])
  const [shortages, setShortages] = useState<EventRow[]>([])
  const [apartments, setApartments] = useState<Apartment[]>([])
  const [buildings, setBuildings] = useState<Building[]>([])
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([fetchToOrder(), fetchApartmentGaps(), fetchShortageEvents(), fetchApartmentsAdmin(), fetchBuildings(), fetchAllIncidents()])
      .then(([to, ga, sh, ap, bl, inc]) => {
        setToOrder(to)
        setGaps(ga)
        setShortages(sh)
        setApartments(ap)
        setBuildings(bl)
        setIncidents(inc)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const buildingMap = useMemo(() => new Map(buildings.map((b) => [b.id, b.name])), [buildings])

  const gapApartments = useMemo(() => {
    const map = new Map<number, { code: string; items: ApartmentGapRow[]; totalNorms: number }>()
    for (const g of gaps) {
      const entry = map.get(g.apartment_id) ?? { code: g.code, items: [], totalNorms: 0 }
      entry.totalNorms++
      if (g.gap > 0) entry.items.push(g)
      map.set(g.apartment_id, entry)
    }
    return map
  }, [gaps])

  const apartmentsByType = useMemo(() => {
    const typeOrder: AptType[] = ['studio', '1br', '2br']
    const typeLabels: Record<AptType, string> = {
      studio: t.apartments.typeStudio,
      '1br': t.apartments.type1br,
      '2br': t.apartments.type2br,
    }
    const map = new Map<AptType, Apartment[]>()
    for (const a of apartments) {
      const list = map.get(a.type) ?? []
      list.push(a)
      map.set(a.type, list)
    }
    return typeOrder.filter((t) => map.has(t)).map((t) => [typeLabels[t], map.get(t)!] as const)
  }, [apartments])

  if (loading) {
    return <div className="px-4 pt-8 text-center text-muted">{t.app.loading}</div>
  }

  const incompleteCount = Array.from(gapApartments.values()).filter((a) => a.items.length > 0).length
  const pendingIncidents = incidents.filter((incident) => incident.status === 'new').length

  const tiles = [
    { label: t.admin.dashboard.toOrder, count: toOrder.length, icon: TrendingDown, tone: 'text-bad', to: '/admin/stock?below=1' },
    { label: t.admin.dashboard.gaps, count: incompleteCount, icon: Boxes, tone: 'text-warn', to: '/admin/apartments' },
    { label: t.admin.dashboard.pendingIncidents, count: pendingIncidents, icon: ClipboardList, tone: 'text-accent', to: '/admin/more/incidents' },
    { label: t.admin.dashboard.unprocessedShortages, count: shortages.length, icon: AlertTriangle, tone: 'text-bad', to: '/admin' },
  ]

  return (
    <div className="px-4 pt-5 pb-28 lg:px-0 lg:pt-0">
      <div className="flex items-center gap-3 mb-5">
        <h1 className="text-xl font-semibold text-ink">{t.admin.nav.home}</h1>
        <button
          onClick={() => navigate('/admin/move')}
          className="ml-auto bg-accent text-white rounded-lg px-3.5 py-2 text-sm font-medium flex items-center gap-1.5 transition-opacity hover:opacity-90"
        >
          {t.admin.move.title}
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-5">
        {tiles.map(({ label, count, icon: Icon, tone, to }) => (
          <button key={label} onClick={() => navigate(to)} className="bg-surface border border-line rounded-xl px-3.5 py-3 text-left transition-colors hover:border-accent">
            <Icon className={`w-5 h-5 ${tone} mb-2`} />
            <b className="text-2xl font-semibold text-ink block">{n(String(count))}</b>
            <span className="text-muted text-xs">{label}</span>
          </button>
        ))}
      </div>

      <section className="bg-surface border border-line rounded-xl p-4 mb-5">
        <h2 className="text-sm font-semibold text-ink mb-3">{t.admin.dashboard.quickActions}</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <button onClick={() => navigate('/admin/move?op=receipt')} className="flex items-center gap-2 bg-app rounded-lg px-3 py-2.5 text-sm text-ink hover:bg-accent-soft"><ArrowDownToLine className="w-4 h-4 text-accent" />{t.admin.move.receipt}</button>
          <button onClick={() => navigate('/admin/move?op=issue_apartment')} className="flex items-center gap-2 bg-app rounded-lg px-3 py-2.5 text-sm text-ink hover:bg-accent-soft"><Wrench className="w-4 h-4 text-accent" />{t.admin.dashboard.issue}</button>
          <button onClick={() => navigate('/admin/move?op=writeoff_warehouse')} className="flex items-center gap-2 bg-app rounded-lg px-3 py-2.5 text-sm text-ink hover:bg-accent-soft"><Trash2 className="w-4 h-4 text-accent" />{t.admin.dashboard.writeoff}</button>
          <button onClick={() => navigate('/admin/apartments')} className="flex items-center gap-2 bg-app rounded-lg px-3 py-2.5 text-sm text-ink hover:bg-accent-soft"><CheckCircle2 className="w-4 h-4 text-accent" />{t.admin.dashboard.assemble}</button>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-5">
        {/* Left: to-order */}
        <section className="bg-surface border border-line rounded-xl p-4">
          <h2 className="text-base font-semibold text-ink mb-3 flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-bad" />
            {t.admin.dashboard.toOrder}
          </h2>
          {toOrder.length === 0 ? (
            <p className="text-muted text-sm">{t.admin.dashboard.noToOrder}</p>
          ) : (
            <>
              {toOrder.slice(0, 10).map((r) => (
                <div key={r.item_id} className="flex items-center gap-3 py-2.5 border-t border-line first:border-t-0">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-ink truncate">{r.name}</div>
                    <div className="text-muted text-xs">{r.category}, {n(formatQty(r.qty, r))} / {n(String(r.min_stock))}</div>
                    <ProgressBar value={(r.qty / r.min_stock) * 100} color="var(--bad)" className="mt-1.5" />
                  </div>
                  <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap bg-bad-soft text-bad">
                    {t.admin.dashboard.shortage}: {n(String(r.shortage))}
                  </span>
                </div>
              ))}
              <button
                onClick={() => navigate('/admin/move')}
                className="mt-3 bg-surface border border-line text-ink rounded-lg px-3.5 py-2 text-sm font-medium transition-colors hover:bg-app"
              >
                {t.admin.move.receipt}
              </button>
            </>
          )}
        </section>

        {/* Right: apartment tiles by type */}
        <section className="bg-surface border border-line rounded-xl p-4">
          <h2 className="text-base font-semibold text-ink mb-3 flex items-center gap-2">
            <PackageX className="w-4 h-4 text-warn" />
            {t.admin.apartments.completeness}
          </h2>
          {apartmentsByType.map(([typeLabel, apts]) => (
            <div key={typeLabel}>
              <div className="font-semibold text-sm text-ink mt-4 mb-2 first:mt-0">{typeLabel}</div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(118px,1fr))] gap-2.5">
                {apts.map((apt) => {
                  const gapData = gapApartments.get(apt.id)
                  const total = gapData?.totalNorms ?? 0
                  const missing = gapData?.items.length ?? 0
                  const p = total > 0 ? Math.round(((total - missing) / total) * 100) : 100
                  const missingQty = gapData?.items.reduce((s, x) => s + x.gap, 0) ?? 0
                  return (
                    <button
                      key={apt.id}
                      onClick={() => navigate(`/admin/apartments/${apt.id}`)}
                      className="text-left bg-surface border border-line rounded-lg px-3 py-2.5 transition-colors hover:border-accent"
                    >
                      <b className="text-base text-ink">{apt.code}</b>
                      <div className="text-muted text-xs">{buildingMap.get(apt.building_id) ?? '?'}</div>
                      <ProgressBar value={p} color={pctColor(p)} className="mt-1.5" />
                      <div className="text-muted text-xs mt-1">
                        {missingQty > 0 ? `${t.admin.dashboard.gap} ${n(String(missingQty))}` : t.admin.apartments.completeness}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </section>
      </div>

      {/* Shortage events */}
      {shortages.length > 0 && (
        <div className="mt-5">
          <div className="flex items-center gap-2 mb-2 px-1">
            <AlertTriangle className="w-4 h-4 text-bad" />
            <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">{t.admin.dashboard.unprocessedShortages}</h2>
          </div>
          <div className="space-y-2">
            {shortages.map((ev) => {
              const payload = ev.payload as { items?: Array<{ item: string; balance: number }> }
              return (
                <div key={ev.id} className="bg-surface rounded-xl border border-line px-4 py-3">
                  {payload.items?.map((it, i) => (
                    <p key={i} className="text-sm text-bad">
                      {it.item}: {n(String(it.balance))}
                    </p>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
