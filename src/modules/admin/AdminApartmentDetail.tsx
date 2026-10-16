import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  fetchApartmentsAdmin,
  fetchApartmentGaps,
  fetchNormRules,
  fetchTemplateNorms,
  fetchCleaningEvents,
  fetchAllStaff,
  issueMissing,
  reverseCleaning,
  recalculateCleaning,
  upsertNormRule,
  deleteNormRule,
  fetchWarehouseStock,
} from '@/modules/admin/api'
import type { Apartment, ApartmentGapRow, NormRuleRow, CleaningEventRow, Staff, WarehouseStockRow, IssueMissingResult, NormType } from '@/lib/database.types'
import { useI18n } from '@/i18n'
import { formatDateTime, formatQty, cairoLocalToISO } from '@/lib/format'
import { toast, errorMessage } from '@/lib/toast'
import { ClipboardList, History, Plus, Trash2, CreditCard as Edit3, Gift, RotateCcw, X, Check, Loader as Loader2 } from 'lucide-react'

type Tab = 'norms' | 'history'

const normTypeOrder: NormType[] = ['asset_standing', 'turnover_replenish', 'cleaning_consumption']

function pctColor(p: number): string {
  if (p >= 100) return 'var(--ok)'
  if (p >= 75) return 'var(--warn)'
  return 'var(--bad)'
}

function ProgressBar({ value, color }: { value: number; color: string }) {
  return (
    <span className="block h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--line)' }}>
      <span className="block h-full rounded-full" style={{ width: `${Math.min(value, 100)}%`, background: color }} />
    </span>
  )
}

export function AdminApartmentDetail() {
  const { t, n } = useI18n()
  const normTypeLabels: Record<NormType, string> = {
    asset_standing: t.apartments.normInventory,
    turnover_replenish: t.apartments.normTurnover,
    cleaning_consumption: t.apartments.normCleaning,
  }
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const aptId = Number(id)
  const [apartment, setApartment] = useState<Apartment | null>(null)
  const [gaps, setGaps] = useState<ApartmentGapRow[]>([])
  const [overrideNorms, setOverrideNorms] = useState<NormRuleRow[]>([])
  const [templateNorms, setTemplateNorms] = useState<NormRuleRow[]>([])
  const [events, setEvents] = useState<CleaningEventRow[]>([])
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [stock, setStock] = useState<WarehouseStockRow[]>([])
  const [tab, setTab] = useState<Tab>('norms')
  const [loading, setLoading] = useState(true)
  const [issueResult, setIssueResult] = useState<IssueMissingResult | null>(null)
  const [issuing, setIssuing] = useState(false)
  const [editingNorm, setEditingNorm] = useState<NormRuleRow | null>(null)
  const [reverseEventId, setReverseEventId] = useState<string | null>(null)
  const [reverseReason, setReverseReason] = useState('')
  const [recalcEventId, setRecalcEventId] = useState<string | null>(null)
  const [recalcDate, setRecalcDate] = useState('')
  const [recalcStaffIds, setRecalcStaffIds] = useState<number[]>([])

  const loadAll = () => {
    if (!aptId) return
    Promise.all([
      fetchApartmentsAdmin(),
      fetchApartmentGaps(),
      fetchNormRules(aptId),
      fetchCleaningEvents(aptId),
      fetchAllStaff(),
      fetchWarehouseStock(),
    ])
      .then(([apts, ga, norms, ev, st, wh]) => {
        const apt = apts.find((a) => a.id === aptId) ?? null
        setApartment(apt)
        setGaps(ga.filter((g) => g.apartment_id === aptId))
        setOverrideNorms(norms)
        if (apt) {
          fetchTemplateNorms(apt.type).then(setTemplateNorms).catch(() => {})
        }
        setEvents(ev)
        setStaffList(st)
        setStock(wh)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadAll()
  }, [aptId])

  const gapItems = useMemo(() => gaps.filter((g) => g.gap > 0), [gaps])

  const handleIssueAll = async () => {
    setIssuing(true)
    try {
      const result = await issueMissing(aptId)
      setIssueResult(result)
      if (result.issued.length === 0 && result.short.length > 0) {
        toast(t.admin.apartments.nothingIssued, 'error')
      } else {
        toast(t.admin.apartments.issued, 'success')
      }
      loadAll()
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setIssuing(false)
    }
  }

  const handleReverse = async () => {
    if (!reverseEventId) return
    try {
      await reverseCleaning(reverseEventId, reverseReason.trim() || null)
      toast(t.admin.apartments.reversed, 'success')
      setReverseEventId(null)
      setReverseReason('')
      loadAll()
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }

  const handleRecalc = async () => {
    if (!recalcEventId) return
    try {
      const cleanedAt = recalcDate ? cairoLocalToISO(recalcDate) : null
      const staffIds = recalcStaffIds.length > 0 ? recalcStaffIds : null
      const leadStaffId = staffIds && staffIds.length > 0 ? staffIds[0] : null
      await recalculateCleaning(recalcEventId, cleanedAt, staffIds, leadStaffId)
      toast(t.admin.apartments.recalculate, 'success')
      setRecalcEventId(null)
      setRecalcDate('')
      setRecalcStaffIds([])
      loadAll()
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }

  const close = () => navigate('/admin/apartments')

  const groupedOverrides = useMemo(() => {
    const map = new Map<NormType, NormRuleRow[]>()
    for (const nr of overrideNorms) {
      const list = map.get(nr.norm_type) ?? []
      list.push(nr)
      map.set(nr.norm_type, list)
    }
    return map
  }, [overrideNorms])

  const groupedTemplates = useMemo(() => {
    const map = new Map<NormType, NormRuleRow[]>()
    for (const nr of templateNorms) {
      const list = map.get(nr.norm_type) ?? []
      list.push(nr)
      map.set(nr.norm_type, list)
    }
    return map
  }, [templateNorms])

  const totalNorms = gaps.length
  const missingCount = gapItems.length
  const completenessPct = totalNorms > 0 ? Math.round(((totalNorms - missingCount) / totalNorms) * 100) : 100

  return (
    <>
      <div className="fixed inset-0 bg-black/45 z-[60] anim-scrim" onClick={close} />
      <aside className="fixed top-0 right-0 bottom-0 w-full max-w-[440px] bg-surface z-[61] overflow-auto border-l border-line anim-drawer">
        {loading ? (
          <div className="p-6 text-center text-muted text-sm">{t.app.loading}</div>
        ) : !apartment ? (
          <div className="p-6 text-center text-muted text-sm">{t.common.notFound}</div>
        ) : (
          <div className="p-5 pb-8">
            <div className="flex items-center justify-between mb-4">
              <button onClick={close} className="bg-surface border border-line text-ink rounded-lg px-3 py-1.5 text-sm font-medium">
                {t.common.close}
              </button>
            </div>
            <h2 className="text-xl font-semibold text-ink m-0">{apartment.code}</h2>
            <p className="text-muted text-sm">{apartment.type}</p>

            {/* Completeness */}
            <div className="font-semibold text-sm text-ink mt-4 mb-2">{t.admin.apartments.completeness} {n(String(completenessPct))}%</div>
            <ProgressBar value={completenessPct} color={pctColor(completenessPct)} />

            {/* Gap list + issue all */}
            <div className="font-semibold text-sm text-ink mt-4 mb-2">{t.admin.apartments.gap}</div>
            {gapItems.length > 0 ? (
              <>
                <div className="bg-surface border border-line rounded-lg divide-y divide-[var(--line)]">
                  {gapItems.map((g) => (
                    <div key={`${g.item_id}`} className="px-3 py-2.5 flex items-center justify-between">
                      <span className="text-sm text-ink">{g.name}</span>
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-bad-soft text-bad">−{n(String(g.gap))}</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleIssueAll}
                  disabled={issuing}
                  className="mt-3 bg-accent text-white rounded-lg px-3.5 py-2 text-sm font-medium flex items-center gap-1.5 disabled:opacity-40"
                >
                  {issuing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Gift className="w-3.5 h-3.5" />}
                  {t.admin.apartments.issueAll}
                </button>
              </>
            ) : (
              <p className="text-muted text-sm">{t.common.fullyStocked}</p>
            )}

            {/* Tabs */}
            <div className="flex gap-1 mt-5 border-b border-line">
              <TabButton active={tab === 'norms'} onClick={() => setTab('norms')} icon={ClipboardList} label={t.admin.apartments.norms} />
              <TabButton active={tab === 'history'} onClick={() => setTab('history')} icon={History} label={t.admin.apartments.cleaningHistory} />
            </div>

            {/* Norms tab */}
            {tab === 'norms' && (
              <div className="mt-4 space-y-5">
                {normTypeOrder.map((nt) => {
                  const overrides = groupedOverrides.get(nt) ?? []
                  const templates = groupedTemplates.get(nt) ?? []
                  if (overrides.length === 0 && templates.length === 0) return null
                  return (
                    <div key={nt}>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">{normTypeLabels[nt]}</h3>
                        <button
                          onClick={() => { setEditingNorm({ id: 0, norm_type: nt, apt_type: null, apartment_id: aptId, item_id: 0, qty: 1, note: null }) }}
                          className="text-accent text-xs flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" /> {t.admin.apartments.addNorm}
                        </button>
                      </div>
                      <div className="bg-surface border border-line rounded-lg divide-y divide-[var(--line)]">
                        {overrides.length > 0 ? (
                          overrides.map((nr) => (
                            <div key={nr.id} className="px-3 py-2.5 flex items-center justify-between">
                              <div className="min-w-0">
                                <span className="text-sm text-ink">{stock.find((s) => s.item_id === nr.item_id)?.name ?? `#${n(String(nr.item_id))}`}</span>
                                {nr.note && <span className="text-xs text-muted block">{nr.note}</span>}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-sm text-muted">{n(String(nr.qty))}</span>
                                <button onClick={() => setEditingNorm(nr)} className="text-muted hover:text-accent">
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={async () => { await deleteNormRule(nr.id); loadAll() }} className="text-muted hover:text-bad">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))
                        ) : (
                          templates.map((nr) => (
                            <div key={nr.id} className="px-3 py-2.5 flex items-center justify-between opacity-60">
                              <span className="text-sm text-ink">{stock.find((s) => s.item_id === nr.item_id)?.name ?? `#${n(String(nr.item_id))}`}</span>
                              <span className="text-sm text-muted">{n(String(nr.qty))} ({t.admin.apartments.template})</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* History tab */}
            {tab === 'history' && (
              <div className="mt-4 space-y-3">
                {events.length === 0 ? (
                  <p className="text-sm text-muted text-center mt-6">{t.admin.apartments.noCleaning}</p>
                ) : (
                  events.map((ev) => (
                    <div key={ev.id} className="bg-surface border border-line rounded-lg px-4 py-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-ink">{n(formatDateTime(ev.cleaned_at))}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${ev.status === 'done' ? 'bg-ok-soft text-ok' : 'bg-bad-soft text-bad'}`}>
                          {ev.status === 'done' ? t.admin.apartments.done : t.admin.apartments.reversed}
                        </span>
                      </div>
                      {ev.cleaning_event_staff && ev.cleaning_event_staff.length > 0 && (
                        <p className="text-xs text-muted">
                          {ev.cleaning_event_staff.map((s, i) => (
                            <span key={s.staff_id}>
                              {i > 0 && ', '}
                              {s.staff.full_name}
                              {s.staff_id === ev.lead_staff_id && ` ${t.admin.apartments.recalcLead}`}
                            </span>
                          ))}
                        </p>
                      )}
                      <p className="text-xs text-muted mt-0.5">{t.admin.apartments.revision}: {n(String(ev.revision))}</p>
                      {ev.note && <p className="text-xs text-muted mt-1">{ev.note}</p>}
                      {ev.status === 'reversed' && ev.reverse_reason && (
                        <p className="text-xs text-bad mt-1">{ev.reverse_reason}</p>
                      )}
                      {ev.status === 'done' && (
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => { setRecalcEventId(ev.id); setRecalcDate(''); setRecalcStaffIds([]) }}
                            className="text-xs bg-app text-ink rounded-lg px-3 py-1.5 flex items-center gap-1"
                          >
                            <RotateCcw className="w-3 h-3" />
                            {t.admin.apartments.recalculate}
                          </button>
                          <button
                            onClick={() => setReverseEventId(ev.id)}
                            className="text-xs bg-bad-soft text-bad rounded-lg px-3 py-1.5"
                          >
                            {t.admin.apartments.reverse}
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </aside>

      {/* Issue result sheet */}
      {issueResult && (
        <>
          <div className="fixed inset-0 bg-black/50 z-[70]" onClick={() => setIssueResult(null)} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[71] bg-surface rounded-2xl w-full max-w-sm p-5 border border-line max-md:bottom-0 max-md:left-0 max-md:top-auto max-md:translate-x-0 max-md:translate-y-0 max-md:w-full max-md:rounded-t-2xl max-md:rounded-b-none max-md:anim-sheet">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-ink">{t.admin.apartments.issueAll}</h2>
              <button onClick={() => setIssueResult(null)} className="p-1">
                <X className="w-5 h-5 text-muted" />
              </button>
            </div>
            {issueResult.doc_number && (
              <p className="text-sm text-muted mb-3">{t.common.document}: {n(issueResult.doc_number)}</p>
            )}
            {issueResult.issued.length > 0 && (
              <div className="mb-3">
                <p className="text-sm font-medium text-ok mb-2">{t.admin.apartments.issued}</p>
                <div className="bg-ok-soft rounded-lg border border-line divide-y divide-[var(--line)]">
                  {issueResult.issued.map((it) => (
                    <div key={it.item_id} className="px-3 py-2 flex items-center justify-between">
                      <span className="text-sm text-ink">{it.name}</span>
                      <span className="text-sm text-ok">{n(String(it.qty))}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {issueResult.short.length > 0 && (
              <div className="mb-4">
                <p className="text-sm font-medium text-bad mb-2">{t.admin.apartments.short}</p>
                <div className="bg-bad-soft rounded-lg border border-line divide-y divide-[var(--line)]">
                  {issueResult.short.map((it) => (
                    <div key={it.item_id} className="px-3 py-2 flex items-center justify-between">
                      <span className="text-sm text-ink">{it.name}</span>
                      <span className="text-sm text-bad">{n(String(it.issued))}/{n(String(it.need))}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <button onClick={() => setIssueResult(null)} className="w-full bg-app text-ink rounded-lg py-3 font-medium text-sm">
              {t.common.ok}
            </button>
          </div>
        </>
      )}

      {/* Reverse modal */}
      {reverseEventId && (
        <Modal title={t.admin.apartments.reverseConfirm} onClose={() => setReverseEventId(null)}>
          <input
            value={reverseReason}
            onChange={(e) => setReverseReason(e.target.value)}
            placeholder={t.admin.apartments.reverseReason}
            className="w-full bg-app rounded-lg px-4 py-3 text-sm focus:outline-none mb-4"
          />
          <div className="flex gap-3">
            <button onClick={() => setReverseEventId(null)} className="flex-1 bg-app text-ink rounded-lg py-3 font-medium text-sm">
              {t.cleaning.cancel}
            </button>
            <button onClick={handleReverse} className="flex-1 bg-bad text-white rounded-lg py-3 font-medium text-sm">
              {t.admin.apartments.reverse}
            </button>
          </div>
        </Modal>
      )}

      {/* Recalc modal */}
      {recalcEventId && (
        <Modal title={t.admin.apartments.recalcConfirm} onClose={() => { setRecalcEventId(null); setRecalcDate(''); setRecalcStaffIds([]) }}>
          <div className="space-y-3 mb-4">
            <div>
              <label className="block text-sm text-muted mb-1">{t.admin.apartments.recalcDate}</label>
              <input
                type="datetime-local"
                value={recalcDate}
                onChange={(e) => setRecalcDate(e.target.value)}
                className="w-full bg-app rounded-lg px-4 py-2.5 text-sm focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">{t.admin.apartments.recalcStaff}</label>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {staffList.filter((s) => s.active).map((s) => (
                  <label key={s.id} className="flex items-center gap-2 px-3 py-1.5 bg-app rounded-lg cursor-pointer">
                    <input
                      type="checkbox"
                      checked={recalcStaffIds.includes(s.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setRecalcStaffIds((prev) => [...prev, s.id])
                        } else {
                          setRecalcStaffIds((prev) => prev.filter((id) => id !== s.id))
                        }
                      }}
                      className="w-4 h-4 accent-[var(--accent)]"
                    />
                    <span className="text-sm text-ink">
                      {s.full_name}
                      {recalcStaffIds[0] === s.id && ` ${t.admin.apartments.recalcLead}`}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => { setRecalcEventId(null); setRecalcDate(''); setRecalcStaffIds([]) }} className="flex-1 bg-app text-ink rounded-lg py-3 font-medium text-sm">
              {t.cleaning.cancel}
            </button>
            <button onClick={handleRecalc} className="flex-1 bg-accent text-white rounded-lg py-3 font-medium text-sm">
              {t.admin.apartments.recalculate}
            </button>
          </div>
        </Modal>
      )}

      {/* Norm editor */}
      {editingNorm && (
        <NormEditor
          norm={editingNorm}
          items={stock}
          onClose={() => setEditingNorm(null)}
          onSave={async (normType, itemId, qty, note) => {
            try {
              await upsertNormRule({
                id: editingNorm.id || undefined,
                norm_type: normType,
                apartment_id: aptId,
                apt_type: null,
                item_id: itemId,
                qty,
                note: note ?? null,
              })
              setEditingNorm(null)
              loadAll()
            } catch (e) {
              toast(errorMessage(e), 'error')
            }
          }}
        />
      )}
    </>
  )
}

function TabButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; label: string }) {
  const { t } = useI18n()
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2.5 text-sm border-b-2 transition-colors ${active ? 'border-accent text-accent font-medium' : 'border-transparent text-muted'}`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const { t } = useI18n()
  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[70]" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[71] bg-surface rounded-2xl w-full max-w-sm p-5 border border-line">
        <h3 className="text-base font-semibold text-ink mb-4">{title}</h3>
        {children}
      </div>
    </>
  )
}

function NormEditor({
  norm,
  items,
  onClose,
  onSave,
}: {
  norm: NormRuleRow
  items: WarehouseStockRow[]
  onClose: () => void
  onSave: (normType: string, itemId: number, qty: number, note: string | null) => void
}) {
  const { t } = useI18n()
  const normTypeLabels: Record<NormType, string> = {
    asset_standing: t.apartments.normInventory,
    turnover_replenish: t.apartments.normTurnover,
    cleaning_consumption: t.apartments.normCleaning,
  }
  const [normType, setNormType] = useState(norm.norm_type)
  const [itemId, setItemId] = useState(norm.item_id || 0)
  const [qty, setQty] = useState(String(norm.qty))
  const [note, setNote] = useState(norm.note ?? '')

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[70]" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[71] bg-surface rounded-2xl w-full max-w-sm p-5 border border-line">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-ink">{norm.id ? t.admin.apartments.editNorm : t.admin.apartments.addNorm}</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-muted" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-muted mb-1">{t.incidents.kind}</label>
            <select value={normType} onChange={(e) => setNormType(e.target.value as NormType)} className="w-full bg-app rounded-lg px-4 py-2.5 text-sm focus:outline-none">
              {normTypeOrder.map((nt) => <option key={nt} value={nt}>{normTypeLabels[nt]}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-muted mb-1">{t.admin.apartments.item}</label>
            <select value={itemId} onChange={(e) => setItemId(Number(e.target.value))} className="w-full bg-app rounded-lg px-4 py-2.5 text-sm focus:outline-none">
              <option value="0">—</option>
              {items.map((i) => <option key={i.item_id} value={i.item_id}>{i.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-muted mb-1">{t.admin.apartments.qty}</label>
            <input type="number" min="0" step="0.001" value={qty} onChange={(e) => setQty(e.target.value)} className="w-full bg-app rounded-lg px-4 py-2.5 text-sm focus:outline-none" />
          </div>
          <div>
            <label className="block text-sm text-muted mb-1">{t.admin.move.note}</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full bg-app rounded-lg px-4 py-2.5 text-sm focus:outline-none" />
          </div>
        </div>
        <div className="flex gap-3 mt-4">
          <button onClick={onClose} className="flex-1 bg-app text-ink rounded-lg py-3 font-medium text-sm">{t.cleaning.cancel}</button>
          <button
            onClick={() => onSave(normType, itemId, Number(qty), note.trim() || null)}
            disabled={!itemId || !qty}
            className="flex-1 bg-accent text-white rounded-lg py-3 font-medium text-sm disabled:opacity-40 flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" />
            {t.admin.apartments.save}
          </button>
        </div>
      </div>
    </>
  )
}
