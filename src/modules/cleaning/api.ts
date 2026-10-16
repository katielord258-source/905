import { supabase } from '@/lib/supabase'
import type { CleaningResult } from '@/lib/database.types'
import { addOutboxEntry, flushOutbox } from '@/lib/outbox'

export async function completeCleaning(params: {
  apartmentId: number
  cleanedAt: string
  clientOpId: string
  staffIds: number[]
  leadStaffId: number | null
  note: string | null
}): Promise<CleaningResult> {
  const { data, error } = await supabase.rpc('complete_cleaning', {
    p_apartment_id: params.apartmentId,
    p_cleaned_at: params.cleanedAt,
    p_client_op_id: params.clientOpId,
    p_staff_ids: params.staffIds,
    p_lead_staff_id: params.leadStaffId,
    p_note: params.note,
  })
  if (error) throw error
  return data as CleaningResult
}

export async function queueCleaningOffline(params: {
  apartmentId: number
  cleanedAt: string
  clientOpId: string
  staffIds: number[]
  leadStaffId: number | null
  note: string | null
}): Promise<void> {
  await addOutboxEntry({
    id: crypto.randomUUID(),
    ...params,
    createdAt: Date.now(),
  })
}

export async function retryOutbox(): Promise<void> {
  await flushOutbox()
}
