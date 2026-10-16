import { get, set, del } from 'idb-keyval'
import { supabase } from '@/lib/supabase'

interface OutboxEntry {
  id: string
  apartmentId: number
  cleanedAt: string
  clientOpId: string
  staffIds: number[]
  leadStaffId: number | null
  note: string | null
  createdAt: number
}

const OUTBOX_KEY = 'cleaning-outbox'

async function getOutbox(): Promise<OutboxEntry[]> {
  return (await get(OUTBOX_KEY)) ?? []
}

async function setOutbox(entries: OutboxEntry[]): Promise<void> {
  await set(OUTBOX_KEY, entries)
}

export async function addOutboxEntry(entry: OutboxEntry): Promise<void> {
  const entries = await getOutbox()
  entries.push(entry)
  await setOutbox(entries)
}

export async function removeOutboxEntry(id: string): Promise<void> {
  const entries = await getOutbox()
  await setOutbox(entries.filter((e) => e.id !== id))
}

export async function getPendingOutbox(): Promise<OutboxEntry[]> {
  return await getOutbox()
}

export async function flushOutbox(): Promise<void> {
  const entries = await getOutbox()
  if (entries.length === 0) return

  const remaining: OutboxEntry[] = []
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
      continue
    }
    remaining.push(entry)
  }
  if (remaining.length === 0) {
    await del(OUTBOX_KEY)
  } else {
    await setOutbox(remaining)
  }
}
