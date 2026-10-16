import { supabase } from '@/lib/supabase'
import type {
  WarehouseStockRow,
  ReportStockMoveRow,
  ToOrderRow,
  ApartmentGapRow,
  EventRow,
  StockMoveRow,
  NormRuleRow,
  CleaningEventRow,
  IssueMissingResult,
  Apartment,
  Building,
  Staff,
  Contact,
  Incident,
  Category,
  Item,
  ItemKind,
  BaseUnit,
  Supplier,
  DocumentRow,
  DocumentWithSupplier,
  AttachmentRow,
  PostDocumentResult,
} from '@/lib/database.types'

// ---- Queries ----

export async function fetchToOrder(): Promise<ToOrderRow[]> {
  const { data, error } = await supabase
    .from('to_order')
    .select('item_id,name,category,base_unit,pack_size,pack_label,qty,min_stock,shortage')
    .order('shortage', { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function fetchApartmentGaps(): Promise<ApartmentGapRow[]> {
  const { data, error } = await supabase
    .from('apartment_gap')
    .select('apartment_id,code,item_id,name,norm,actual,gap')
    .gt('gap', 0)
    .order('code')
    .order('name')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function fetchShortageEvents(): Promise<EventRow[]> {
  const { data, error } = await supabase
    .from('events')
    .select('id,type,payload,created_at,processed_at')
    .eq('type', 'shortage')
    .is('processed_at', null)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function fetchWarehouseStock(): Promise<WarehouseStockRow[]> {
  const { data, error } = await supabase
    .from('warehouse_stock')
    .select('item_id,name,category,kind,base_unit,pack_size,pack_label,qty,min_stock,below_min')
    .order('name')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function fetchReportWarehouseStock(): Promise<WarehouseStockRow[]> {
  const rows: WarehouseStockRow[] = []
  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase
      .from('warehouse_stock')
      .select('item_id,name,category,kind,base_unit,pack_size,pack_label,qty,min_stock,below_min')
      .order('name')
      .range(start, start + 999)
    if (error) throw new Error(error.message)
    const page = (data ?? []) as WarehouseStockRow[]
    rows.push(...page)
    if (page.length < 1000) break
  }
  return rows
}

export async function fetchReportStockMoves(fromISO: string, toISO: string): Promise<ReportStockMoveRow[]> {
  const rows: Array<StockMoveRow & { moved_at: string }> = []
  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase
      .from('stock_moves')
      .select('id,item_id,qty,unit_cost,source_type,apartment_id,moved_at')
      .gte('moved_at', fromISO)
      .lt('moved_at', toISO)
      .order('moved_at', { ascending: false })
      .range(start, start + 999)
    if (error) throw new Error(error.message)
    const page = (data ?? []) as Array<StockMoveRow & { moved_at: string }>
    rows.push(...page)
    if (page.length < 1000) break
  }

  const itemIds = Array.from(new Set(rows.map((row) => row.item_id)))
  const apartmentIds = Array.from(new Set(rows.map((row) => row.apartment_id).filter((id): id is number => id !== null)))
  const [itemsResult, apartmentsResult] = await Promise.all([
    itemIds.length ? supabase.from('items').select('id,name,category_id,pack_size,pack_label').in('id', itemIds) : Promise.resolve({ data: [], error: null }),
    apartmentIds.length ? supabase.from('apartments').select('id,code').in('id', apartmentIds) : Promise.resolve({ data: [], error: null }),
  ])
  if (itemsResult.error) throw new Error(itemsResult.error.message)
  if (apartmentsResult.error) throw new Error(apartmentsResult.error.message)

  const categoryIds = Array.from(new Set((itemsResult.data ?? []).map((item) => item.category_id)))
  const categoriesResult = categoryIds.length
    ? await supabase.from('categories').select('id,name').in('id', categoryIds)
    : { data: [], error: null }
  if (categoriesResult.error) throw new Error(categoriesResult.error.message)

  const itemMap = new Map((itemsResult.data ?? []).map((item) => [item.id, item]))
  const categoryMap = new Map((categoriesResult.data ?? []).map((category) => [category.id, category.name]))
  const apartmentMap = new Map((apartmentsResult.data ?? []).map((apartment) => [apartment.id, apartment.code]))

  return rows.map((row) => {
    const item = itemMap.get(row.item_id)
    return {
      id: row.id,
      item_id: row.item_id,
      item_name: item?.name ?? '—',
      category: item ? categoryMap.get(item.category_id) ?? '—' : '—',
      pack_size: Number(item?.pack_size ?? 1),
      pack_label: item?.pack_label ?? '',
      qty: Number(row.qty),
      unit_cost: row.unit_cost == null ? null : Number(row.unit_cost),
      source_type: row.source_type,
      apartment_id: row.apartment_id,
      apartment_code: row.apartment_id == null ? null : apartmentMap.get(row.apartment_id) ?? '—',
      moved_at: row.moved_at,
    }
  })
}

export async function fetchStockMoves(itemId: number, offset = 0): Promise<StockMoveRow[]> {
  const { data, error } = await supabase
    .from('stock_moves')
    .select('id,item_id,from_loc,to_loc,qty,unit_cost,source_type,source_id,apartment_id,staff_id,note,moved_at,created_by')
    .eq('item_id', itemId)
    .order('moved_at', { ascending: false })
    .range(offset, offset + 49)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Array<StockMoveRow & { created_by: string | null }>
  const locationIds = Array.from(new Set(rows.flatMap((row) => [row.from_loc, row.to_loc])))
  const authorIds = Array.from(new Set(rows.map((row) => row.created_by).filter((id): id is string => id !== null)))
  const [locationsResult, profilesResult] = await Promise.all([
    locationIds.length ? supabase.from('locations').select('id,name,type').in('id', locationIds) : Promise.resolve({ data: [], error: null }),
    authorIds.length ? supabase.from('profiles').select('id,full_name,login').in('id', authorIds) : Promise.resolve({ data: [], error: null }),
  ])
  if (locationsResult.error) throw new Error(locationsResult.error.message)
  if (profilesResult.error) throw new Error(profilesResult.error.message)
  const locationMap = new Map((locationsResult.data ?? []).map((location) => [location.id, location]))
  const profileMap = new Map((profilesResult.data ?? []).map((profile) => [profile.id, profile.full_name || profile.login]))
  return rows.map(({ created_by: createdBy, ...row }) => ({
    ...row,
    from_location: locationMap.get(row.from_loc),
    to_location: locationMap.get(row.to_loc),
    author: createdBy ? profileMap.get(createdBy) ?? null : null,
  }))
}

export async function fetchApartmentsAdmin(): Promise<Apartment[]> {
  const { data, error } = await supabase
    .from('apartments')
    .select('id,building_id,number,code,type,status,created_at')
    .order('code')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function fetchBuildings(): Promise<Building[]> {
  const { data, error } = await supabase
    .from('buildings')
    .select('id,name')
    .order('name')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function fetchNormRules(apartmentId: number): Promise<NormRuleRow[]> {
  const { data, error } = await supabase
    .from('norm_rules')
    .select('id,norm_type,apt_type,apartment_id,item_id,qty,note')
    .eq('apartment_id', apartmentId)
    .order('norm_type')
    .order('item_id')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function fetchTemplateNorms(aptType: string): Promise<NormRuleRow[]> {
  const { data, error } = await supabase
    .from('norm_rules')
    .select('id,norm_type,apt_type,apartment_id,item_id,qty,note')
    .eq('apt_type', aptType)
    .is('apartment_id', null)
    .order('norm_type')
    .order('item_id')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function fetchCleaningEvents(apartmentId: number): Promise<CleaningEventRow[]> {
  const { data, error } = await supabase
    .from('cleaning_events')
    .select('id, apartment_id, cleaned_at, status, revision, note, lead_staff_id, reverse_reason, cleaning_event_staff(staff_id, staff(full_name))')
    .eq('apartment_id', apartmentId)
    .order('cleaned_at', { ascending: false })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as unknown as Array<{
    id: string
    apartment_id: number
    cleaned_at: string
    status: CleaningEventRow['status']
    revision: number
    note: string | null
    lead_staff_id: number | null
    reverse_reason: string | null
    cleaning_event_staff: Array<{
      staff_id: number
      staff: { full_name: string } | { full_name: string }[]
    }>
  }>
  return rows.map((r) => ({
    ...r,
    cleaning_event_staff: (r.cleaning_event_staff ?? []).map((e) => ({
      staff_id: e.staff_id,
      staff: Array.isArray(e.staff) ? e.staff[0] : e.staff,
    })),
  }))
}

export async function fetchAllStaff(): Promise<Staff[]> {
  const { data, error } = await supabase
    .from('staff')
    .select('id,full_name,role,phone,active')
    .order('full_name')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function fetchAllContacts(): Promise<Contact[]> {
  const { data, error } = await supabase
    .from('contacts')
    .select('id,group_name,name,role_title,phone_e164,has_whatsapp,sort,active')
    .order('sort')
    .order('name')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function fetchAllIncidents(): Promise<Incident[]> {
  const { data, error } = await supabase
    .from('incidents')
    .select('id,apartment_id,item_id,free_text,kind,qty,status,photo_paths,comment,created_by,created_at,resolved_by,resolved_at,resolution_note,writeoff_move_id,client_op_id')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}

// ---- Mutations (all through RPC) ----

export async function postMove(params: {
  op: string
  item: number
  qty: number
  apartment?: number | null
  staff?: number | null
  unitCost?: number | null
  note?: string | null
}): Promise<number> {
  const { data, error } = await supabase.rpc('post_move', {
    p_op: params.op,
    p_item: params.item,
    p_qty: params.qty,
    p_apartment: params.apartment ?? null,
    p_staff: params.staff ?? null,
    p_unit_cost: params.unitCost ?? null,
    p_note: params.note ?? null,
  })
  if (error) throw new Error(error.message)
  return data as number
}

export async function postDocument(params: {
  op: string
  lines: Array<{ item_id: number; qty: number; unit_cost?: number | null }>
  apartment?: number | null
  staff?: number | null
  supplier?: number | null
  note?: string | null
}): Promise<PostDocumentResult> {
  const { data, error } = await supabase.rpc('post_document', {
    p_op: params.op,
    p_lines: params.lines,
    p_apartment: params.apartment ?? null,
    p_staff: params.staff ?? null,
    p_supplier: params.supplier ?? null,
    p_note: params.note ?? null,
  })
  if (error) throw new Error(error.message)
  return data as PostDocumentResult
}

export async function fetchSuppliers(): Promise<Supplier[]> {
  const { data, error } = await supabase
    .from('suppliers')
    .select('id,name,phone,note')
    .order('name')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function fetchDocuments(docType?: string): Promise<DocumentWithSupplier[]> {
  let query = supabase
    .from('documents')
    .select('id,doc_type,number,doc_date,supplier_id,status,note,total_cost,created_at')
    .order('created_at', { ascending: false })
    .limit(100)
  if (docType && docType !== 'all') query = query.eq('doc_type', docType)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as DocumentRow[]
  const supplierIds = Array.from(new Set(rows.map((r) => r.supplier_id).filter((id): id is number => id !== null)))
  let supplierMap = new Map<number, string>()
  if (supplierIds.length) {
    const supRes = await supabase.from('suppliers').select('id,name').in('id', supplierIds)
    if (supRes.error) throw new Error(supRes.error.message)
    supplierMap = new Map((supRes.data ?? []).map((s: { id: number; name: string }) => [s.id, s.name]))
  }
  return rows.map((r) => ({ ...r, supplier_name: r.supplier_id ? supplierMap.get(r.supplier_id) ?? null : null }))
}

export async function fetchDocumentMoves(docId: string): Promise<Array<StockMoveRow & { item_name: string; item_base_unit: string; item_pack_size: number; item_pack_label: string }>> {
  const { data, error } = await supabase
    .from('stock_moves')
    .select('id,item_id,from_loc,to_loc,qty,unit_cost,source_type,source_id,apartment_id,staff_id,note,moved_at')
    .eq('doc_id', docId)
    .order('moved_at', { ascending: false })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as StockMoveRow[]
  const itemIds = Array.from(new Set(rows.map((r) => r.item_id)))
  const locationIds = Array.from(new Set(rows.flatMap((r) => [r.from_loc, r.to_loc])))
  const [itemsResult, locationsResult] = await Promise.all([
    itemIds.length ? supabase.from('items').select('id,name,base_unit,pack_size,pack_label').in('id', itemIds) : Promise.resolve({ data: [], error: null }),
    locationIds.length ? supabase.from('locations').select('id,name,type').in('id', locationIds) : Promise.resolve({ data: [], error: null }),
  ])
  if (itemsResult.error) throw new Error(itemsResult.error.message)
  if (locationsResult.error) throw new Error(locationsResult.error.message)
  const itemMap = new Map((itemsResult.data ?? []).map((i) => [i.id, i]))
  const locationMap = new Map((locationsResult.data ?? []).map((l) => [l.id, l]))
  return rows.map((r) => {
    const item = itemMap.get(r.item_id)
    return {
      ...r,
      from_location: locationMap.get(r.from_loc),
      to_location: locationMap.get(r.to_loc),
      item_name: item?.name ?? '?',
      item_base_unit: item?.base_unit ?? 'pcs',
      item_pack_size: item?.pack_size ?? 1,
      item_pack_label: item?.pack_label ?? '',
    }
  })
}

export async function fetchAttachments(docId: string): Promise<AttachmentRow[]> {
  const { data, error } = await supabase
    .from('attachments')
    .select('id,doc_id,incident_id,kind,storage_path,mime,created_at')
    .eq('doc_id', docId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function uploadAttachment(docId: string, file: File): Promise<AttachmentRow> {
  const timestamp = Date.now()
  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
  const path = `${docId}/${timestamp}-${safeName}`
  const { error: uploadError } = await supabase.storage
    .from('receipts')
    .upload(path, file, { upsert: false })
  if (uploadError) throw new Error(uploadError.message)
  const { data, error } = await supabase
    .from('attachments')
    .insert({ doc_id: docId, kind: 'receipt', storage_path: path, mime: file.type })
    .select('id,doc_id,incident_id,kind,storage_path,mime,created_at')
    .single()
  if (error) throw new Error(error.message)
  return data as AttachmentRow
}

export async function createSignedUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('receipts')
    .createSignedUrl(path, 3600)
  if (error) throw new Error(error.message)
  return data.signedUrl
}

export async function deleteAttachment(id: string, storagePath: string): Promise<void> {
  const { error: storageError } = await supabase.storage.from('receipts').remove([storagePath])
  if (storageError) throw new Error(storageError.message)
  const { error } = await supabase.from('attachments').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function issueMissing(apartmentId: number): Promise<IssueMissingResult> {
  const { data, error } = await supabase.rpc('issue_missing_to_apartment', {
    p_apartment: apartmentId,
  })
  if (error) throw new Error(error.message)
  return data as IssueMissingResult
}

export async function reverseCleaning(eventId: string, reason: string | null): Promise<unknown> {
  const { data, error } = await supabase.rpc('reverse_cleaning', {
    p_event: eventId,
    p_reason: reason,
  })
  if (error) throw new Error(error.message)
  return data
}

export async function recalculateCleaning(
  eventId: string,
  cleanedAt: string | null,
  staffIds: number[] | null,
  leadStaffId: number | null,
): Promise<unknown> {
  const { data, error } = await supabase.rpc('recalculate_cleaning', {
    p_event: eventId,
    p_cleaned_at: cleanedAt,
    p_staff_ids: staffIds,
    p_lead_staff_id: leadStaffId,
  })
  if (error) throw new Error(error.message)
  return data
}

export async function approveIncident(
  incidentId: string,
  decision: 'confirm' | 'reject',
  note: string | null,
  force: boolean,
): Promise<unknown> {
  const { data, error } = await supabase.rpc('approve_incident', {
    p_incident: incidentId,
    p_decision: decision,
    p_note: note,
    p_force: force,
  })
  if (error) throw new Error(error.message)
  return data
}

// ---- Staff CRUD (admin_all policy) ----

export async function createStaff(name: string, role: string, phone: string): Promise<void> {
  const { error } = await supabase
    .from('staff')
    .insert({ full_name: name, role, phone: phone || null, active: true })
  if (error) throw new Error(error.message)
}

export async function updateStaff(id: number, patch: Partial<Pick<Staff, 'full_name' | 'role' | 'phone' | 'active'>>): Promise<void> {
  const { error } = await supabase.from('staff').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteStaff(id: number): Promise<void> {
  const { error } = await supabase.from('staff').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ---- Contacts CRUD (admin_all policy) ----

export async function createContact(params: {
  name: string
  group_name: string | null
  role_title: string | null
  phone_e164: string
  has_whatsapp: boolean
  sort: number
}): Promise<void> {
  const { error } = await supabase.from('contacts').insert({ ...params, active: true })
  if (error) throw new Error(error.message)
}

export async function updateContact(id: number, patch: Partial<Contact>): Promise<void> {
  const { error } = await supabase.from('contacts').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteContact(id: number): Promise<void> {
  const { error } = await supabase.from('contacts').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ---- Norm rules CRUD (admin_all policy) ----

export async function upsertNormRule(params: {
  id?: number
  norm_type: string
  apartment_id: number | null
  apt_type: string | null
  item_id: number
  qty: number
  note?: string | null
}): Promise<void> {
  const payload = {
    norm_type: params.norm_type,
    apartment_id: params.apartment_id,
    apt_type: params.apt_type,
    item_id: params.item_id,
    qty: params.qty,
    note: params.note ?? null,
  }
  if (params.id) {
    const { error } = await supabase.from('norm_rules').update(payload).eq('id', params.id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase.from('norm_rules').insert(payload)
    if (error) throw new Error(error.message)
  }
}

export async function deleteNormRule(id: number): Promise<void> {
  const { error } = await supabase.from('norm_rules').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ---- Categories CRUD (admin_all policy) ----

export async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('id,name,kind,sort')
    .order('sort')
    .order('name')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function createCategory(name: string, kind: ItemKind, sort: number): Promise<void> {
  const { error } = await supabase.from('categories').insert({ name, kind, sort })
  if (error) throw new Error(error.message)
}

export async function updateCategory(id: number, patch: Partial<Pick<Category, 'name' | 'kind' | 'sort'>>): Promise<void> {
  const { error } = await supabase.from('categories').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteCategory(id: number): Promise<void> {
  const { error } = await supabase.from('categories').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ---- Items CRUD (admin_all policy) ----

export async function fetchItems(): Promise<Item[]> {
  const { data, error } = await supabase
    .from('items')
    .select('id,category_id,name,base_unit,pack_size,pack_label,min_stock,track_on_hand,qr_code,photo_path,active,sort,supplier_id')
    .order('sort')
    .order('name')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function createItem(params: {
  category_id: number
  name: string
  base_unit: BaseUnit
  pack_size: number
  pack_label: string
  min_stock: number | null
  track_on_hand: boolean
  supplier_id?: number | null
}): Promise<void> {
  const { error } = await supabase.from('items').insert({ ...params, active: true, sort: 0 })
  if (error) throw new Error(error.message)
}

export async function updateItem(id: number, patch: Partial<Pick<Item, 'name' | 'category_id' | 'base_unit' | 'pack_size' | 'pack_label' | 'min_stock' | 'track_on_hand' | 'active' | 'supplier_id'>>): Promise<void> {
  const { error } = await supabase.from('items').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteItem(id: number): Promise<void> {
  const { error } = await supabase.from('items').delete().eq('id', id)
  if (error) throw Object.assign(new Error(error.message), { code: error.code })
}

export async function itemHasHistory(itemId: number): Promise<boolean> {
  const [moves, norms] = await Promise.all([
    supabase.from('stock_moves').select('id', { head: true, count: 'exact' }).eq('item_id', itemId),
    supabase.from('norm_rules').select('id', { head: true, count: 'exact' }).eq('item_id', itemId),
  ])
  return (moves.count ?? 0) > 0 || (norms.count ?? 0) > 0
}
