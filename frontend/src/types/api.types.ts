export interface ApiResponse<T> {
  success: boolean
  data: T
  message?: string
  code?: string
}

export interface PaginatedResponse<T> {
  success: boolean
  data: T[]
  meta: PaginationMeta
  message?: string
}

export interface PaginationMeta {
  current_page: number
  per_page: number
  total: number
  last_page: number
}

export interface ApiError {
  success: false
  message: string
  errors?: Record<string, string[]>
  code?: string
}

export type RecordStatus =
  | 'draft'
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'approved'
  | 'rejected'

export type Priority = 'low' | 'medium' | 'high' | 'critical'

export interface BaseRecord {
  id: string
  record_number: string
  title: string
  description?: string
  type?: string
  status: RecordStatus
  status_label: string
  status_color: string
  priority: Priority
  priority_label: string
  priority_color: string
  company_id: string
  department_id?: string
  due_date?: string
  completed_at?: string
  created_at: string
  updated_at: string
  meta: Record<string, unknown>
  department?: import('./auth.types').Department
  created_by?: import('./auth.types').User
  comments_count?: number
  attachments_count?: number
}

export type PaymentMethod = 'cash' | 'card' | 'bank_transfer' | 'check' | 'other'
export type RecurringFrequency = 'weekly' | 'monthly' | 'yearly'

export interface AccountingRecord extends BaseRecord {
  amount: number
  currency: string
  vendor?: string
  reference_number?: string
  transaction_date?: string
  vat_rate?: number
  vat_included?: boolean
  vat_amount?: number
  payment_method?: PaymentMethod
  exchange_rate?: number
  is_recurring?: boolean
  recurring_frequency?: RecurringFrequency
  recurring_end_date?: string
}

export interface ShippingRecord extends BaseRecord {
  tracking_number?: string
  carrier?: string
  origin_address?: string
  destination_address?: string
  vehicle_plate?: string
  driver_name?: string
  estimated_delivery?: string
  weight?: number
  shipping_cost?: number
}

export interface WarehouseRecord extends BaseRecord {
  product_id?: string
  product?: WarehouseProduct
  product_name?: string
  sku?: string
  quantity?: number
  unit?: string
  budget?: number
  location?: string
  from_location?: string
  to_location?: string
  batch_number?: string
  expiry_date?: string
  transaction_date?: string
  operator_id?: string
  operator?: import('./auth.types').User
  // Kalite kontrol — null: QC öncesi eski kayıt
  qc_status?: 'pending' | 'passed' | null
  qc_has_photo?: boolean
  qc_checked_at?: string | null
  qc_checked_by_name?: string | null
  // Stok defteri
  warehouse_id?: string | null
  warehouse_name?: string | null
  to_warehouse_id?: string | null
  to_warehouse_name?: string | null
  direction?: 'increase' | 'decrease' | null
  system_quantity?: number | null
  posted_at?: string | null
  reversed_at?: string | null
}

export interface WarehouseProduct {
  id: string
  company_id: string
  name: string
  sku?: string
  barcode?: string
  unit: string
  category?: string
  description?: string
  unit_price?: number
  min_stock: number
  current_stock: number
  is_active: boolean
  meta: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface ActivityLog {
  id: number
  action: string
  description?: string
  model_type?: string
  model_id?: string
  old_values?: Record<string, unknown>
  new_values?: Record<string, unknown>
  ip_address?: string
  created_at: string
  user?: {
    id: string
    name: string
    email: string
    avatar_url: string
  }
}

export interface Notification {
  id: string
  type: 'info' | 'success' | 'warning' | 'error'
  title: string
  body?: string
  action_url?: string
  data: Record<string, unknown>
  read_at?: string
  created_at: string
}

export interface DashboardStats {
  users: { total: number; active: number; online_today?: number }
  departments?: number
  pending_tasks?: number
  activity_today: number
  companies?: {
    total: number
    active: number
    new_this_month: number
  }
  recent_activity?: ActivityLog[]
}
