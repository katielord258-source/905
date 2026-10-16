import { supabase } from '@/lib/supabase'
import type { Contact } from '@/lib/database.types'

export async function fetchContacts(): Promise<Contact[]> {
  const { data, error } = await supabase
    .from('contacts')
    .select('id,group_name,name,role_title,phone_e164,has_whatsapp,sort,active')
    .eq('active', true)
    .order('sort')
    .order('name')
  if (error) throw new Error(error.message)
  return data ?? []
}
