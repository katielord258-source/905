import { supabase } from '@/lib/supabase'
import type { SvApartment, SvNorm, SvItem, ApartmentNote, Contact } from '@/lib/database.types'
import { swrFetch, cacheKey, normCacheKey } from '@/lib/offline-cache'

export async function fetchApartment(id: number): Promise<SvApartment | null> {
  const { data, error } = await supabase
    .from('sv_apartments')
    .select('id,code,building,type,status,last_cleaned_at')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function fetchNorms(userId: string, apartmentId: number): Promise<SvNorm[]> {
  const { data } = await swrFetch(normCacheKey(userId, apartmentId), async () => {
    const { data, error } = await supabase
      .from('sv_norms')
      .select('apartment_id,norm_type,item_id,item_name,base_unit,pack_label,qty')
      .eq('apartment_id', apartmentId)
      .order('norm_type')
      .order('item_name')
    if (error) throw error
    return data ?? []
  })
  return data
}

export async function fetchItems(): Promise<SvItem[]> {
  const { data, error } = await supabase
    .from('sv_items')
    .select('id,name,category,base_unit')
    .order('name')
  if (error) throw error
  return data ?? []
}

export async function fetchNotes(apartmentId: number): Promise<ApartmentNote[]> {
  const { data, error } = await supabase
    .from('apartment_notes')
    .select('id,apartment_id,author,body,photo_path,visibility,created_at')
    .eq('apartment_id', apartmentId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function addNote(apartmentId: number, body: string, photoPath: string | null): Promise<void> {
  const { error } = await supabase
    .from('apartment_notes')
    .insert({ apartment_id: apartmentId, body, photo_path: photoPath, visibility: 'all' })
  if (error) throw error
}

export async function uploadNoteFile(
  userId: string,
  apartmentId: number,
  file: File,
  isImage: boolean,
): Promise<string> {
  const ts = Date.now()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const ext = isImage ? '.jpg' : `.${file.name.split('.').pop() ?? 'bin'}`
  const path = `${userId}/notes/${apartmentId}/${ts}-${safeName}`

  if (isImage) {
    const compressed = await compressImage(file, 1280, 0.8)
    const { error } = await supabase.storage
      .from('incident-photos')
      .upload(path, compressed, { contentType: 'image/jpeg' })
    if (error) throw error
  } else {
    const { error } = await supabase.storage
      .from('incident-photos')
      .upload(path, file, { contentType: file.type || 'application/octet-stream' })
    if (error) throw error
  }
  return path
}

export async function createSignedUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('incident-photos')
    .createSignedUrl(path, 60 * 60 * 24 * 7)
  if (error) throw error
  return data.signedUrl
}

export async function fetchWhatsappContacts(): Promise<Contact[]> {
  const { data, error } = await supabase
    .from('contacts')
    .select('id,group_name,name,role_title,phone_e164,has_whatsapp,sort,active')
    .eq('active', true)
    .eq('has_whatsapp', true)
    .order('sort')
    .order('name')
  if (error) throw error
  return data ?? []
}

function compressImage(file: File, maxSize: number, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        let { width, height } = img
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = Math.round((height * maxSize) / width)
            width = maxSize
          } else {
            width = Math.round((width * maxSize) / height)
            height = maxSize
          }
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) { reject(new Error('Canvas not supported')); return }
        ctx.drawImage(img, 0, 0, width, height)
        canvas.toBlob(
          (blob) => { if (blob) resolve(blob); else reject(new Error('Compression failed')) },
          'image/jpeg',
          quality,
        )
      }
      img.onerror = () => reject(new Error('Image load failed'))
      img.src = e.target?.result as string
    }
    reader.onerror = () => reject(new Error('File read failed'))
    reader.readAsDataURL(file)
  })
}
