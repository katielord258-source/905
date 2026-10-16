import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fetchNorms, fetchStaff } from '@/modules/apartments/api'
import { completeCleaning, queueCleaningOffline, isNetworkError } from '@/modules/cleaning/api'
import { useAuth } from '@/modules/core/store'
import type { SvNorm, SvStaff, NormType, CleaningResult } from '@/lib/database.types'
import { useI18n } from '@/i18n'
import { friendlyMessage } from '@/lib/errors'
import { formatQty } from '@/lib/format'
import { X, Check, Loader2, AlertTriangle, Star, RefreshCw } from 'lucide-react'

const writeoffTypes: NormType[] = ['turnover_replenish', 'cleaning_consumption']

export function CleaningSheet({ backTo }: { backTo?: string }) {
  const { t, n } = useI18n()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const profile = useAuth((s) => s.profile)
  const aptId = Number(id)
  const goBack = () => navigate(backTo ?? `/sv/apartments/${aptId}`)
  const [norms, setNorms] = useState<SvNorm[]>([])
  const [staff, setStaff] = useState<SvStaff[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedStaff, setSelectedStaff] = useState<number[]>([])
  const [leadStaffId, setLeadStaffId] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<CleaningResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)
  const [goBackTimer, setGoBackTimer] = useState<ReturnType<typeof setTimeout> | null>(null)
  const clientOpIdRef = useRef<string>(crypto.randomUUID())

  const loadReferenceData = async () => {
    if (!aptId || !profile) return
    setLoading(true)
    setLoadError(null)
    try {
      const [nr, s] = await Promise.all([fetchNorms(profile.id, aptId), fetchStaff(profile.id)])
      setNorms(nr)
      setStaff(s)
    } catch (e) {
      setLoadError(friendlyMessage(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadReferenceData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aptId, profile?.id])

  useEffect(() => {
    return () => {
      if (goBackTimer) clearTimeout(goBackTimer)
    }
  }, [goBackTimer])

  const writeoffItems = useMemo(() => norms.filter((nr) => writeoffTypes.includes(nr.norm_type)), [norms])
  const needsStaff = writeoffItems.length > 0

  const toggleStaff = (staffId: number) => {
    setSelectedStaff((prev) => {
      if (prev.includes(staffId)) {
        const next = prev.filter((s) => s !== staffId)
        if (leadStaffId === staffId) setLeadStaffId(next[0] ?? null)
        return next
      }
      const next = [...prev, staffId]
      if (next.length === 1) setLeadStaffId(staffId)
      return next
    })
  }

  const setLead = (staffId: number) => { if (selectedStaff.includes(staffId)) setLeadStaffId(staffId) }

  const handleConfirm = async () => {
    if (needsStaff && selectedStaff.length === 0) { setError(t.cleaning.needLead); return }
    if (!profile) return
    setSubmitting(true)
    setError(null)
    const cleanedAt = new Date().toISOString()
    const params = {
      userId: profile.id,
      apartmentId: aptId,
      cleanedAt,
      clientOpId: clientOpIdRef.current,
      staffIds: selectedStaff,
      leadStaffId: leadStaffId ?? selectedStaff[0] ?? null,
      note: note.trim() || null,
    }
    try {
      if (!navigator.onLine) {
        await queueCleaningOffline(params)
        setOffline(true)
        const timer = setTimeout(() => goBack(), 1500)
        setGoBackTimer(timer)
        return
      }
      const res = await completeCleaning(params)
      setResult(res)
      if (res.duplicate) setError(t.cleaning.duplicate)
      const timer = setTimeout(() => goBack(), 1200)
      setGoBackTimer(timer)
    } catch (e) {
      if (isNetworkError(e)) {
        try {
          await queueCleaningOffline(params)
          setOffline(true)
          const timer = setTimeout(() => goBack(), 1500)
          setGoBackTimer(timer)
        } catch {
          setError(friendlyMessage(e))
        }
      } else {
        setError(friendlyMessage(e))
      }
    } finally { setSubmitting(false) }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <Loader2 className="w-6 h-6 text-white animate-spin" />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex flex-col justify-end">
      <div className="bg-surface rounded-t-2xl max-h-[90vh] overflow-y-auto anim-sheet">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: 'var(--line)' }} />
        </div>
        <div className="px-5 py-3 flex items-center justify-between border-b border-line">
          <h2 className="text-base font-semibold text-ink">{t.cleaning.title}</h2>
          <button onClick={goBack} className="p-1">
            <X className="w-5 h-5 text-muted" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-5">
          {loadError && (
            <div className="flex items-start gap-2 bg-warn-soft border border-line rounded-xl px-3 py-2.5">
              <AlertTriangle className="w-4 h-4 text-warn mt-0.5 shrink-0" />
              <p className="text-sm text-warn flex-1">{loadError}</p>
              <button onClick={loadReferenceData} className="flex items-center gap-1 text-xs text-warn font-medium shrink-0">
                <RefreshCw className="w-3.5 h-3.5" />
                {t.retry}
              </button>
            </div>
          )}
          {needsStaff && (
            <div>
              <label className="block text-sm font-medium text-ink mb-2">{t.cleaning.whoCleaned}</label>
              <p className="text-xs text-muted mb-2">{t.cleaning.whoCleanedHint}</p>
              <div className="space-y-2">
                {staff.map((s) => {
                  const selected = selectedStaff.includes(s.id)
                  const isLead = leadStaffId === s.id
                  return (
                    <div key={s.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${selected ? 'border-accent bg-accent-soft' : 'border-line'}`}>
                      <button onClick={() => toggleStaff(s.id)} className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${selected ? 'border-accent bg-accent' : 'border-[var(--line)]'}`}>
                        {selected && <Check className="w-3.5 h-3.5 text-white" />}
                      </button>
                      <span className="flex-1 text-sm text-ink">{s.full_name}</span>
                      {selected && (
                        <button onClick={() => setLead(s.id)} className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full transition-colors ${isLead ? 'bg-warn-soft text-warn' : 'text-muted hover:text-warn'}`}>
                          <Star className={`w-3 h-3 ${isLead ? 'fill-[var(--warn)]' : ''}`} />
                          {t.cleaning.leadStaff}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-ink mb-2">{t.cleaning.writeoff}</label>
            {writeoffItems.length === 0 ? (
              <p className="text-sm text-muted">{t.cleaning.noWriteoff}</p>
            ) : (
              <div className="bg-app rounded-xl border border-line divide-y divide-[var(--line)]">
                {writeoffItems.map((nr) => (
                  <div key={`${nr.item_id}-${nr.norm_type}`} className="px-3 py-2.5 flex items-center justify-between">
                    <span className="text-sm text-ink">{nr.item_name}</span>
                    <span className="text-sm text-muted">{n(formatQty(nr.qty, { base_unit: nr.base_unit, pack_size: nr.pack_label ? 2 : 1, pack_label: nr.pack_label }))}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-2">{t.cleaning.note}</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t.cleaning.notePlaceholder} rows={2}
              className="w-full bg-app rounded-xl px-3 py-2.5 text-sm border border-line focus:border-accent focus:outline-none resize-none" />
          </div>
          {error && (
            <div className="flex items-start gap-2 bg-bad-soft border border-line rounded-xl px-3 py-2.5">
              <AlertTriangle className="w-4 h-4 text-bad mt-0.5 shrink-0" />
              <p className="text-sm text-bad">{error}</p>
            </div>
          )}
          {result && !result.duplicate && (
            <div className="flex items-center gap-2 bg-ok-soft border border-line rounded-xl px-3 py-2.5">
              <Check className="w-4 h-4 text-ok" />
              <p className="text-sm text-ok">{t.cleaning.success}</p>
            </div>
          )}
          {offline && (
            <div className="flex items-center gap-2 bg-warn-soft border border-line rounded-xl px-3 py-2.5">
              <AlertTriangle className="w-4 h-4 text-warn" />
              <p className="text-sm text-warn">{t.cleaning.pending}</p>
            </div>
          )}
          {result?.shortages && result.shortages.length > 0 && (
            <div className="bg-warn-soft border border-line rounded-xl px-3 py-2.5">
              <p className="text-sm font-medium text-warn mb-1">{t.cleaning.shortages}</p>
              {result.shortages.map((s) => <p key={s.item_id} className="text-xs text-warn">{s.item}: {n(String(s.balance))}</p>)}
            </div>
          )}
        </div>
        <div className="sticky bottom-0 bg-surface border-t border-line px-5 py-3 flex gap-3">
          <button onClick={goBack} className="flex-1 bg-app text-ink rounded-xl py-3 font-medium">{t.cleaning.cancel}</button>
          <button
            onClick={handleConfirm}
            disabled={submitting || (needsStaff && selectedStaff.length === 0)}
            className="flex-1 bg-accent text-white rounded-xl py-3 font-medium disabled:opacity-40 flex items-center justify-center gap-2">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {t.cleaning.confirm}
          </button>
        </div>
      </div>
    </div>
  )
}
