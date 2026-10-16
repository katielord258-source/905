import { useState, useEffect, useMemo, useCallback } from 'react'
import QRCode from 'qrcode'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/i18n'
import { toast, errorMessage } from '@/lib/toast'
import { Search, Printer, Copy, QrCode } from 'lucide-react'
import type { SvApartment } from '@/lib/database.types'

const SETTINGS_KEY = 'app_base_url'

function useAppBaseUrl(): [string, (v: string) => void] {
  const [url, setUrl] = useState<string>(window.location.origin)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    supabase
      .from('settings')
      .select('value')
      .eq('key', SETTINGS_KEY)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.value) {
          try { setUrl(JSON.parse(data.value as string)) } catch { /* ignore */ }
        }
        setLoaded(true)
      })
  }, [])

  const save = useCallback((v: string) => {
    setUrl(v)
    if (!loaded) return
    supabase
      .from('settings')
      .upsert({ key: SETTINGS_KEY, value: JSON.stringify(v) })
      .then(({ error }) => {
        if (error) toast(errorMessage(error), 'error')
      })
  }, [loaded])

  return [url, save]
}

export function QrPage() {
  const { t, n } = useI18n()
  const [baseUrl, setBaseUrl] = useAppBaseUrl()
  const [apartments, setApartments] = useState<SvApartment[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [qrCache, setQrCache] = useState<Map<number, string>>(new Map())

  useEffect(() => {
    supabase
      .from('sv_apartments')
      .select('id,code,building,type,status,last_cleaned_at')
      .order('code')
      .then(({ data, error }) => {
        if (error) toast(errorMessage(error), 'error')
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

  const visibleApts = useMemo(() => grouped.flatMap(([, list]) => list), [grouped])

  const generateQr = useCallback(async (aptId: number, url: string) => {
    const cached = qrCache.get(aptId)
    if (cached) return cached
    const dataUrl = await QRCode.toDataURL(`${url}/qr/${aptId}`, { width: 256, margin: 1 })
    setQrCache((prev) => new Map(prev).set(aptId, dataUrl))
    return dataUrl
  }, [qrCache])

  useEffect(() => {
    for (const apt of visibleApts.slice(0, 30)) {
      if (!qrCache.has(apt.id)) generateQr(apt.id, baseUrl)
    }
  }, [visibleApts, baseUrl, qrCache, generateQr])

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => setSelected(new Set(visibleApts.map((a) => a.id)))
  const deselectAll = () => setSelected(new Set())

  const copyLink = async (aptId: number) => {
    try {
      await navigator.clipboard.writeText(`${baseUrl}/qr/${aptId}`)
      toast(t.qr.linkCopied, 'success')
    } catch {
      toast(t.common.clipboardError, 'error')
    }
  }

  const handlePrint = async () => {
    const targets = selected.size > 0 ? visibleApts.filter((a) => selected.has(a.id)) : visibleApts
    for (const apt of targets) {
      if (!qrCache.has(apt.id)) await generateQr(apt.id, baseUrl)
    }
    window.print()
  }

  if (loading) return <div className="px-4 pt-8 text-center text-muted">{t.app.loading}</div>

  return (
    <div className="px-4 pt-5 pb-28 lg:px-0 lg:pt-0">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-ink flex items-center gap-2">
          <QrCode className="w-5 h-5 text-accent" />
          {t.qr.title}
        </h1>
        <button
          onClick={handlePrint}
          className="bg-accent text-white rounded-lg px-3.5 py-2 text-sm font-medium flex items-center gap-1.5 no-print"
        >
          <Printer className="w-4 h-4" />
          {t.qr.print}
        </button>
      </div>

      <div className="mb-4 no-print">
        <label className="block text-sm font-medium text-ink mb-1.5">{t.qr.appUrl}</label>
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          className="w-full bg-surface rounded-lg px-4 py-2.5 text-sm border border-line focus:border-accent focus:outline-none mb-1"
        />
        <p className="text-xs text-warn">{t.qr.appUrlHint}</p>
      </div>

      <div className="flex items-center gap-2 mb-3 no-print">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.qr.search}
            className="w-full bg-surface rounded-lg pl-10 pr-4 py-2.5 text-sm border border-line focus:border-accent focus:outline-none"
          />
        </div>
      </div>

      <div className="flex gap-2 mb-4 no-print">
        <button onClick={selectAll} className="text-sm text-accent">{t.qr.selectAll}</button>
        <span className="text-muted">·</span>
        <button onClick={deselectAll} className="text-sm text-muted">{t.qr.deselectAll}</button>
        {selected.size > 0 && <span className="text-sm text-muted ml-auto">{n(String(selected.size))}</span>}
      </div>

      {apartments.length === 0 ? (
        <p className="text-sm text-muted text-center mt-8">{t.qr.noApartments}</p>
      ) : (
        <div className="space-y-6">
          {grouped.map(([building, list]) => (
            <div key={building}>
              <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-2 no-print">{building}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {list.map((apt) => (
                  <QrCard
                    key={apt.id}
                    apt={apt}
                    qrDataUrl={qrCache.get(apt.id)}
                    baseUrl={baseUrl}
                    isSelected={selected.has(apt.id)}
                    onToggle={() => toggleSelect(apt.id)}
                    onCopy={() => copyLink(apt.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Print area */}
      <div className="hidden print:block">
        <div className="qr-print-grid">
          {(selected.size > 0 ? visibleApts.filter((a) => selected.has(a.id)) : visibleApts).map((apt) => {
            const qr = qrCache.get(apt.id)
            return (
              <div key={apt.id} className="qr-print-cell">
                {qr && <img src={qr} alt={apt.code} className="qr-print-img" />}
                <div className="qr-print-code">{apt.code}</div>
                <div className="qr-print-building">{apt.building}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function QrCard({
  apt,
  qrDataUrl,
  baseUrl,
  isSelected,
  onToggle,
  onCopy,
}: {
  apt: SvApartment
  qrDataUrl: string | undefined
  baseUrl: string
  isSelected: boolean
  onToggle: () => void
  onCopy: () => void
}) {
  const { t } = useI18n()
  return (
    <div
      className={`bg-surface border rounded-xl p-3 flex flex-col items-center gap-2 no-print transition-colors cursor-pointer ${
        isSelected ? 'border-accent bg-accent-soft' : 'border-line'
      }`}
      onClick={onToggle}
    >
      {qrDataUrl ? (
        <img src={qrDataUrl} alt={apt.code} className="w-28 h-28" />
      ) : (
        <div className="w-28 h-28 bg-app rounded-lg animate-pulse" />
      )}
      <div className="text-sm font-semibold text-ink">{apt.code}</div>
      <div className="text-xs text-muted">{apt.building}</div>
      <button
        onClick={(e) => { e.stopPropagation(); onCopy() }}
        className="flex items-center gap-1 text-xs text-accent"
      >
        <Copy className="w-3 h-3" />
        {t.qr.copyLink}
      </button>
    </div>
  )
}
