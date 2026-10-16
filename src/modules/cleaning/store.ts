import { useAuth } from '@/modules/core/store'
import { supabase } from '@/lib/supabase'
import type { SvCleaningEvent } from '@/lib/database.types'

export async function fetchCleaningEvents(apartmentId: number): Promise<SvCleaningEvent[]> {
  const { data, error } = await supabase
    .from('sv_cleaning_events')
    .select('id,apartment_id,cleaned_at,status,note,staff_names')
    .eq('apartment_id', apartmentId)
    .order('cleaned_at', { ascending: false })
    .limit(20)
  if (error) throw new Error(error.message)
  return data ?? []
}

export function useCurrentUser() {
  const profile = useAuth((s) => s.profile)
  return profile
}
