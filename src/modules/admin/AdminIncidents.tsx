import { useState, useEffect, useMemo } from 'react'
import { fetchAllIncidents, approveIncident } from '@/modules/admin/api'
import { fetchApartmentsAdmin } from '@/modules/admin/api'
import type { Incident, Apartment, IncidentStatus, IncidentKind } from '@/lib/database.types'
import { useI18n } from '@/i18n'
import { formatDateTime } from '@/lib/format'
import { toast, errorMessage } from '@/lib/toast'
import { Wrench, Package, CircleAlert as AlertCircle, Check, X, Loader as Loader2 } from 'lucide-react'

const statusColors: Record<IncidentStatus, string> = {
  new: 'bg-warn-soft text-warn',
  confirmed: 'bg-ok-soft text-ok',
  rejected: 'bg-bad-soft text-bad',
}

const kindIcons: Record<IncidentKind, React.ComponentType<{ className?: string }>> = {
  breakdown: Wrench,
  broken: AlertCircle,
  lost: Package,
  other: AlertCircle,
}

export function AdminIncidents() {
  const { t, n } = useI18n()
  const statusLabels: Record<IncidentStatus, string> = {
    new: t.incidents.statusNew,
    confirmed: t.incidents.statusConfirmed,
    rejected: t.incidents.statusRejected,
  }
  const kindLabels: Record<IncidentKind, string> = {
    breakdown: t.incidents.kindBreakdown,
    broken: t.incidents.kindBroken,
    lost: t.incidents.kindLost,
    other: t.incidents.kindOther,
  }
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [apartments, setApartments] = useState<Apartment[]>([])
  const [loading, setLoading] = useState(true)
  const [actionIncident, setActionIncident] = useState<{ incident: Incident; decision: 'confirm' | 'reject' } | null>(null)
  const [note, setNote] = useState('')
  const [force, setForce] = useState(false)
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    Promise.all([fetchAllIncidents(), fetchApartmentsAdmin()])
      .then(([inc, apts]) => { setIncidents(inc); setApartments(apts) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const aptMap = useMemo(() => new Map(apartments.map((a) => [a.id, a.code])), [apartments])

  const handleAction = async () => {
    if (!actionIncident) return
    setProcessing(true)
    try {
      await approveIncident(actionIncident.incident.id, actionIncident.decision, note.trim() || null, force)
      toast(actionIncident.decision === 'confirm' ? t.admin.adminIncidents.approved : t.admin.adminIncidents.rejected, 'success')
      setActionIncident(null)
      setNote('')
      setForce(false)
      const [inc] = await Promise.all([fetchAllIncidents()])
      setIncidents(inc)
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setProcessing(false)
    }
  }

  if (loading) return <div className="px-4 pt-8 text-center text-muted">{t.app.loading}</div>

  return (
    <div className="px-4 pt-6 pb-28">
      <h1 className="text-xl font-semibold text-ink mb-4">{t.admin.adminIncidents.title}</h1>

      {incidents.length === 0 ? (
        <p className="text-sm text-muted text-center mt-8">{t.admin.adminIncidents.noIncidents}</p>
      ) : (
        <div className="space-y-3">
          {incidents.map((inc) => {
            const Icon = kindIcons[inc.kind]
            return (
              <div key={inc.id} className="bg-surface rounded-xl border border-line px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 bg-app rounded-lg flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-muted" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-ink">{aptMap.get(inc.apartment_id) ?? `#${n(String(inc.apartment_id))}`}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[inc.status]}`}>{statusLabels[inc.status]}</span>
                    </div>
                    <p className="text-sm text-ink">{inc.free_text ?? `#${n(String(inc.item_id))}`}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted">{kindLabels[inc.kind]}</span>
                      <span className="text-xs text-muted">·</span>
                      <span className="text-xs text-muted">{n(String(inc.qty))} {t.common.units.pcs}</span>
                      <span className="text-xs text-muted">·</span>
                      <span className="text-xs text-muted">{n(formatDateTime(inc.created_at))}</span>
                    </div>
                    {inc.comment && <p className="text-xs text-muted mt-1.5 bg-app rounded-lg px-2.5 py-1.5">{inc.comment}</p>}
                    {inc.resolution_note && <p className="text-xs text-muted mt-1">{inc.resolution_note}</p>}
                    {inc.status === 'new' && (
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => { setActionIncident({ incident: inc, decision: 'confirm' }); setNote(''); setForce(false) }}
                          className="text-xs bg-ok-soft text-ok rounded-lg px-3 py-1.5 flex items-center gap-1.5"
                        >
                          <Check className="w-3 h-3" />
                          {t.admin.adminIncidents.confirm}
                        </button>
                        <button
                          onClick={() => { setActionIncident({ incident: inc, decision: 'reject' }); setNote(''); setForce(false) }}
                          className="text-xs bg-bad-soft text-bad rounded-lg px-3 py-1.5 flex items-center gap-1.5"
                        >
                          <X className="w-3 h-3" />
                          {t.admin.adminIncidents.reject}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {actionIncident && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-6">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5">
            <h3 className="text-base font-semibold text-ink mb-4">
              {actionIncident.decision === 'confirm' ? t.admin.adminIncidents.confirmTitle : t.admin.adminIncidents.rejectTitle}
            </h3>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t.admin.adminIncidents.note}
              className="w-full bg-app rounded-xl px-4 py-2.5 text-sm focus:outline-none mb-3"
            />
            {actionIncident.decision === 'confirm' && actionIncident.incident.item_id && (
              <label className="flex items-center gap-2 mb-3">
                <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} className="w-4 h-4" />
                <span className="text-sm text-ink">{t.admin.adminIncidents.force}</span>
              </label>
            )}
            <div className="flex gap-3">
              <button onClick={() => setActionIncident(null)} className="flex-1 bg-app text-ink rounded-xl py-3 font-medium">{t.cleaning.cancel}</button>
              <button
                onClick={handleAction}
                disabled={processing}
                className={`flex-1 text-white rounded-xl py-3 font-medium disabled:opacity-40 flex items-center justify-center gap-2 ${actionIncident.decision === 'confirm' ? 'bg-ok' : 'bg-bad'}`}
              >
                {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {actionIncident.decision === 'confirm' ? t.admin.adminIncidents.confirm : t.admin.adminIncidents.reject}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
