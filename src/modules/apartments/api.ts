import { supabase } from '@/lib/supabase'
import type { SvApartment, SvNorm, ApartmentNote, SvStaff } from '@/lib/database.types'

export async function fetchApartments(): Promise<SvApartment[]> {
  const { data, error } = await supabase
    .from('sv_apartments')
    .select('id,code,building,type,status,last_cleaned_at')
    .order('code')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function fetchApartmentById(id: number): Promise<SvApartment | null> {
  const { data, error } = await supabase
    .from('sv_apartments')
    .select('id,code,building,type,status,last_cleaned_at')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export async function fetchNorms(apartmentId: number): Promise<SvNorm[]> {
  const { data, error } = await supabase
    .from('sv_norms')
    .select('apartment_id,norm_type,item_id,item_name,base_unit,pack_label,qty')
    .eq('apartment_id', apartmentId)
    .order('norm_type')
    .order('item_name')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function fetchNotes(apartmentId: number): Promise<ApartmentNote[]> {
  const { data, error } = await supabase
    .from('apartment_notes')
    .select('id,apartment_id,author,body,photo_path,visibility,created_at')
    .eq('apartment_id', apartmentId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function addNote(apartmentId: number, body: string): Promise<void> {
  const { error } = await supabase
    .from('apartment_notes')
    .insert({ apartment_id: apartmentId, body, visibility: 'all' })
  if (error) throw new Error(error.message)
}

export async function fetchStaff(): Promise<SvStaff[]> {
  const { data, error } = await supabase
    .from('sv_staff')
    .select('id,full_name')
    .order('full_name')
  if (error) throw new Error(error.message)
  return data ?? []
}
