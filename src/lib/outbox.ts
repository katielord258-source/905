import { get, update } from 'idb-keyval'
import { supabase } from '@/lib/supabase'
import { toApiError } from '@/lib/errors'
import { toast } from '@/lib/toast'
import { currentDict } from '@/i18n'

export interface OutboxEntry {
  id: string
  userId: string
  apartmentId: number
  cleanedAt: string
  clientOpId: string
  staffIds: number[]
  leadStaffId: number | null
  note: string | null
  createdAt: number
  status: 'pending' | 'failed'
  lastError: string | null
  attempts: number
}

const OUTBOX_KEY = 'cleaning-outbox'

type Listener = () => void
const listeners = new Set<Listener>()

function notify() {
  for (const l of listeners) l()
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export async function getOutboxSummary(userId: string): Promise<{ pending: number; failed: number }> {
  const all = (await get<OutboxEntry[]>(OUTBOX_KEY)) ?? []
  const mine = all.filter((e) => e.userId === userId)
  return {
    pending: mine.filter((e) => e.status === 'pending').length,
    failed: mine.filter((e) => e.status === 'failed').length,
  }
}

export async function getOutboxEntries(userId: string): Promise<OutboxEntry[]> {
  const all = (await get<OutboxEntry[]>(OUTBOX_KEY)) ?? []
  return all.filter((e) => e.userId === userId).sort((a, b) => a.createdAt - b.createdAt)
}

export async function addOutboxEntry(entry: Omit<OutboxEntry, 'status' | 'lastError' | 'attempts'>): Promise<void> {
  const full: OutboxEntry = {
    ...entry,
    status: 'pending',
    lastError: null,
    attempts: 0,
  }
  await update<OutboxEntry[]>(OUTBOX_KEY, (existing) => [...(existing ?? []), full])
  notify()
}

async function removeOutboxEntry(id: string): Promise<void> {
  await update<OutboxEntry[]>(OUTBOX_KEY, (existing) =>
    (existing ?? []).filter((e) => e.id !== id),
  )
  notify()
}

export async function deleteFailedEntry(id: string): Promise<void> {
  await removeOutboxEntry(id)
}

let flushInProgress = false

export async function flushOutbox(userId: string): Promise<void> {
  if (flushInProgress) return
  flushInProgress = true
  try {
    const entries = await getOutboxEntries(userId)
    if (entries.length === 0) return

    let anySynced = false

    for (const entry of entries) {
      const { error } = await supabase.rpc('complete_cleaning', {
        p_apartment_id: entry.apartmentId,
        p_cleaned_at: entry.cleanedAt,
        p_client_op_id: entry.clientOpId,
        p_staff_ids: entry.staffIds,
        p_lead_staff_id: entry.leadStaffId,
        p_note: entry.note,
      })

      if (!error) {
        await removeOutboxEntryById(entry.id)
        anySynced = true
        continue
      }

      const apiError = toApiError(error)

      if (apiError.code === '23505') {
        await removeOutboxEntryById(entry.id)
        anySynced = true
        continue
      }

      if (apiError.isNetwork) {
        await updateOutboxEntry(entry.id, (e) => {
          e.attempts += 1
          e.lastError = apiError.message
        })
        break
      }

      await updateOutboxEntry(entry.id, (e) => {
        e.status = 'failed'
        e.lastError = apiError.message
        e.attempts += 1
      })
      notify()
    }

    if (anySynced) {
      const d = currentDict()
      toast(d.errors.outboxSynced, 'success')
    }
  } finally {
    flushInProgress = false
    notify()
  }
}

async function removeOutboxEntryById(id: string): Promise<void> {
  await update<OutboxEntry[]>(OUTBOX_KEY, (existing) =>
    (existing ?? []).filter((e) => e.id !== id),
  )
  notify()
}

async function updateOutboxEntry(id: string, mutate: (e: OutboxEntry) => void): Promise<void> {
  await update<OutboxEntry[]>(OUTBOX_KEY, (existing) => {
    const list = existing ?? []
    const idx = list.findIndex((e) => e.id === id)
    if (idx === -1) return list
    mutate(list[idx])
    return list
  })
}

let intervalId: ReturnType<typeof setInterval> | null = null
let onlineHandler: (() => void) | null = null
let visibleHandler: (() => void) | null = null

export function startOutboxSync(userId: string): void {
  stopOutboxSync()

  flushOutbox(userId).catch(() => {})

  onlineHandler = () => flushOutbox(userId).catch(() => {})
  visibleHandler = () => {
    if (document.visibilityState === 'visible') flushOutbox(userId).catch(() => {})
  }

  window.addEventListener('online', onlineHandler)
  document.addEventListener('visibilitychange', visibleHandler)

  intervalId = setInterval(async () => {
    const summary = await getOutboxSummary(userId)
    if (summary.pending > 0 || summary.failed > 0) {
      flushOutbox(userId).catch(() => {})
    }
  }, 30000)
}

export function stopOutboxSync(): void {
  if (intervalId !== null) {
    clearInterval(intervalId)
    intervalId = null
  }
  if (onlineHandler) {
    window.removeEventListener('online', onlineHandler)
    onlineHandler = null
  }
  if (visibleHandler) {
    document.removeEventListener('visibilitychange', visibleHandler)
    visibleHandler = null
  }
}
