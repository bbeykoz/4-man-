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

/**
 * Kayit listesinde satir rengi.
 *
 * Iki katman var ve isleri farkli:
 *   - Zemin cok soluk kalir (%5-7). Daha koyu olursa TUR rozetinin kendi zemini
 *     satir zeminine karisiyor, rozet okunmaz oluyordu.
 *   - Sol 3px serit tam doygun renk tasir; tipi ayirt eden asil isaret bu.
 *
 * Renk tek basina anlam tasimaz: TUR sutunu ayni bilgiyi yazili veriyor.
 * Sinif adlari tam yazilmali; Tailwind string birlestirmeyi taramaz.
 */
export const RECORD_ROW_TINT: Record<string, string> = {
  stock_in:    'bg-emerald-500/[0.05] hover:bg-emerald-500/[0.10] dark:bg-emerald-400/[0.06] dark:hover:bg-emerald-400/[0.12]',
  return_in:   'bg-cyan-500/[0.06] hover:bg-cyan-500/[0.11] dark:bg-cyan-400/[0.07] dark:hover:bg-cyan-400/[0.13]',
  stock_out:   'bg-red-500/[0.05] hover:bg-red-500/[0.10] dark:bg-red-400/[0.06] dark:hover:bg-red-400/[0.12]',
  damage:      'bg-orange-500/[0.06] hover:bg-orange-500/[0.11] dark:bg-orange-400/[0.07] dark:hover:bg-orange-400/[0.13]',
  transfer:    'bg-blue-500/[0.05] hover:bg-blue-500/[0.10] dark:bg-blue-400/[0.06] dark:hover:bg-blue-400/[0.12]',
  adjustment:  'bg-yellow-500/[0.07] hover:bg-yellow-500/[0.12] dark:bg-yellow-400/[0.07] dark:hover:bg-yellow-400/[0.13]',
  stock_count: 'bg-fuchsia-500/[0.05] hover:bg-fuchsia-500/[0.10] dark:bg-fuchsia-400/[0.06] dark:hover:bg-fuchsia-400/[0.12]',
  inspection:  'bg-stone-500/[0.06] hover:bg-stone-500/[0.11] dark:bg-stone-400/[0.06] dark:hover:bg-stone-400/[0.12]',
}

/**
 * Serit renkleri. Tonlar OKLab uzayinda olculerek secildi; normal goruste en
 * yakin cift ΔE 14.6, kirmizi-yesil korlugunde 5.5-5.8 (tam ayrim 8 renkte
 * mumkun degil, bu yuzden TUR sutunu rengi ayrica yaziyor).
 * Onceki mor/lacivert cifti renk korlugunde ΔE 0.7 ile ayirt edilemiyordu.
 */
export const RECORD_ROW_ACCENT: Record<string, string> = {
  stock_in:    'shadow-[inset_3px_0_0_#10b981]',
  return_in:   'shadow-[inset_3px_0_0_#22d3ee]',
  stock_out:   'shadow-[inset_3px_0_0_#ef4444]',
  damage:      'shadow-[inset_3px_0_0_#fb923c]',
  transfer:    'shadow-[inset_3px_0_0_#2563eb]',
  adjustment:  'shadow-[inset_3px_0_0_#facc15]',
  stock_count: 'shadow-[inset_3px_0_0_#e879f9]',
  inspection:  'shadow-[inset_3px_0_0_#78716c]',
}

/**
 * Iptal edilen ya da stoktan geri alinan kayit. Satirin kendisi tamamen
 * notrlesir — zemin de serit de gri. Hareket tipini ve iptal bilgisini
 * rozetler tasir: TUR rozeti kendi renginde (yesil "Stok Girisi"), durum
 * rozeti kirmizi "Iptal". Boylece gri satirda sadece iki renk one cikar.
 */
const IPTAL_TINT = 'bg-zinc-200/70 hover:bg-zinc-300/70 dark:bg-zinc-100/[0.07] dark:hover:bg-zinc-100/[0.12]'
const IPTAL_ACCENT = 'shadow-[inset_3px_0_0_#a1a1aa]'

/** Hem iptal durumu hem ters kayit (stoktan geri alinmis) olu sayilir. */
function olu(kayit: { status?: string | null; reversed_at?: string | null }): boolean {
  return kayit.status === 'cancelled' || !!kayit.reversed_at
}

export function recordRowTint(kayit: { type?: string | null; status?: string | null; reversed_at?: string | null }): string {
  if (olu(kayit)) return IPTAL_TINT
  return RECORD_ROW_TINT[kayit.type ?? ''] ?? 'hover:bg-zinc-50 dark:hover:bg-zinc-900/40'
}

export function recordRowAccent(kayit: { type?: string | null; status?: string | null; reversed_at?: string | null }): string | undefined {
  if (olu(kayit)) return IPTAL_ACCENT
  return RECORD_ROW_ACCENT[kayit.type ?? '']
}

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
