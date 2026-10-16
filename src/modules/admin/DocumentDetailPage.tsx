import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  fetchDocumentMoves,
  fetchAttachments,
  uploadAttachment,
  deleteAttachment,
  createSignedUrl,
} from '@/modules/admin/api'
import type { DocumentWithSupplier, AttachmentRow, BaseUnit } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/i18n'
import { formatDateTime, formatQty } from '@/lib/format'
import { toast, errorMessage } from '@/lib/toast'
import { ArrowLeft, Printer, Upload, Trash2, FileText, Loader as Loader2 } from 'lucide-react'

interface DocMoveRow {
  id: number
  item_id: number
  from_loc: number
  to_loc: number
  qty: number
  unit_cost: number | null
  source_type: string
  note: string | null
  moved_at: string
  from_location?: { name: string; type: string }
  to_location?: { name: string; type: string }
  item_name: string
  item_base_unit: BaseUnit
  item_pack_size: number
  item_pack_label: string
}

export function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t, n } = useI18n()
  const [doc, setDoc] = useState<DocumentWithSupplier | null>(null)
  const [moves, setMoves] = useState<DocMoveRow[]>([])
  const [attachments, setAttachments] = useState<AttachmentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    Promise.all([
      supabase.from('documents').select('id,doc_type,number,doc_date,supplier_id,status,note,total_cost,created_at').eq('id', id).single(),
      fetchDocumentMoves(id),
      fetchAttachments(id),
    ])
      .then(async ([docRes, mv, atts]) => {
        if (docRes.error) throw new Error(docRes.error.message)
        const docRow = docRes.data as DocumentWithSupplier
        if (docRow.supplier_id) {
          const supRes = await supabase.from('suppliers').select('name').eq('id', docRow.supplier_id).single()
          docRow.supplier_name = supRes.data?.name ?? null
        } else {
          docRow.supplier_name = null
        }
        setDoc(docRow)
        setMoves(mv as DocMoveRow[])
        setAttachments(atts)
      })
      .catch((e) => toast(errorMessage(e), 'error'))
      .finally(() => setLoading(false))
  }, [id])

  const typeLabels: Record<string, string> = {
    receipt: t.admin.documents.receipt,
    issue: t.admin.documents.issue,
    writeoff: t.admin.documents.writeoff,
    inventory: t.admin.documents.inventory,
  }

  const statusLabels: Record<string, string> = {
    posted: t.admin.documents.statusPosted,
    draft: t.admin.documents.statusDraft,
    void: t.admin.documents.statusVoid,
  }

  const handleFile = async (file: File) => {
    if (!id) return
    if (file.size > 10 * 1024 * 1024) {
      toast(t.admin.documents.fileTooBig, 'error')
      return
    }
    setUploading(true)
    try {
      await uploadAttachment(id, file)
      const atts = await fetchAttachments(id)
      setAttachments(atts)
      toast(t.admin.documents.uploaded, 'success')
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setUploading(false)
    }
  }

  const handleDeleteAttachment = async (att: AttachmentRow) => {
    if (!confirm(t.admin.documents.confirmDeleteAttachment)) return
    try {
      await deleteAttachment(att.id, att.storage_path)
      setAttachments((prev) => prev.filter((a) => a.id !== att.id))
      toast(t.admin.documents.deleted, 'success')
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }

  const openAttachment = async (path: string) => {
    try {
      const url = await createSignedUrl(path)
      window.open(url, '_blank')
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }

  if (loading) {
    return <div className="px-4 pt-8 text-center text-muted">{t.app.loading}</div>
  }

  if (!doc) {
    return (
      <div className="px-4 pt-8 text-center text-muted">
        <p>{t.common.notFound}</p>
        <button onClick={() => navigate('/admin/more/documents')} className="mt-3 text-accent text-sm">
          {t.admin.documents.title}
        </button>
      </div>
    )
  }

  return (
    <div className="px-4 pt-5 pb-28 lg:px-0 lg:pt-0">
      <div className="flex items-center gap-3 mb-4 no-print">
        <button onClick={() => navigate('/admin/more/documents')} className="p-1">
          <ArrowLeft className="w-5 h-5 text-muted" />
        </button>
        <h1 className="text-xl font-semibold text-ink flex-1">{doc.number}</h1>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink hover:bg-app transition-colors"
        >
          <Printer className="w-4 h-4" />
          {t.admin.documents.print}
        </button>
      </div>

      {/* Doc header */}
      <div className="bg-surface border border-line rounded-xl p-4 mb-4 print-area">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-muted">{t.admin.documents.type}: </span>
            <span className="text-ink font-medium">{typeLabels[doc.doc_type] ?? doc.doc_type}</span>
          </div>
          <div>
            <span className="text-muted">{t.admin.documents.date}: </span>
            <span className="text-ink font-medium">{formatDateTime(doc.doc_date)}</span>
          </div>
          <div>
            <span className="text-muted">{t.admin.documents.status}: </span>
            <span className="text-ink font-medium">{statusLabels[doc.status] ?? doc.status}</span>
          </div>
          {doc.supplier_name && (
            <div>
              <span className="text-muted">{t.admin.documents.supplier}: </span>
              <span className="text-ink font-medium">{doc.supplier_name}</span>
            </div>
          )}
          {doc.total_cost != null && (
            <div>
              <span className="text-muted">{t.admin.documents.total}: </span>
              <span className="text-ink font-medium">{n(String(doc.total_cost))} EGP</span>
            </div>
          )}
          {doc.note && (
            <div className="col-span-2">
              <span className="text-muted">{t.admin.documents.note}: </span>
              <span className="text-ink">{doc.note}</span>
            </div>
          )}
        </div>
      </div>

      {/* Moves */}
      <section className="bg-surface border border-line rounded-xl p-4 mb-4 print-area">
        <h2 className="text-sm font-semibold text-ink mb-3">{t.admin.documents.moves}</h2>
        {moves.length === 0 ? (
          <p className="text-sm text-muted">{t.admin.documents.noMoves}</p>
        ) : (
          <div className="space-y-2">
            {moves.map((mv) => (
              <div key={mv.id} className="flex items-start gap-3 py-2 border-t border-line first:border-t-0">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-ink font-medium">{mv.item_name}</div>
                  <div className="text-xs text-muted">
                    {n(formatQty(mv.qty, {
                      base_unit: mv.item_base_unit,
                      pack_size: mv.item_pack_size,
                      pack_label: mv.item_pack_label,
                    }))}
                    {mv.unit_cost != null && ` · ${n(String(mv.unit_cost))} EGP`}
                  </div>
                  <div className="text-xs text-muted">
                    {mv.from_location?.name ?? '—'} → {mv.to_location?.name ?? '—'}
                  </div>
                  {mv.note && <div className="text-xs text-muted">{mv.note}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Attachments */}
      <section className="bg-surface border border-line rounded-xl p-4 no-print">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-ink">{t.admin.documents.attachments}</h2>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 bg-accent text-white rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-40"
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {t.admin.documents.upload}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
              e.target.value = ''
            }}
          />
        </div>
        {attachments.length === 0 ? (
          <p className="text-sm text-muted">{t.admin.documents.noAttachments}</p>
        ) : (
          <div className="space-y-2">
            {attachments.map((att) => (
              <div key={att.id} className="flex items-center gap-3 py-2 border-t border-line first:border-t-0">
                <FileText className="w-4 h-4 text-accent shrink-0" />
                <button
                  onClick={() => openAttachment(att.storage_path)}
                  className="flex-1 text-left text-sm text-ink hover:text-accent"
                >
                  {att.storage_path.split('/').pop() ?? att.id}
                </button>
                <span className="text-xs text-muted shrink-0">{formatDateTime(att.created_at)}</span>
                <button
                  onClick={() => handleDeleteAttachment(att)}
                  className="text-muted hover:text-bad shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
