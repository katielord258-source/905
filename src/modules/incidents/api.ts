import { supabase } from '@/lib/supabase'
import type { Incident, IncidentKind, SvItem } from '@/lib/database.types'

export async function fetchItems(): Promise<SvItem[]> {
  const { data, error } = await supabase
    .from('sv_items')
    .select('id,name,category,base_unit')
    .order('name')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function fetchMyIncidents(): Promise<Incident[]> {
  const { data, error } = await supabase
    .from('incidents')
    .select('id,apartment_id,item_id,free_text,kind,qty,status,photo_paths,comment,created_by,created_at,resolved_by,resolved_at,resolution_note,writeoff_move_id')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function createIncident(params: {
  apartmentId: number
  itemId: number | null
  freeText: string | null
  kind: IncidentKind
  qty: number
  comment: string | null
  photoPaths: string[]
}): Promise<void> {
  const { error } = await supabase.from('incidents').insert({
    apartment_id: params.apartmentId,
    item_id: params.itemId,
    free_text: params.freeText,
    kind: params.kind,
    qty: params.qty,
    comment: params.comment,
    photo_paths: params.photoPaths,
    status: 'new',
  })
  if (error) throw new Error(error.message)
}

export async function uploadIncidentPhoto(
  userId: string,
  file: File,
): Promise<string> {
  const uuid = crypto.randomUUID()
  const path = `${userId}/${uuid}.jpg`

  const compressed = await compressImage(file, 1280, 0.8)
  const { error } = await supabase.storage
    .from('incident-photos')
    .upload(path, compressed, { contentType: 'image/jpeg' })
  if (error) throw new Error(error.message)
  return path
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
        if (!ctx) {
          reject(new Error('Canvas not supported'))
          return
        }
        ctx.drawImage(img, 0, 0, width, height)
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob)
            else reject(new Error('Compression failed'))
          },
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
