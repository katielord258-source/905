export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type AppRole = 'admin' | 'supervisor' | 'manager'
export type AptType = 'studio' | '1br' | '2br'
export type ItemKind = 'asset' | 'consumable'
export type BaseUnit = 'pcs' | 'g' | 'ml'
export type LocType = 'warehouse' | 'apartment' | 'holder' | 'sink' | 'source'
export type NormType = 'asset_standing' | 'turnover_replenish' | 'cleaning_consumption'
export type EventStatus = 'done' | 'reversed'
export type IncidentKind = 'breakdown' | 'broken' | 'lost' | 'other'
export type IncidentStatus = 'new' | 'confirmed' | 'rejected'
export type DocType = 'receipt' | 'issue' | 'writeoff' | 'inventory'
export type DocStatus = 'draft' | 'posted' | 'void'

export interface Profile {
  id: string
  login: string
  full_name: string
  role: AppRole
  active: boolean
  created_at: string
}

export interface Building {
  id: number
  name: string
}

export interface Apartment {
  id: number
  building_id: number
  number: string
  code: string
  type: AptType
  status: string
  created_at: string
}

export interface ApartmentNote {
  id: number
  apartment_id: number
  author: string
  body: string
  photo_path: string | null
  visibility: string
  created_at: string
}

export interface Staff {
  id: number
  full_name: string
  role: string
  phone: string | null
  active: boolean
}

export interface Category {
  id: number
  name: string
  kind: ItemKind
  sort: number
}

export interface Supplier {
  id: number
  name: string
  phone: string | null
  note: string | null
}

export interface Item {
  id: number
  category_id: number
  name: string
  base_unit: BaseUnit
  pack_size: number
  pack_label: string
  min_stock: number | null
  track_on_hand: boolean
  qr_code: string | null
  photo_path: string | null
  active: boolean
  sort: number
  supplier_id: number | null
}

export interface Contact {
  id: number
  group_name: string | null
  name: string
  role_title: string | null
  phone_e164: string
  has_whatsapp: boolean
  sort: number
  active: boolean
}

export interface Incident {
  id: string
  apartment_id: number
  item_id: number | null
  free_text: string | null
  kind: IncidentKind
  qty: number
  status: IncidentStatus
  photo_paths: string[]
  comment: string | null
  created_by: string | null
  created_at: string
  resolved_by: string | null
  resolved_at: string | null
  resolution_note: string | null
  writeoff_move_id: number | null
  client_op_id: string | null
}

export interface SvApartment {
  id: number
  code: string
  building: string
  type: AptType
  status: string
  last_cleaned_at: string | null
}

export interface SvNorm {
  apartment_id: number
  norm_type: NormType
  item_id: number
  item_name: string
  base_unit: BaseUnit
  pack_label: string
  qty: number
}

export interface SvStaff {
  id: number
  full_name: string
}

export interface SvItem {
  id: number
  name: string
  category: string
  base_unit: BaseUnit
}

export interface SvCleaningEvent {
  id: string
  apartment_id: number
  cleaned_at: string
  status: EventStatus
  note: string | null
  staff_names: string | null
}

export interface CleaningResult {
  event_id: string
  status: EventStatus
  revision: number
  lines: Array<{
    item_id: number
    item: string
    norm_type: NormType
    qty: number
  }>
  duplicate: boolean
  shortages: Array<{
    item_id: number
    item: string
    location: string
    balance: number
  }>
}

export interface WarehouseStockRow {
  item_id: number
  name: string
  category: string
  kind: ItemKind
  base_unit: BaseUnit
  pack_size: number
  pack_label: string
  qty: number
  min_stock: number | null
  below_min: boolean
}

export interface ReportStockMoveRow {
  id: number
  item_id: number
  item_name: string
  category: string
  pack_size: number
  pack_label: string
  qty: number
  unit_cost: number | null
  source_type: string
  apartment_id: number | null
  apartment_code: string | null
  moved_at: string
}

export interface ToOrderRow {
  item_id: number
  name: string
  category: string
  base_unit: BaseUnit
  pack_size: number
  pack_label: string
  qty: number
  min_stock: number
  shortage: number
}

export interface ApartmentGapRow {
  apartment_id: number
  code: string
  item_id: number
  name: string
  norm: number
  actual: number
  gap: number
}

export interface EventRow {
  id: string
  type: string
  payload: Json
  created_at: string
  processed_at: string | null
}

export interface StockMoveRow {
  id: number
  item_id: number
  from_loc: number
  to_loc: number
  qty: number
  unit_cost: number | null
  source_type: string
  source_id: string | null
  apartment_id: number | null
  staff_id: number | null
  note: string | null
  moved_at: string
  from_location?: { name: string; type: LocType }
  to_location?: { name: string; type: LocType }
  author?: string | null
}

export interface NormRuleRow {
  id: number
  norm_type: NormType
  apt_type: AptType | null
  apartment_id: number | null
  item_id: number
  qty: number
  note: string | null
}

export interface CleaningEventStaffEntry {
  staff_id: number
  staff: { full_name: string }
}

export interface CleaningEventRow {
  id: string
  apartment_id: number
  cleaned_at: string
  status: EventStatus
  revision: number
  note: string | null
  lead_staff_id: number | null
  reverse_reason: string | null
  cleaning_event_staff: CleaningEventStaffEntry[]
}

export interface IssueMissingResult {
  doc_id: string | null
  doc_number: string | null
  issued: Array<{ item_id: number; name: string; qty: number }>
  short: Array<{ item_id: number; name: string; need: number; issued: number }>
}

export interface MoveOp {
  op: string
  label: string
  needsApartment: boolean
  needsStaff: boolean
  needsCost: boolean
}

export interface DocumentRow {
  id: string
  doc_type: DocType
  number: string
  doc_date: string
  supplier_id: number | null
  status: DocStatus
  note: string | null
  total_cost: number | null
  created_at: string
}

export interface DocumentWithSupplier extends DocumentRow {
  supplier_name: string | null
}

export interface AttachmentRow {
  id: string
  doc_id: string | null
  incident_id: string | null
  kind: string
  storage_path: string
  mime: string | null
  created_at: string
}

export interface PostDocumentResult {
  doc_id: string
  doc_number: string
  lines: number
}
