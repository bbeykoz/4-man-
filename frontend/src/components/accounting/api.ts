'use client'

/**
 * Muhasebe modülü ortak katmanı: API yolları, biçimlendirme ve paylaşılan
 * tipler. Her panel bunu kullanır, böylece uç adresleri tek yerde durur.
 */
import { get, post, put, del } from '@/lib/api'

export const A = '/modules/accounting'

// ─── Biçimlendirme ────────────────────────────────────────────────

/** Para: 1234.5 → "1.234,50". Para birimi ayrı gösterilir. */
export function money(value: number | string | null | undefined, decimals = 2): string {
  const n = typeof value === 'string' ? parseFloat(value) : value
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  return n.toLocaleString('tr-TR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

/** Sıfırı boş gösterir; mizan gibi tablolarda sıfır gürültüsü olmasın. */
export function moneyOrDash(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? parseFloat(value) : value
  if (!n) return '—'
  return money(n)
}

export function dateTR(value?: string | null): string {
  if (!value) return '—'
  const d = new Date(value.length <= 10 ? `${value}T00:00:00` : value)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('tr-TR')
}

export function dateTimeTR(value?: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })
}

/** Backend hata gövdesinden okunabilir mesaj. */
export function apiError(e: unknown, fallback = 'İşlem başarısız.'): string {
  const err = e as { message?: string; errors?: Record<string, string[]> }
  const first = err?.errors ? Object.values(err.errors)[0]?.[0] : undefined
  return first ?? err?.message ?? fallback
}

/** Dönem anahtarı: 2026-03 → "Mart 2026". */
export function periodLabel(key: string): string {
  const [y, m] = key.split('-')
  const aylar = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık']
  return `${aylar[Number(m) - 1] ?? m} ${y}`
}

// ─── Ortak tipler ─────────────────────────────────────────────────

export interface ChartAccount {
  id: string
  code: string
  name: string
  name_local?: string | null
  display_name: string
  account_type: string
  account_type_label: string
  normal_balance: 'debit' | 'credit'
  is_control: boolean
  requires_partner: boolean
  is_active: boolean
  is_balance_sheet: boolean
}

export interface AccountingPeriod {
  id: string
  name: string
  start_date: string
  end_date: string
  status: 'open' | 'closing' | 'closed' | 'locked'
  status_label: string
  status_color: string
  accepts_posting: boolean
  entries_count?: number
}

export interface JournalLine {
  id?: string
  line_no: number
  account_id: string
  account_code?: string | null
  account_name?: string | null
  description?: string | null
  debit: string
  credit: string
  partner_id?: string | null
  tax_code_id?: string | null
  dimensions?: Record<string, unknown>
}

export interface JournalEntry {
  id: string
  journal_no: string | null
  label: string
  journal_type: string
  type_label: string
  document_date: string
  posting_date: string
  period_name?: string | null
  currency: string
  status: string
  status_label: string
  status_color: string
  description: string
  reference?: string | null
  total_debit: string
  total_credit: string
  is_balanced: boolean
  is_editable: boolean
  reversal_of_no?: string | null
  reversed_by_no?: string | null
  source_type: string
  lines?: JournalLine[]
}

export interface Partner {
  id: string
  code: string
  legal_name: string
  trade_name?: string | null
  display_name: string
  is_customer: boolean
  is_supplier: boolean
  country_code: string
  vat_number?: string | null
  registration_number?: string | null
  payment_days?: number | null
  credit_limit?: number | null
  is_active: boolean
  is_blocked: boolean
  can_transact: boolean
}

export interface AccountingDocument {
  id: string
  doc_type: string
  type_label: string
  direction: 'sale' | 'purchase'
  number: string | null
  full_number: string
  issue_date: string
  due_date?: string | null
  partner_id?: string | null
  partner_name?: string | null
  currency: string
  net_amount: string
  tax_amount: string
  gross_amount: string
  settled_amount: string
  outstanding: number
  status: string
  status_label: string
  status_color: string
  is_editable: boolean
  is_overdue: boolean
  journal_no?: string | null
  lines?: DocumentLine[]
}

export interface DocumentLine {
  id?: string
  line_no: number
  description: string
  quantity: string
  unit?: string | null
  unit_price: string
  net_amount: string
  tax_code_id?: string | null
  tax_rate: number
  tax_amount: string
  gross_amount: string
  account_id?: string | null
}

export interface TaxCode {
  id: string
  code: string
  name: string
  display_name: string
  treatment: string
  treatment_label: string
  rate: number
  direction: string
  valid_from: string
  valid_to?: string | null
  is_approved: boolean
  is_default: boolean
  is_effective_today: boolean
}

export interface BankAccount {
  id: string
  code: string
  name: string
  display_name: string
  type: 'bank' | 'cash' | 'pos'
  iban?: string | null
  currency: string
  account_code?: string | null
  cash_limit?: number | null
  approval_threshold?: number | null
  is_active: boolean
  ledger_balance?: number
}

export interface Payment {
  id: string
  number: string | null
  label: string
  direction: 'in' | 'out'
  direction_label: string
  bank_account_name?: string | null
  partner_name?: string | null
  payment_date: string
  amount: string
  currency: string
  allocated_amount: string
  unallocated: number
  status: string
  journal_no?: string | null
}

// ─── Sorgu yardımcıları ───────────────────────────────────────────

/** Boş alanları atar; tüm filtre panelleri bunu kullanır. */
export function params(obj: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([, v]) => v !== '' && v !== null && v !== undefined && v !== false)
      .map(([k, v]) => [k, String(v)]),
  )
}

export { get, post, put, del }
