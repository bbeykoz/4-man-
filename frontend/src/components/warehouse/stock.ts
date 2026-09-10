'use client'

import { useQuery } from '@tanstack/react-query'
import { get } from '@/lib/api'

// ─── Tipler ──────────────────────────────────────────────────────────────────

export interface Warehouse {
  id: string
  name: string
  code: string
  city?: string | null
  address?: string | null
  capacity?: number | null
  is_default: boolean
  is_active: boolean
  available: number
  quarantine: number
  damaged: number
  product_count: number
  fill_rate: number | null
}

export interface StockBalanceRow {
  id: string
  name: string
  sku?: string | null
  barcode?: string | null
  unit?: string | null
  min_stock: number
  unit_price?: number | null
  available: number
  quarantine: number
  damaged: number
  reserved: number
  warehouses: { warehouse_id: string; warehouse_name: string; available: number; quarantine: number; damaged: number }[]
}

export interface LotBalance {
  lot_number: string | null
  expiry_date: string | null
  qty: number
  bucket: Bucket
  warehouse_id: string
  warehouse_name: string
}

export interface StockMovementRow {
  id: string
  movement_type: string
  bucket: Bucket
  quantity: number
  lot_number: string | null
  expiry_date: string | null
  occurred_at: string
  warehouse_name: string | null
  record_number: string | null
  created_by: string | null
  note: string | null
}

export type Bucket = 'available' | 'quarantine' | 'damaged' | 'reserved'

/** /company/departments satırı; system_active=false → süper admin pasife aldı. */
export interface DepartmentOption {
  id: string
  name: string
  status?: 'active' | 'inactive'
  system_active?: boolean
}

/** Şirket veya süper admin tarafından pasife alınan departman seçilemez. */
export function isDepartmentPassive(d: DepartmentOption): boolean {
  return d.status === 'inactive' || d.system_active === false
}

// ─── Etiketler ───────────────────────────────────────────────────────────────

/** Depo kaydı hareket tipleri (form + liste). */
export const RECORD_TYPES = [
  { value: 'stock_in',    label: 'Stok Girişi' },
  { value: 'stock_out',   label: 'Stok Çıkışı' },
  { value: 'transfer',    label: 'Transfer' },
  { value: 'adjustment',  label: 'Düzeltme' },
  { value: 'stock_count', label: 'Stok Sayımı' },
  { value: 'damage',      label: 'Hasar' },
  { value: 'return_in',   label: 'İade Girişi' },
  { value: 'inspection',  label: 'Denetim' },
]

export const BUCKET_LABELS: Record<Bucket, string> = {
  available:  'Kullanılabilir',
  quarantine: 'Karantina',
  damaged:    'Hasarlı',
  reserved:   'Rezerve',
}

export const MOVEMENT_LABELS: Record<string, string> = {
  opening:          'Açılış',
  stock_in:         'Giriş',
  stock_out:        'Çıkış',
  transfer_in:      'Transfer Girişi',
  transfer_out:     'Transfer Çıkışı',
  adjustment:       'Düzeltme',
  count_adjustment: 'Sayım Farkı',
  damage:           'Hasar',
  return_in:        'İade Girişi',
  qc_release:       'QC Onayı',
  reversal:         'İptal (Ters Kayıt)',
}

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

export function formatQty(n: number | null | undefined): string {
  if (n == null) return '—'
  return Number(n).toLocaleString('tr-TR', { maximumFractionDigits: 3 })
}

/** Doğrulama hatasında genel mesaj yerine ilk alan hatasını gösterir. */
export function apiErrorMessage(e: unknown, fallback: string): string {
  const err = e as { message?: string; errors?: Record<string, string[]> } | undefined
  const first = err?.errors ? Object.values(err.errors)[0]?.[0] : undefined
  return first ?? err?.message ?? fallback
}

export function useWarehouses() {
  return useQuery({
    queryKey: ['stock-warehouses'],
    queryFn: () => get<{ success: boolean; data: Warehouse[] }>('/modules/stock/warehouses').then(r => r.data ?? []),
    staleTime: 30_000,
  })
}
