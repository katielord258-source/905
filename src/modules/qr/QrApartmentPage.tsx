import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  fetchApartment,
  fetchNorms,
  fetchItems,
  fetchNotes,
  addNote,
  uploadNoteFile,
  createSignedUrl,
  fetchWhatsappContacts,
} from '@/modules/qr/api'
import { fetchCleaningEvents } from '@/modules/cleaning/store'
import type { SvCleaningEvent } from '@/lib/database.types'
import type { SvApartment, SvNorm, SvItem, ApartmentNote, Contact, NormType } from '@/lib/database.types'
import { useAuth } from '@/modules/core/store'
import { useI18n } from '@/i18n'
import { formatDateTime, isToday, formatQty } from '@/lib/format'
import { toast, errorMessage } from '@/lib/toast'
import { getOutboxSummary, subscribe, flushOutbox } from '@/lib/outbox'
import { CircleCheck as CheckCircle2, Wrench, Search, Send, Camera, Video, X, FileText, Loader as Loader2, MessageCircle, RefreshCw } from 'lucide-react'

const normTypeOrder: NormType[] = ['asset_standing', 'turnover_replenish', 'cleaning_consumption']

export function QrApartmentPage() {
  const { t, n } = useI18n()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const profile = useAuth((s) => s.profile)
  const aptId = Number(id)

  const normTypeLabels: Record<NormType, string> = {
    asset_standing: t.apartments.normInventory,
    turnover_replenish: t.apartments.normTurnover,
    cleaning_consumption: t.apartments.normCleaning,
  }

  const [apartment, setApartment] = useState<SvApartment | null>(null)
  const [norms, setNorms] = useState<SvNorm[]>([])
  const [items, setItems] = useState<SvItem[]>([])
  const [notes, setNotes] = useState<ApartmentNote[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())
  const [pendingCount, setPendingCount] = useState(0)
  const [failedCount, setFailedCount] = useState(0)
  const [tab, setTab] = useState<'norms' | 'comments' | 'whatsapp' | 'history'>('norms')
  const [cleaningEvents, setCleaningEvents] = useState<SvCleaningEvent[]>([])
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string>('')

  const [noteText, setNoteText] = useState('')
  const [sendingNote, setSendingNote] = useState(false)
  const [uploadingFile, setUploadingFile] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)

  const [noteFileUrls, setNoteFileUrls] = useState<Map<string, string>>(new Map())

  const loadAll = useCallback(async () => {
    if (!aptId || !profile) return
    const [apt, nr, it, no, ct] = await Promise.all([
      fetchApartment(aptId),
      fetchNorms(profile.id, aptId),
      fetchItems(),
      fetchNotes(aptId),
      fetchWhatsappContacts(),
    ])
    if (!apt) { setNotFound(true); setLoading(false); return }
    const ce = await fetchCleaningEvents(aptId)
    setApartment(apt)
    setNorms(nr)
    setItems(it)
    setNotes(no)
    setContacts(ct)
    setCleaningEvents(ce)
    setLastUpdated(new Date())
  }, [aptId, profile?.id])

  useEffect(() => {
    if (!aptId) return
    setLoading(true)
    loadAll()
      .catch((e) => toast(errorMessage(e), 'error'))
      .finally(() => setLoading(false))
    if (profile) {
      const refreshOutbox = () => {
        getOutboxSummary(profile.id).then((s) => {
          setPendingCount(s.pending)
          setFailedCount(s.failed)
        })
      }
      refreshOutbox()
      const unsub = subscribe(refreshOutbox)
      return unsub
    }
  }, [aptId, loadAll, profile?.id])

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') loadAll().catch(() => {}) }
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    const interval = setInterval(() => { if (document.visibilityState === 'visible') loadAll().catch(() => {}) }, 20000)
    return () => {
      window.removeEventListener('focus', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(interval)
    }
  }, [loadAll])

  const itemCategoryMap = useMemo(() => {
    const map = new Map<number, string>()
    for (const it of items) map.set(it.id, it.category)
    return map
  }, [items])

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const nr of norms) {
      const cat = itemCategoryMap.get(nr.item_id)
      if (cat) set.add(cat)
    }
    return Array.from(set).sort()
  }, [norms, itemCategoryMap])

  const filteredNorms = useMemo(() => {
    const q = search.toLowerCase().trim()
    return norms.filter((nr) => {
      if (q && !nr.item_name.toLowerCase().includes(q)) return false
      if (activeCategory) {
        const cat = itemCategoryMap.get(nr.item_id)
        if (cat !== activeCategory) return false
      }
      return true
    })
  }, [norms, search, activeCategory, itemCategoryMap])

  const groupedNorms = useMemo(() => {
    const map = new Map<NormType, SvNorm[]>()
    for (const nr of filteredNorms) {
      const list = map.get(nr.norm_type) ?? []
      list.push(nr)
      map.set(nr.norm_type, list)
    }
    return map
  }, [filteredNorms])

  const notePhotos = useMemo(() => notes.filter((note) => note.photo_path), [notes])

  useEffect(() => {
    const loadUrls = async () => {
      const missing = notePhotos.filter((n) => n.photo_path && !noteFileUrls.has(n.photo_path))
      if (missing.length === 0) return
      const newUrls = new Map<string, string>()
      for (const note of missing) {
        if (!note.photo_path) continue
        try {
          const url = await createSignedUrl(note.photo_path)
          newUrls.set(note.photo_path, url)
        } catch { /* leave as unavailable */ }
      }
      if (newUrls.size > 0) setNoteFileUrls((prev) => { const merged = new Map(prev); newUrls.forEach((v, k) => merged.set(k, v)); return merged })
    }
    loadUrls()
  }, [notePhotos])

  const handleAddNote = async (photoPath: string | null) => {
    if (!noteText.trim() && !photoPath) return
    setSendingNote(true)
    try {
      await addNote(aptId, noteText.trim() || ' ', photoPath)
      setNoteText('')
      const no = await fetchNotes(aptId)
      setNotes(no)
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setSendingNote(false)
    }
  }

  const handlePhoto = async (file: File) => {
    if (!profile) return
    setUploadingFile(true)
    try {
      const path = await uploadNoteFile(profile.id, aptId, file, true)
      await handleAddNote(path)
      toast(t.qr.fileUploaded, 'success')
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setUploadingFile(false)
    }
  }

  const handleVideo = async (file: File) => {
    if (!profile) return
    if (file.size > 40 * 1024 * 1024) { toast(t.qr.videoTooBig, 'error'); return }
    try {
      const duration = await getVideoDuration(file)
      if (duration > 60) { toast(t.qr.videoTooLong, 'error'); return }
    } catch {
      toast(t.common.videoMetadataError, 'error')
      return
    }
    setUploadingFile(true)
    try {
      const path = await uploadNoteFile(profile.id, aptId, file, false)
      await handleAddNote(path)
      toast(t.qr.fileUploaded, 'success')
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setUploadingFile(false)
    }
  }

  if (loading) return <div className="px-4 pt-8 text-center text-muted">{t.app.loading}</div>
  if (notFound) return (
    <div className="px-4 pt-8 text-center text-muted">
      <p>{t.qr.notFound}</p>
    </div>
  )
  if (!apartment) return null

  return (
    <div className="min-h-screen bg-app">
      {/* Header */}
      <div className="bg-surface border-b border-line sticky top-0 z-30">
        <div className="px-4 py-3">
          <h1 className="text-lg font-semibold text-ink">{apartment.code}</h1>
          <p className="text-xs text-muted">{apartment.building}</p>
          {apartment.last_cleaned_at && isToday(apartment.last_cleaned_at) && (
            <span className="inline-flex items-center gap-1 mt-1.5 text-xs text-ok bg-ok-soft rounded-full px-2 py-0.5">
              <CheckCircle2 className="w-3 h-3" />
              {t.qr.cleanedToday}
            </span>
          )}
        </div>
        <div className="flex px-4 gap-1 overflow-x-auto">
          <TabButton active={tab === 'norms'} onClick={() => setTab('norms')} label={t.qr.whatShouldBe} />
          <TabButton active={tab === 'comments'} onClick={() => setTab('comments')} label={t.qr.comments} />
          <TabButton active={tab === 'whatsapp'} onClick={() => setTab('whatsapp')} label={t.qr.whatsapp} />
          <TabButton active={tab === 'history'} onClick={() => setTab('history')} label={t.qr.historyTab} />
        </div>
      </div>

      <div className="px-4 pt-4 pb-28">
        {tab === 'norms' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs text-muted">
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{t.qr.updated}: {n(formatDateTime(lastUpdated.toISOString()))}</span>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t.qr.search}
                className="w-full bg-surface rounded-lg pl-10 pr-4 py-2.5 text-sm border border-line focus:border-accent focus:outline-none"
              />
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              <Chip active={activeCategory === ''} onClick={() => setActiveCategory('')} label={t.qr.allNorms} />
              {categories.map((cat) => (
                <Chip key={cat} active={activeCategory === cat} onClick={() => setActiveCategory(cat)} label={cat} />
              ))}
            </div>
            {norms.length === 0 && <p className="text-sm text-muted text-center mt-8">{t.apartments.noNorms}</p>}
            {normTypeOrder.map((nt) => {
              const list = groupedNorms.get(nt)
              if (!list || list.length === 0) return null
              return (
                <div key={nt}>
                  <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">{normTypeLabels[nt]}</h3>
                  <div className="bg-surface rounded-xl border border-line divide-y divide-[var(--line)]">
                    {list.map((nr) => (
                      <div key={`${nr.item_id}-${nr.norm_type}`} className="px-4 py-3 flex items-center justify-between">
                        <div className="min-w-0">
                          <span className="text-sm text-ink">{nr.item_name}</span>
                          {itemCategoryMap.get(nr.item_id) && (
                            <span className="text-xs text-muted ml-2">{itemCategoryMap.get(nr.item_id)}</span>
                          )}
                        </div>
                        <span className="text-sm text-muted shrink-0 ml-2">
                          {n(formatQty(nr.qty, { base_unit: nr.base_unit, pack_size: nr.pack_label ? 2 : 1, pack_label: nr.pack_label }))}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {tab === 'comments' && (
          <div className="space-y-3">
            <div className="flex gap-2 mb-3">
              <input
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder={t.qr.commentPlaceholder}
                className="flex-1 bg-surface rounded-xl px-4 py-2.5 text-sm border border-line focus:border-accent focus:outline-none"
                onKeyDown={(e) => { if (e.key === 'Enter' && !sendingNote) handleAddNote(null) }}
              />
              <button
                onClick={() => photoInputRef.current?.click()}
                disabled={uploadingFile || !navigator.onLine}
                className="bg-surface border border-line rounded-xl px-3 py-2.5 disabled:opacity-40"
              >
                {uploadingFile ? <Loader2 className="w-4 h-4 animate-spin text-muted" /> : <Camera className="w-4 h-4 text-muted" />}
              </button>
              <button
                onClick={() => videoInputRef.current?.click()}
                disabled={uploadingFile || !navigator.onLine}
                className="bg-surface border border-line rounded-xl px-3 py-2.5 disabled:opacity-40"
              >
                <Video className="w-4 h-4 text-muted" />
              </button>
              <button
                onClick={() => handleAddNote(null)}
                disabled={sendingNote || !noteText.trim() || !navigator.onLine}
                className="bg-accent text-white rounded-xl px-4 py-2.5 disabled:opacity-40"
              >
                <Send className="w-4 h-4" />
              </button>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhoto(f); e.target.value = '' }}
              />
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                capture="environment"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleVideo(f); e.target.value = '' }}
              />
            </div>
            {notes.length === 0 && <p className="text-sm text-muted text-center mt-8">{t.qr.noComments}</p>}
            {notes.map((note) => {
              const url = note.photo_path ? noteFileUrls.get(note.photo_path) : null
              const isImg = note.photo_path ? isFileImage(note.photo_path) : false
              return (
                <div key={note.id} className="bg-surface rounded-xl border border-line px-4 py-3">
                  <p className="text-sm text-ink">{note.body}</p>
                  {note.photo_path && (
                    <div className="mt-2">
                      {url && isImg && <img src={url} alt="" className="rounded-xl max-h-64 object-cover" />}
                      {url && !isImg && <video src={url} controls className="rounded-xl max-h-64 w-full" />}
                      {!url && <p className="text-xs text-muted">{t.qr.fileUnavailable}</p>}
                    </div>
                  )}
                  <p className="text-xs text-muted mt-1.5">{n(formatDateTime(note.created_at))}</p>
                </div>
              )
            })}
          </div>
        )}

        {tab === 'whatsapp' && (
          <WhatsappSection
            contacts={contacts}
            apartment={apartment}
            notePhotos={notePhotos}
            noteFileUrls={noteFileUrls}
          />
        )}

        {tab === 'history' && (
          <div className="space-y-3">
            {cleaningEvents.length === 0 ? (
              <p className="text-sm text-muted text-center mt-8">{t.qr.noCleaningHistory}</p>
            ) : (
              cleaningEvents.map((ev) => (
                <div key={ev.id} className="bg-surface rounded-xl border border-line px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-ink">{n(formatDateTime(ev.cleaned_at))}</span>
                    {ev.status === 'reversed' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-bad-soft text-bad font-medium">
                        {t.qr.cleaningReversed}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted mt-1">
                    {ev.staff_names ?? t.qr.staffNamesEmpty}
                  </p>
                  {ev.note && <p className="text-xs text-muted mt-1">{ev.note}</p>}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Sticky bottom actions */}
      <div className="fixed bottom-16 left-0 right-0 z-20 px-4 pb-2">
        <div className="max-w-lg mx-auto flex gap-2">
          <button
            onClick={() => navigate(`/qr/${aptId}/clean`)}
            className="flex-1 bg-accent text-white rounded-xl py-3 font-medium flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
          >
            <CheckCircle2 className="w-5 h-5" />
            {t.qr.cleaned}
          </button>
          <button
            onClick={() => navigate(`/qr/${aptId}/incident?apartment=${aptId}`)}
            className="flex-1 bg-surface border border-line text-ink rounded-xl py-3 font-medium flex items-center justify-center gap-2 transition-colors hover:bg-app"
          >
            <Wrench className="w-5 h-5" />
            {t.qr.reportBreakdown}
          </button>
        </div>
        {(pendingCount > 0 || failedCount > 0) && (
          <div className="text-center text-xs mt-1 space-y-1">
            {pendingCount > 0 && (
              <p className="text-warn">{t.errors.outboxQueued}: {n(String(pendingCount))}</p>
            )}
            {failedCount > 0 && (
              <p className="text-bad">{t.errors.outboxFailed}: {n(String(failedCount))}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function WhatsappSection({
  contacts,
  apartment,
  notePhotos,
  noteFileUrls,
}: {
  contacts: Contact[]
  apartment: SvApartment
  notePhotos: ApartmentNote[]
  noteFileUrls: Map<string, string>
}) {
  const { t } = useI18n()
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
  const [text, setText] = useState('')

  const grouped = useMemo(() => {
    const map = new Map<string, Contact[]>()
    for (const c of contacts) {
      const group = c.group_name ?? t.common.noGroup
      const list = map.get(group) ?? []
      list.push(c)
      map.set(group, list)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [contacts, t])

  const toggleFile = (path: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const buildMessage = async (contact: Contact) => {
    const parts: string[] = [apartment.code, apartment.building]
    if (text.trim()) parts.push(text.trim())
    for (const path of selectedFiles) {
      try {
        const url = await createSignedUrl(path)
        parts.push(url)
      } catch { /* skip broken */ }
    }
    const digits = contact.phone_e164.replace(/[^0-9]/g, '')
    const encoded = encodeURIComponent(parts.join('\n'))
    window.open(`https://wa.me/${digits}?text=${encoded}`, '_blank')
  }

  if (contacts.length === 0) {
    return <p className="text-sm text-muted text-center mt-8">{t.qr.noWhatsappContacts}</p>
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-ink mb-1.5">{t.qr.selectFiles}</label>
        {notePhotos.length === 0 ? (
          <p className="text-sm text-muted">{t.qr.noFiles}</p>
        ) : (
          <div className="flex gap-2 flex-wrap">
            {notePhotos.map((note) => {
              const url = noteFileUrls.get(note.photo_path!)
              const isImg = isFileImage(note.photo_path!)
              const selected = selectedFiles.has(note.photo_path!)
              return (
                <button
                  key={note.id}
                  onClick={() => toggleFile(note.photo_path!)}
                  className={`relative w-16 h-16 rounded-lg border-2 overflow-hidden transition-colors ${
                    selected ? 'border-accent' : 'border-line'
                  }`}
                >
                  {url && isImg && <img src={url} alt="" className="w-full h-full object-cover" />}
                  {url && !isImg && <video src={url} className="w-full h-full object-cover" />}
                  {!url && <div className="w-full h-full flex items-center justify-center"><FileText className="w-5 h-5 text-muted" /></div>}
                  {selected && (
                    <div className="absolute inset-0 bg-accent/30 flex items-center justify-center">
                      <span className="text-white text-xs">✓</span>
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
      <div>
        <label className="block text-sm font-medium text-ink mb-1.5">{t.qr.whatsappText}</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          className="w-full bg-surface rounded-xl px-4 py-2.5 text-sm border border-line focus:border-accent focus:outline-none resize-none"
        />
      </div>
      <p className="text-xs text-warn">{t.qr.whatsappHint}</p>
      <div className="space-y-3">
        {grouped.map(([group, list]) => (
          <div key={group}>
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">{group}</h3>
            <div className="bg-surface rounded-xl border border-line divide-y divide-[var(--line)]">
              {list.map((contact) => (
                <button
                  key={contact.id}
                  onClick={() => buildMessage(contact)}
                  className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-app transition-colors"
                >
                  <MessageCircle className="w-5 h-5 text-accent shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-ink">{contact.name}</span>
                    {contact.role_title && <span className="text-xs text-muted ml-2">{contact.role_title}</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2.5 text-sm border-b-2 transition-colors whitespace-nowrap ${
        active ? 'border-accent text-accent font-medium' : 'border-transparent text-muted'
      }`}
    >
      {label}
    </button>
  )
}

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-sm whitespace-nowrap transition-colors border ${
        active ? 'bg-accent border-accent text-white' : 'bg-surface border-line text-muted'
      }`}
    >
      {label}
    </button>
  )
}

function isFileImage(path: string): boolean {
  const lower = path.toLowerCase()
  return lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.webp')
}

function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => { resolve(video.duration); video.src = '' }
    video.onerror = () => reject(new Error('Cannot read video metadata'))
    video.src = URL.createObjectURL(file)
  })
}
