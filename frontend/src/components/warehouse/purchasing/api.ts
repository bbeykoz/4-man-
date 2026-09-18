'use client'

import { useQuery } from '@tanstack/react-query'
import { get } from '@/lib/api'

export type PoStatus = 'draft' | 'sent' | 'partially_received' | 'received' | 'cancelled'

export interface Supplier {
  id: string
  name: string
  code: string
  contact_name?: string | null
  phone?: string | null
  email?: string | null
  tax_number?: string | null
  address?: string | null
  default_lead_time_days?: number | null
  notes?: string | null
  is_active: boolean
  products_count?: number
  open_orders_count?: number
}

export interface Suggestion {
  product_id: string
  name: string
  sku?: string | null
  unit: string
  supplier_id: string | null
  supplier_name: string | null
  available: number
  on_order: number
  daily_consumption: number
  lead_time_days: number
  lead_time_estimated: boolean
  safety_stock: number
  risk_score: number
  risk_level: 'critical' | 'high' | 'medium' | 'low'
  suggested_qty: number
  unit_price: number | null
  estimated_amount: number | null
  reason: string
}

export interface PoItem {
  id: string
  product_id: string
  name: string
  sku?: string | null
  unit?: string | null
  quantity: number
  unit_price: number | null
  received_qty: number
  damaged_qty: number
  remaining: number
  suggestion?: { reason?: string; suggested_qty?: number } | null
  receipt?: { original_name: string | null; mime: string | null; uploaded_at: string | null } | null
}

export interface PurchaseOrder {
  id: string
  po_number: string
  status: PoStatus
  source: 'manual' | 'suggestion'
  supplier: { id: string; name: string; code: string; address?: string | null; phone?: string | null; email?: string | null; tax_number?: string | null } | null
  warehouse: { id: string; name: string } | null
  order_date: string | null
  expected_date: string | null
  sent_at: string | null
  received_at: string | null
  cancelled_at: string | null
  is_late: boolean
  total_amount: number
  currency: string
  notes: string | null
  items_count: number
  created_at: string
  items?: PoItem[]
  receipts?: { id: string; received_at: string; received_by: string | null; note: string | null; lines: { purchase_order_item_id: string; quantity: number; damaged_quantity: number; lot_number: string | null }[] }[]
}

export const PO_STATUS: Record<PoStatus, { label: string; cls: string }> = {
  draft:              { label: 'Taslak',        cls: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300' },
  sent:               { label: 'Gönderildi',    cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  partially_received: { label: 'Kısmi Teslim',  cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  received:           { label: 'Teslim Alındı', cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  cancelled:          { label: 'İptal',         cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
}

export const inputCls = 'px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500'
export const labelCls = 'block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1'
export const MULTIPART = { headers: { 'Content-Type': 'multipart/form-data' } }

export function formatMoney(n: number | null | undefined, currency = 'TRY'): string {
  if (n == null) return '—'
  return Number(n).toLocaleString('tr-TR', { style: 'currency', currency, maximumFractionDigits: 2 })
}

export function useSuppliers(activeOnly = false) {
  return useQuery({
    queryKey: ['purchasing-suppliers', activeOnly],
    queryFn: () => get<{ data: Supplier[] }>(`/modules/purchasing/suppliers${activeOnly ? '?active_only=1' : ''}`).then(r => r.data ?? []),
    staleTime: 30_000,
  })
}

/** Satın alma değişince yenilenecek sorgular (risk ve stok da etkilenir). */
export const PURCHASING_QUERY_KEYS = [
  ['purchasing-orders'], ['purchasing-order'], ['purchasing-suggestions'], ['purchasing-suppliers'],
  ['stock-risk'], ['stock-balances'], ['stock-warehouses'],
] as const
