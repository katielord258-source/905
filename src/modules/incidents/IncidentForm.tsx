import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { fetchApartments } from '@/modules/apartments/api'
import { fetchItems, createIncident, uploadIncidentPhoto, cleanupPhotos } from '@/modules/incidents/api'
import type { SvApartment, SvItem, IncidentKind } from '@/lib/database.types'
import { useAuth } from '@/modules/core/store'
import { useI18n } from '@/i18n'
import { friendlyMessage } from '@/lib/errors'
import { ArrowLeft, Camera, X, Loader2 } from 'lucide-react'

export function IncidentForm({ backTo }: { backTo?: string }) {
  const { t } = useI18n()
  const kinds: { value: IncidentKind; label: string }[] = [
    { value: 'breakdown', label: t.incidents.kindBreakdown },
    { value: 'broken', label: t.incidents.kindBroken },
    { value: 'lost', label: t.incidents.kindLost },
    { value: 'other', label: t.incidents.kindOther },
  ]
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const preselectApt = params.get('apartment') ?? params.get('apt')
  const profile = useAuth((s) => s.profile)
  const [apartments, setApartments] = useState<SvApartment[]>([])
  const [items, setItems] = useState<SvItem[]>([])
  const [loading, setLoading] = useState(true)
  const [aptId, setAptId] = useState<number | null>(preselectApt ? Number(preselectApt) : null)
  const [itemId, setItemId] = useState<number | null>(null)
  const [freeText, setFreeText] = useState('')
  const [kind, setKind] = useState<IncidentKind>('breakdown')
  const [qty, setQty] = useState('1')
  const [comment, setComment] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const clientOpIdRef = useRef<string>(crypto.randomUUID())
  const isOnline = navigator.onLine

  useEffect(() => {
    if (!profile) return
    Promise.all([fetchApartments(profile.id), fetchItems()])
      .then(([a, i]) => { setApartments(a); setItems(i) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [profile?.id])

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, 3 - photos.length)
    if (files.length === 0) return
    setPhotos((prev) => [...prev, ...files])
    setPhotoPreviews((prev) => [...prev, ...files.map((f) => URL.createObjectURL(f))])
  }

  const removePhoto = (idx: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx))
    setPhotoPreviews((prev) => { URL.revokeObjectURL(prev[idx]); return prev.filter((_, i) => i !== idx) })
  }

  const handleSubmit = async () => {
    if (!aptId) { setError(t.incidents.apartment); return }
    setSubmitting(true); setError(null)
    const photoPaths: string[] = []
    try {
      if (photos.length > 0 && profile) {
        for (const file of photos) photoPaths.push(await uploadIncidentPhoto(profile.id, file))
      }
      await createIncident({
        apartmentId: aptId,
        itemId,
        freeText: freeText.trim() || null,
        kind,
        qty: Number(qty) || 1,
        comment: comment.trim() || null,
        photoPaths,
        clientOpId: clientOpIdRef.current,
      })
      if (backTo) navigate(backTo)
      else navigate('/sv/incidents')
    } catch (e) {
      if (photoPaths.length > 0) {
        await cleanupPhotos(photoPaths).catch(() => {})
      }
      setError(friendlyMessage(e))
    } finally { setSubmitting(false) }
  }

  if (loading) return <div className="px-4 pt-8 text-center text-muted">{t.app.loading}</div>

  return (
    <div className="min-h-screen bg-app">
      <div className="bg-surface border-b border-line sticky top-0 z-30">
        <div className="px-4 py-3 flex items-center gap-3">
          <button onClick={() => backTo ? navigate(backTo) : navigate(-1)} className="p-1 -ml-1"><ArrowLeft className="w-5 h-5 text-muted" /></button>
          <h1 className="text-lg font-semibold text-ink">{t.incidents.title}</h1>
        </div>
      </div>
      <div className="px-4 pt-4 pb-28 space-y-4">
        <Field label={t.incidents.apartment}>
          <select value={aptId ?? ''} onChange={(e) => setAptId(e.target.value ? Number(e.target.value) : null)}
            className="w-full bg-surface rounded-xl px-4 py-3 text-sm border border-line focus:border-accent focus:outline-none">
            <option value="">—</option>
            {apartments.map((a) => <option key={a.id} value={a.id}>{a.code}</option>)}
          </select>
        </Field>
        <Field label={t.incidents.item}>
          <select value={itemId ?? ''} onChange={(e) => { const v = e.target.value; setItemId(v ? Number(v) : null); if (v) setFreeText('') }}
            className="w-full bg-surface rounded-xl px-4 py-3 text-sm border border-line focus:border-accent focus:outline-none mb-2">
            <option value="">— {t.incidents.freeText} —</option>
            {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          {!itemId && <input value={freeText} onChange={(e) => setFreeText(e.target.value)} placeholder={t.incidents.freeText}
            className="w-full bg-surface rounded-xl px-4 py-3 text-sm border border-line focus:border-accent focus:outline-none" />}
        </Field>
        <Field label={t.incidents.kind}>
          <div className="grid grid-cols-2 gap-2">
            {kinds.map((k) => (
              <button key={k.value} onClick={() => setKind(k.value)}
                className={`rounded-xl py-2.5 text-sm border transition-colors ${kind === k.value ? 'border-accent bg-accent-soft text-accent font-medium' : 'border-line bg-surface text-muted'}`}>
                {k.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label={t.incidents.qty}>
          <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)}
            className="w-full bg-surface rounded-xl px-4 py-3 text-sm border border-line focus:border-accent focus:outline-none" />
        </Field>
        <Field label={t.incidents.comment}>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2}
            className="w-full bg-surface rounded-xl px-4 py-3 text-sm border border-line focus:border-accent focus:outline-none resize-none" />
        </Field>
        <Field label={t.incidents.photos}>
          <div className="flex gap-2 flex-wrap">
            {photoPreviews.map((src, idx) => (
              <div key={idx} className="relative w-20 h-20">
                <img src={src} alt="" className="w-full h-full object-cover rounded-xl" />
                <button onClick={() => removePhoto(idx)} className="absolute -top-1 -right-1 w-5 h-5 bg-bad text-white rounded-full flex items-center justify-center">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {photos.length < 3 && isOnline && (
              <button onClick={() => fileInputRef.current?.click()} className="w-20 h-20 border-2 border-dashed border-line rounded-xl flex items-center justify-center text-muted hover:border-accent">
                <Camera className="w-6 h-6" />
              </button>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handlePhotoSelect} className="hidden" />
        </Field>
        {error && <p className="text-sm text-bad">{error}</p>}
      </div>
      <div className="fixed bottom-16 left-0 right-0 bg-surface border-t border-line px-4 py-3 z-30">
        <div className="max-w-lg mx-auto flex gap-3">
          <button onClick={() => backTo ? navigate(backTo) : navigate(-1)} className="flex-1 bg-app text-ink rounded-xl py-3 font-medium">{t.incidents.cancel}</button>
          <button onClick={handleSubmit} disabled={submitting || !isOnline}
            className="flex-1 bg-accent text-white rounded-xl py-3 font-medium disabled:opacity-40 flex items-center justify-center gap-2">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {isOnline ? t.incidents.submit : t.errors.needsNetworkAction}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { t } = useI18n()
  return (
    <div>
      <label className="block text-sm font-medium text-ink mb-1.5">{label}</label>
      {children}
    </div>
  )
}
