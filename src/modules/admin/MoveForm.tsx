import { useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { fetchWarehouseStock, fetchApartmentsAdmin, fetchAllStaff, fetchSuppliers, postDocument } from '@/modules/admin/api'
import type { WarehouseStockRow, Apartment, Staff, Supplier, PostDocumentResult } from '@/lib/database.types'
import { useI18n } from '@/i18n'
import { formatQty } from '@/lib/format'
import { toast, errorMessage } from '@/lib/toast'
import { Plus, Minus, Trash2, Loader as Loader2, Check, X, FileText } from 'lucide-react'

interface MoveOpDef {
  op: string
  label: string
  needsApartment: boolean
  needsStaff: boolean
  needsCost: boolean
}

interface CartLine {
  itemId: number
  itemName: string
  packSize: number
  packLabel: string
  baseUnit: string
  qty: string
  unitCost: string
}

export function MoveModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { t, n } = useI18n()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const ops: MoveOpDef[] = [
    { op: 'receipt', label: t.admin.move.receipt, needsApartment: false, needsStaff: false, needsCost: true },
    { op: 'issue_apartment', label: t.admin.move.issueApt, needsApartment: true, needsStaff: false, needsCost: false },
    { op: 'return_apartment', label: t.admin.move.returnApt, needsApartment: true, needsStaff: false, needsCost: false },
    { op: 'writeoff_apartment', label: t.admin.move.writeoffApt, needsApartment: true, needsStaff: false, needsCost: false },
    { op: 'writeoff_warehouse', label: t.admin.move.writeoffWh, needsApartment: false, needsStaff: false, needsCost: false },
    { op: 'issue_holder', label: t.admin.move.issueHolder, needsApartment: false, needsStaff: true, needsCost: false },
    { op: 'return_holder', label: t.admin.move.returnHolder, needsApartment: false, needsStaff: true, needsCost: false },
    { op: 'writeoff_holder', label: t.admin.move.writeoffHolder, needsApartment: false, needsStaff: true, needsCost: false },
  ]
  const [stock, setStock] = useState<WarehouseStockRow[]>([])
  const [apartments, setApartments] = useState<Apartment[]>([])
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [op, setOp] = useState<string>(() => searchParams.get('op') ?? 'receipt')
  const [apartmentId, setApartmentId] = useState<number | null>(null)
  const [staffId, setStaffId] = useState<number | null>(null)
  const [supplierId, setSupplierId] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [search, setSearch] = useState('')
  const [posting, setPosting] = useState(false)
  const [result, setResult] = useState<PostDocumentResult | null>(null)

  useEffect(() => {
    Promise.all([fetchWarehouseStock(), fetchApartmentsAdmin(), fetchAllStaff(), fetchSuppliers()])
      .then(([s, a, st, sup]) => {
        setStock(s)
        setApartments(a)
        setStaffList(st.filter((x) => x.active))
        setSuppliers(sup)
      })
      .catch((e) => toast(errorMessage(e), 'error'))
      .finally(() => setLoading(false))
  }, [])

  const opDef = ops.find((o) => o.op === op)!
  const filteredStock = useMemo(
    () => stock.filter((s) => s.name.toLowerCase().includes(search.toLowerCase().trim())).slice(0, 20),
    [stock, search],
  )

  const addToCart = (item: WarehouseStockRow) => {
    setCart((prev) => {
      if (prev.some((l) => l.itemId === item.item_id)) return prev
      return [...prev, {
        itemId: item.item_id,
        itemName: item.name,
        packSize: item.pack_size,
        packLabel: item.pack_label,
        baseUnit: item.base_unit,
        qty: '1',
        unitCost: '',
      }]
    })
  }

  const updateLine = (idx: number, patch: Partial<CartLine>) => {
    setCart((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }

  const removeLine = (idx: number) => {
    setCart((prev) => prev.filter((_, i) => i !== idx))
  }

  const handlePost = async () => {
    if (cart.length === 0) {
      toast(t.admin.move.empty, 'error')
      return
    }
    if (opDef.needsApartment && !apartmentId) {
      toast(t.admin.move.apartment, 'error')
      return
    }
    if (opDef.needsStaff && !staffId) {
      toast(t.admin.move.staff, 'error')
      return
    }
    const lines = cart
      .map((line) => {
        const qtyNum = Number(line.qty)
        if (!qtyNum || qtyNum <= 0) return null
        const costNum = opDef.needsCost && line.unitCost ? Number(line.unitCost) : null
        return { item_id: line.itemId, qty: qtyNum, unit_cost: costNum }
      })
      .filter((l): l is { item_id: number; qty: number; unit_cost: number | null } => l !== null)
    if (lines.length === 0) {
      toast(t.admin.move.empty, 'error')
      return
    }
    setPosting(true)
    try {
      const res = await postDocument({
        op,
        lines,
        apartment: opDef.needsApartment ? apartmentId : null,
        staff: opDef.needsStaff ? staffId : null,
        supplier: opDef.needsCost ? supplierId : null,
        note: note.trim() || null,
      })
      setResult(res)
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setPosting(false)
    }
  }

  if (loading) {
    return (
      <>
        <div className="fixed inset-0 bg-black/45 z-[60] anim-scrim" onClick={onClose} />
        <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[61] bg-surface rounded-2xl p-6 max-w-sm w-full">
          <div className="text-center text-muted text-sm">{t.app.loading}</div>
        </div>
      </>
    )
  }

  if (result) {
    return (
      <>
        <div className="fixed inset-0 bg-black/45 z-[60] anim-scrim" onClick={onClose} />
        <div className="fixed z-[61] left-1/2 top-1/2 -translate-x-1/2 w-full max-w-sm bg-surface rounded-2xl p-5 border border-line max-md:bottom-0 max-md:left-0 max-md:top-auto max-md:translate-x-0 max-md:translate-y-0 max-md:w-full max-md:rounded-t-2xl max-md:rounded-b-none max-md:anim-sheet">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-ink">{t.admin.move.resultTitle}</h2>
            <button onClick={onClose} className="p-1">
              <X className="w-5 h-5 text-muted" />
            </button>
          </div>
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="w-12 h-12 rounded-full bg-ok-soft flex items-center justify-center">
              <Check className="w-6 h-6 text-ok" />
            </div>
            <div className="text-center">
              <p className="text-sm text-muted">{t.admin.move.docNumber}</p>
              <p className="text-lg font-semibold text-ink">{result.doc_number}</p>
              <p className="text-xs text-muted mt-1">{n(String(result.lines))} {t.admin.move.resultLines}</p>
            </div>
            <button
              onClick={() => { onDone(); navigate(`/admin/more/documents/${result.doc_id}`) }}
              className="flex items-center gap-2 bg-accent text-white rounded-lg px-4 py-2.5 text-sm font-medium"
            >
              <FileText className="w-4 h-4" />
              {t.admin.move.openDoc}
            </button>
            <button onClick={onDone} className="text-sm text-muted">
              {t.cleaning.cancel}
            </button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/45 z-[60] anim-scrim" onClick={onClose} />
      <div className="fixed z-[61] left-1/2 top-1/2 -translate-x-1/2 w-full max-w-sm max-h-[90vh] overflow-auto bg-surface rounded-2xl p-5 border border-line max-md:bottom-0 max-md:left-0 max-md:top-auto max-md:translate-x-0 max-md:translate-y-0 max-md:w-full max-md:rounded-t-2xl max-md:rounded-b-none max-md:anim-sheet max-md:max-h-[85vh]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-ink">{t.admin.move.title}</h2>
          <button onClick={onClose} className="p-1">
            <X className="w-5 h-5 text-muted" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Operation type */}
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">{t.admin.move.operation}</label>
            <div className="flex gap-2 flex-wrap">
              {ops.map((o) => (
                <button
                  key={o.op}
                  onClick={() => setOp(o.op)}
                  className={`rounded-full px-3.5 py-1.5 text-sm transition-colors border ${
                    op === o.op ? 'bg-accent border-accent text-white' : 'bg-surface border-line text-muted'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Apartment */}
          {opDef.needsApartment && (
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">{t.admin.move.apartment}</label>
              <select
                value={apartmentId ?? ''}
                onChange={(e) => setApartmentId(e.target.value ? Number(e.target.value) : null)}
                className="w-full bg-surface rounded-lg px-4 py-2.5 text-sm border border-line focus:border-accent focus:outline-none"
              >
                <option value="">—</option>
                {apartments.map((a) => (
                  <option key={a.id} value={a.id}>{a.code}</option>
                ))}
              </select>
            </div>
          )}

          {/* Staff */}
          {opDef.needsStaff && (
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">{t.admin.move.staff}</label>
              <select
                value={staffId ?? ''}
                onChange={(e) => setStaffId(e.target.value ? Number(e.target.value) : null)}
                className="w-full bg-surface rounded-lg px-4 py-2.5 text-sm border border-line focus:border-accent focus:outline-none"
              >
                <option value="">—</option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>{s.full_name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Supplier (receipt only) */}
          {opDef.needsCost && (
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">{t.admin.move.supplier}</label>
              <select
                value={supplierId ?? ''}
                onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : null)}
                className="w-full bg-surface rounded-lg px-4 py-2.5 text-sm border border-line focus:border-accent focus:outline-none"
              >
                <option value="">—</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Item search */}
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">{t.admin.move.items}</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.admin.stock.search}
              className="w-full bg-surface rounded-lg px-4 py-2.5 text-sm border border-line focus:border-accent focus:outline-none mb-2"
            />
            {search.trim() && (
              <div className="bg-surface rounded-lg border border-line max-h-48 overflow-y-auto">
                {filteredStock.map((s) => (
                  <button
                    key={s.item_id}
                    onClick={() => { addToCart(s); setSearch('') }}
                    className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-app border-b border-line last:border-0"
                  >
                    <span className="text-sm text-ink truncate">{s.name}</span>
                    <span className="text-xs text-muted shrink-0 ml-2">{n(formatQty(s.qty, s))}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Cart */}
          {cart.length > 0 && (
            <div className="space-y-2">
              {cart.map((line, idx) => (
                <div key={line.itemId} className="bg-surface rounded-lg border border-line px-3 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-ink">{line.itemName}</span>
                    <button onClick={() => removeLine(idx)} className="text-bad">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex items-center bg-app rounded-lg">
                      <button onClick={() => updateLine(idx, { qty: String(Math.max(1, Number(line.qty) - 1)) })} className="px-2 py-1.5">
                        <Minus className="w-3.5 h-3.5 text-muted" />
                      </button>
                      <input
                        type="number"
                        value={line.qty}
                        onChange={(e) => updateLine(idx, { qty: e.target.value })}
                        className="w-14 bg-transparent text-center text-sm py-1.5 focus:outline-none"
                      />
                      <button onClick={() => updateLine(idx, { qty: String(Number(line.qty) + 1) })} className="px-2 py-1.5">
                        <Plus className="w-3.5 h-3.5 text-muted" />
                      </button>
                    </div>
                    {opDef.needsCost && (
                      <div className="flex-1">
                        <input
                          type="number"
                          value={line.unitCost}
                          onChange={(e) => updateLine(idx, { unitCost: e.target.value })}
                          placeholder={t.admin.move.unitCost}
                          className="w-full bg-app rounded-lg px-3 py-2 text-sm focus:outline-none"
                        />
                        {line.packSize > 1 && line.unitCost && (
                          <p className="text-xs text-muted mt-0.5">
                            {t.admin.move.costPerPack}: {(Number(line.unitCost) * line.packSize).toFixed(2)}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Note */}
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">{t.admin.move.note}</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full bg-surface rounded-lg px-4 py-2.5 text-sm border border-line focus:border-accent focus:outline-none"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-5">
          <button
            onClick={onClose}
            className="flex-1 bg-app text-ink rounded-lg py-3 font-medium text-sm"
          >
            {t.cleaning.cancel}
          </button>
          <button
            onClick={handlePost}
            disabled={posting || cart.length === 0}
            className="flex-1 bg-accent text-white rounded-lg py-3 font-medium text-sm disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {t.admin.move.post}
          </button>
        </div>
      </div>
    </>
  )
}
