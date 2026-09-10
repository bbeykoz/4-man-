'use client'

import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Calculator, TrendingUp, TrendingDown, Wallet,
  Plus, Trash2, Search, X, RefreshCw, Clock,
  CheckCircle2, Ban, UserCircle, Upload, Download,
  FileSpreadsheet, AlertCircle, ArrowUpRight, ArrowDownRight,
} from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable } from '@/components/common/DataTable'
import { ConfirmModal } from '@/components/common/ConfirmModal'
import { createRecordService } from '@/services/record.service'
import { get, api } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { PRIORITY_OPTIONS } from '@/lib/constants'
import { createColumnHelper } from '@tanstack/react-table'

// ─── Constants ────────────────────────────────────────────────────────────────

const accountingService = createRecordService('accounting')

const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelCls = 'block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1'
const sectionCls = 'rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30 p-4 space-y-3'

const TYPE_OPTIONS = [
  { value: 'income',   label: 'Gelir',    cls: 'bg-emerald-600 border-emerald-600 text-white', idle: 'border-emerald-200 text-emerald-700 hover:border-emerald-400 dark:border-emerald-800 dark:text-emerald-400', icon: '↑' },
  { value: 'expense',  label: 'Gider',    cls: 'bg-red-600 border-red-600 text-white',          idle: 'border-red-200 text-red-700 hover:border-red-400 dark:border-red-800 dark:text-red-400', icon: '↓' },
  { value: 'transfer', label: 'Transfer', cls: 'bg-blue-600 border-blue-600 text-white',        idle: 'border-blue-200 text-blue-700 hover:border-blue-400 dark:border-blue-800 dark:text-blue-400', icon: '⇄' },
  { value: 'advance',  label: 'Avans',    cls: 'bg-amber-500 border-amber-500 text-white',      idle: 'border-amber-200 text-amber-700 hover:border-amber-400 dark:border-amber-800 dark:text-amber-400', icon: '⊕' },
]

const INCOME_CATEGORIES = [
  'Satış Geliri', 'Hizmet Geliri', 'Faiz Geliri', 'Kira Geliri', 'Komisyon', 'Diğer Gelir',
]
const EXPENSE_CATEGORIES = [
  'Kira', 'Maaş', 'SGK / Vergi', 'Reklam / Pazarlama', 'Kargo', 'Yazılım / Abonelik',
  'Ofis Giderleri', 'Seyahat', 'Danışmanlık', 'Hammadde', 'İşletme Giderleri', 'Diğer Gider',
]
const ALL_CATEGORIES = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES]

const CURRENCY_OPTIONS = [
  { value: 'TRY', label: '₺ TRY' }, { value: 'USD', label: '$ USD' },
  { value: 'EUR', label: '€ EUR' }, { value: 'GBP', label: '£ GBP' },
]

const VAT_RATES = [0, 1, 10, 20]

const PAYMENT_METHOD_OPTIONS = [
  { value: '', label: 'Seçiniz' }, { value: 'cash', label: 'Nakit' },
  { value: 'card', label: 'Kart' }, { value: 'bank_transfer', label: 'Banka Transferi' },
  { value: 'check', label: 'Çek' }, { value: 'other', label: 'Diğer' },
]

const ACC_STATUS_CHIPS = [
  { id: 'all',       label: 'Tümü' },
  { id: 'draft',     label: 'Taslak' },
  { id: 'pending',   label: 'Onay Bekliyor' },
  { id: 'approved',  label: 'Onaylandı' },
  { id: 'completed', label: 'Ödendi' },
  { id: 'cancelled', label: 'İptal' },
]

const TYPE_CHIPS = [
  { id: 'all',      label: 'Tümü' },
  { id: 'income',   label: 'Gelir' },
  { id: 'expense',  label: 'Gider' },
  { id: 'transfer', label: 'Transfer' },
  { id: 'advance',  label: 'Avans' },
]

function typeBadge(type: string) {
  const map: Record<string, { label: string; cls: string }> = {
    income:     { label: 'Gelir',    cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' },
    expense:    { label: 'Gider',    cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
    transfer:   { label: 'Transfer', cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
    advance:    { label: 'Avans',    cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
    invoice:    { label: 'Fatura',   cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
    payment:    { label: 'Ödeme',    cls: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
    receipt:    { label: 'Makbuz',   cls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
    expense_old:{ label: 'Gider',    cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  }
  const entry = map[type] ?? { label: type, cls: 'bg-zinc-100 text-zinc-700' }
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${entry.cls}`}>{entry.label}</span>
}

function accStatusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    draft:      { label: 'Taslak',        cls: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400' },
    pending:    { label: 'Onay Bekliyor', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
    approved:   { label: 'Onaylandı',    cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
    in_progress:{ label: 'İşlemde',      cls: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400' },
    completed:  { label: 'Ödendi',       cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' },
    cancelled:  { label: 'İptal',        cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  }
  const entry = map[status] ?? { label: status, cls: 'bg-zinc-100 text-zinc-700' }
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${entry.cls}`}>{entry.label}</span>
}

function calcVat(amount: number, vatRate: number, vatIncluded: boolean) {
  if (vatRate <= 0 || amount <= 0) return { netAmount: amount, vatAmount: 0, totalAmount: amount }
  if (vatIncluded) {
    const net = amount / (1 + vatRate / 100)
    return { netAmount: +net.toFixed(2), vatAmount: +(amount - net).toFixed(2), totalAmount: amount }
  }
  const vat = amount * vatRate / 100
  return { netAmount: amount, vatAmount: +vat.toFixed(2), totalAmount: +(amount + vat).toFixed(2) }
}

function fmtCurrency(n: number, currency = 'TRY') {
  const sym: Record<string, string> = { TRY: '₺', USD: '$', EUR: '€', GBP: '£' }
  return `${sym[currency] ?? ''}${Math.abs(n).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`
}

// ─── Financial Dashboard Cards ────────────────────────────────────────────────

function FinanceDashboard({ stats, loading }: { stats: any; loading?: boolean }) {
  const income   = stats?.total_income  ?? 0
  const expense  = stats?.total_expense ?? 0
  const net      = stats?.net_balance   ?? (income - expense)
  const vat      = stats?.total_vat     ?? 0
  const mIncome  = stats?.month_income  ?? 0
  const mExpense = stats?.month_expense ?? 0
  const pending  = stats?.pending       ?? 0
  const isProfit = net >= 0

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Gelir */}
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/10 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Toplam Gelir</span>
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400">{fmtCurrency(income)}</p>
          <p className="text-xs text-emerald-600/70 dark:text-emerald-500 mt-1">Bu ay: {fmtCurrency(mIncome)}</p>
        </div>

        {/* Gider */}
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-red-700 dark:text-red-400">Toplam Gider</span>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </div>
          <p className="text-xl font-bold text-red-700 dark:text-red-400">{fmtCurrency(expense)}</p>
          <p className="text-xs text-red-600/70 dark:text-red-500 mt-1">Bu ay: {fmtCurrency(mExpense)}</p>
        </div>

        {/* Net Bakiye */}
        <div className={`rounded-xl border p-4 ${isProfit ? 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/10' : 'border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/10'}`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-medium ${isProfit ? 'text-blue-700 dark:text-blue-400' : 'text-orange-700 dark:text-orange-400'}`}>Net Bakiye</span>
            <Wallet className={`h-4 w-4 ${isProfit ? 'text-blue-600' : 'text-orange-600'}`} />
          </div>
          <p className={`text-xl font-bold ${isProfit ? 'text-blue-700 dark:text-blue-400' : 'text-orange-700 dark:text-orange-400'}`}>
            {isProfit ? '+' : '-'}{fmtCurrency(Math.abs(net))}
          </p>
          <p className={`text-xs mt-1 ${isProfit ? 'text-blue-600/70 dark:text-blue-500' : 'text-orange-600/70 dark:text-orange-500'}`}>
            {isProfit ? 'Kar durumunda' : 'Zarar durumunda'}
          </p>
        </div>

        {/* Onay Bekleyen + KDV */}
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-amber-700 dark:text-amber-400">Onay Bekleyen</span>
            <Clock className="h-4 w-4 text-amber-600" />
          </div>
          <p className="text-xl font-bold text-amber-700 dark:text-amber-400">{pending}</p>
          <p className="text-xs text-amber-600/70 dark:text-amber-500 mt-1">KDV: {fmtCurrency(vat)}</p>
        </div>
      </div>
    </div>
  )
}

// ─── Import Modal ─────────────────────────────────────────────────────────────

interface ImportResult { imported: number; errors: string[] }

function ImportModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [dragging, setDragging] = useState(false)

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Dosya seçiniz.')
      const form = new FormData()
      form.append('file', file)
      return api.post<any>('/modules/accounting/import', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    },
    onSuccess: (res: any) => {
      setResult({ imported: res.imported, errors: res.errors ?? [] })
      qc.invalidateQueries({ queryKey: ['accounting-user'] })
      qc.invalidateQueries({ queryKey: ['accounting-stats'] })
      if (res.imported > 0) toast.success(`${res.imported} kayıt aktarıldı.`)
    },
    onError: (e: any) => toast.error(e?.message ?? 'İçe aktarma başarısız.'),
  })

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f && /\.(xlsx|xls|csv)$/i.test(f.name)) setFile(f)
    else toast.error('xlsx, xls veya csv yükleyiniz.')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-green-600" />
            <h2 className="text-base font-semibold">Excel İçe Aktar</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          {result ? (
            <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800">
              <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-green-800 dark:text-green-300">{result.imported} kayıt aktarıldı</p>
                {result.errors.length > 0 && <p className="text-xs text-green-600">{result.errors.length} satır atlandı</p>}
              </div>
            </div>
          ) : (
            <>
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors ${dragging ? 'border-blue-500 bg-blue-50' : file ? 'border-green-500 bg-green-50 dark:bg-green-950/20' : 'border-zinc-300 dark:border-zinc-700 hover:border-blue-400'}`}
              >
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f) }} />
                {file ? (
                  <div className="flex flex-col items-center gap-2">
                    <FileSpreadsheet className="h-8 w-8 text-green-600" />
                    <p className="text-sm font-medium text-green-700 dark:text-green-400">{file.name}</p>
                    <button onClick={e => { e.stopPropagation(); setFile(null) }} className="text-xs text-red-500 hover:underline">Kaldır</button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="h-8 w-8 text-zinc-400" />
                    <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Dosyayı sürükle veya tıkla</p>
                    <p className="text-xs text-zinc-400">xlsx, xls, csv — maks. 10 MB</p>
                  </div>
                )}
              </div>
              <button
                onClick={() => window.open(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost/api/v1'}/modules/accounting/template/download`, '_blank')}
                className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                <Download className="h-3.5 w-3.5" /> Excel şablonunu indir
              </button>
            </>
          )}
        </div>
        <div className="flex justify-end gap-3 px-5 pb-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
            {result ? 'Kapat' : 'İptal'}
          </button>
          {!result && (
            <button onClick={() => importMutation.mutate()} disabled={!file || importMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-green-600 hover:bg-green-700 text-white disabled:opacity-60">
              <Upload className="h-4 w-4" />
              {importMutation.isPending ? 'Aktarılıyor...' : 'İçe Aktar'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Create Modal ─────────────────────────────────────────────────────────────

function CreateModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState('expense')
  const [status, setStatus] = useState('draft')
  const [priority, setPriority] = useState('medium')
  const [category, setCategory] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('TRY')
  const [exchangeRate, setExchangeRate] = useState('')
  const [vatRate, setVatRate] = useState(0)
  const [vatIncluded, setVatIncluded] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('')
  const [vendor, setVendor] = useState('')
  const [referenceNumber, setReferenceNumber] = useState('')
  const [transactionDate, setTransactionDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [paidAt, setPaidAt] = useState('')
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurringFrequency, setRecurringFrequency] = useState('')
  const [recurringEndDate, setRecurringEndDate] = useState('')
  const [description, setDescription] = useState('')

  const amountNum = parseFloat(amount) || 0
  const { netAmount, vatAmount, totalAmount } = calcVat(amountNum, vatRate, vatIncluded)
  const tlEquivalent = currency !== 'TRY' && exchangeRate ? amountNum * parseFloat(exchangeRate) : null

  const categories = type === 'income' ? INCOME_CATEGORIES : type === 'expense' ? EXPENSE_CATEGORIES : ALL_CATEGORIES

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, any>) => accountingService.create(payload),
    onSuccess: () => {
      toast.success('Muhasebe kaydı oluşturuldu.')
      onSuccess()
      onClose()
    },
    onError: (e: any) => toast.error(e?.message ?? 'Kayıt oluşturulamadı.'),
  })

  const handleSubmit = () => {
    if (!title.trim()) { toast.error('Başlık zorunludur.'); return }
    if (!amount || amountNum <= 0) { toast.error('Tutar giriniz.'); return }
    const payload: Record<string, any> = {
      title, type, status, priority, currency,
      amount: amountNum, vat_rate: vatRate, vat_included: vatIncluded,
    }
    if (vatRate > 0) payload.vat_amount = vatAmount
    if (category) payload.category = category
    if (vendor) payload.vendor = vendor
    if (referenceNumber) payload.reference_number = referenceNumber
    if (paymentMethod) payload.payment_method = paymentMethod
    if (transactionDate) payload.transaction_date = transactionDate
    if (dueDate) payload.due_date = dueDate
    if (paidAt) payload.paid_at = paidAt
    if (currency !== 'TRY' && exchangeRate) payload.exchange_rate = parseFloat(exchangeRate)
    if (isRecurring) {
      payload.is_recurring = true
      if (recurringFrequency) payload.recurring_frequency = recurringFrequency
      if (recurringEndDate) payload.recurring_end_date = recurringEndDate
    }
    if (description) payload.description = description
    createMutation.mutate(payload)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-xl max-h-[94vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 bg-white dark:bg-zinc-900 z-10">
          <div className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-blue-600" />
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Yeni Muhasebe Kaydı</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-4">

          {/* İşlem Türü */}
          <div>
            <label className={labelCls}>İşlem Türü <span className="text-red-500">*</span></label>
            <div className="grid grid-cols-4 gap-2">
              {TYPE_OPTIONS.map(o => (
                <button key={o.value} type="button" onClick={() => { setType(o.value); setCategory('') }}
                  className={`flex flex-col items-center gap-1 px-3 py-3 rounded-xl border text-xs font-semibold transition-colors ${type === o.value ? o.cls : `bg-white dark:bg-zinc-900 ${o.idle}`}`}>
                  <span className="text-base">{o.icon}</span>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Durum + Öncelik */}
          <div className={sectionCls}>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Durum & Öncelik</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Durum</label>
                <div className="flex gap-2">
                  {[{ v: 'draft', l: 'Taslak' }, { v: 'pending', l: 'Onay Bekliyor' }].map(s => (
                    <button key={s.v} type="button" onClick={() => setStatus(s.v)}
                      className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${status === s.v ? 'bg-blue-600 border-blue-600 text-white' : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-blue-400'}`}>
                      {s.l}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelCls}>Öncelik</label>
                <div className="flex gap-1.5">
                  {PRIORITY_OPTIONS.map(o => (
                    <button key={o.value} type="button" onClick={() => setPriority(o.value)}
                      className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors ${priority === o.value ? 'bg-blue-600 border-blue-600 text-white' : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-blue-400'}`}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Başlık */}
          <div>
            <label className={labelCls}>Başlık <span className="text-red-500">*</span></label>
            <input className={inputCls} placeholder="Kayıt başlığı" value={title} onChange={e => setTitle(e.target.value)} />
          </div>

          {/* Kategori */}
          <div>
            <label className={labelCls}>Kategori</label>
            <select className={inputCls} value={category} onChange={e => setCategory(e.target.value)}>
              <option value="">Seçiniz</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Tutar + Para birimi */}
          <div className={sectionCls}>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Tutar</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className={labelCls}>Tutar <span className="text-red-500">*</span></label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-zinc-400">
                    {currency === 'TRY' ? '₺' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '£'}
                  </span>
                  <input type="number" min="0" step="0.01" className={`${inputCls} pl-7`}
                    placeholder="0,00" value={amount} onChange={e => setAmount(e.target.value)} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Para Birimi</label>
                <select className={inputCls} value={currency} onChange={e => setCurrency(e.target.value)}>
                  {CURRENCY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>

            {currency !== 'TRY' && (
              <div>
                <label className={labelCls}>Kur (1 {currency} = ? ₺)</label>
                <input type="number" min="0" step="0.0001" className={inputCls} placeholder="Örn: 32.50" value={exchangeRate} onChange={e => setExchangeRate(e.target.value)} />
                {tlEquivalent != null && tlEquivalent > 0 && (
                  <p className="text-xs text-zinc-500 mt-1">TL Karşılığı: ₺{tlEquivalent.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</p>
                )}
              </div>
            )}

            {/* KDV */}
            <div>
              <label className={labelCls}>KDV Oranı</label>
              <div className="flex gap-1.5">
                {VAT_RATES.map(rate => (
                  <button key={rate} type="button" onClick={() => setVatRate(rate)}
                    className={`flex-1 py-1.5 text-xs rounded-lg border font-medium transition-colors ${vatRate === rate ? 'bg-blue-600 border-blue-600 text-white' : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-blue-400'}`}>
                    %{rate}
                  </button>
                ))}
              </div>
            </div>
            {vatRate > 0 && (
              <div>
                <div className="flex gap-2">
                  {[{ val: false, lbl: 'KDV Hariç' }, { val: true, lbl: 'KDV Dahil' }].map(({ val, lbl }) => (
                    <button key={lbl} type="button" onClick={() => setVatIncluded(val)}
                      className={`flex-1 py-1.5 text-xs rounded-lg border font-medium transition-colors ${vatIncluded === val ? 'bg-blue-600 border-blue-600 text-white' : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-blue-400'}`}>
                      {lbl}
                    </button>
                  ))}
                </div>
                {amountNum > 0 && (
                  <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 p-2.5 space-y-1 text-xs mt-2">
                    <div className="flex justify-between text-zinc-500"><span>Net</span><span className="font-mono">{netAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {currency}</span></div>
                    <div className="flex justify-between text-zinc-500"><span>KDV (%{vatRate})</span><span className="font-mono">{vatAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {currency}</span></div>
                    <div className="flex justify-between font-semibold text-zinc-900 dark:text-zinc-100 border-t border-blue-200 dark:border-blue-700 pt-1"><span>Toplam</span><span className="font-mono">{totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {currency}</span></div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Tarihler */}
          <div className={sectionCls}>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Tarihler</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>İşlem Tarihi</label>
                <input type="date" className={inputCls} value={transactionDate} onChange={e => setTransactionDate(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Vade Tarihi</label>
                <input type="date" className={inputCls} value={dueDate} onChange={e => setDueDate(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Ödeme Tarihi</label>
                <input type="date" className={inputCls} value={paidAt} onChange={e => setPaidAt(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Ödeme & Kaynak */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Ödeme Yöntemi</label>
              <select className={inputCls} value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                {PAYMENT_METHOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Tedarikçi / Müşteri</label>
              <input className={inputCls} placeholder="İsteğe bağlı" value={vendor} onChange={e => setVendor(e.target.value)} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Referans No</label>
            <input className={inputCls} placeholder="FAT-2024-001" value={referenceNumber} onChange={e => setReferenceNumber(e.target.value)} />
          </div>

          {/* Tekrarlayan */}
          <div className={sectionCls}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-zinc-500 flex items-center gap-1.5 uppercase tracking-wider">
                <RefreshCw className="h-3.5 w-3.5" /> Tekrarlayan İşlem
              </p>
              <button type="button" onClick={() => setIsRecurring(p => !p)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${isRecurring ? 'bg-blue-600' : 'bg-zinc-300 dark:bg-zinc-600'}`}>
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${isRecurring ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
            </div>
            {isRecurring && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Tekrar Sıklığı</label>
                  <select className={inputCls} value={recurringFrequency} onChange={e => setRecurringFrequency(e.target.value)}>
                    <option value="">Seçiniz</option>
                    <option value="weekly">Haftalık</option>
                    <option value="monthly">Aylık</option>
                    <option value="yearly">Yıllık</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Bitiş Tarihi</label>
                  <input type="date" className={inputCls} value={recurringEndDate} onChange={e => setRecurringEndDate(e.target.value)} />
                </div>
              </div>
            )}
          </div>

          <div>
            <label className={labelCls}>Açıklama</label>
            <textarea className={`${inputCls} resize-none`} rows={2} placeholder="İsteğe bağlı notlar..." value={description} onChange={e => setDescription(e.target.value)} />
          </div>

        </div>
        <div className="flex justify-end gap-3 px-5 pb-5 sticky bottom-0 bg-white dark:bg-zinc-900 border-t border-zinc-100 dark:border-zinc-800 pt-3">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">İptal</button>
          <button onClick={handleSubmit} disabled={createMutation.isPending}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-60">
            {createMutation.isPending ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AccountingPage() {
  const qc = useQueryClient()
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [statusChip, setStatusChip] = useState('all')
  const [typeChip, setTypeChip] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['accounting-stats'],
    queryFn: () => get<any>('/dashboard/module/accounting').then(r => r.data),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['accounting-user', page, search, statusChip, typeChip],
    queryFn: () => {
      const params: Record<string, any> = { page: page + 1, per_page: 15 }
      if (search) params.search = search
      if (statusChip !== 'all') params.status = statusChip
      if (typeChip !== 'all') params.type = typeChip
      return accountingService.list(params)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => accountingService.delete(id),
    onSuccess: () => {
      toast.success('Kayıt silindi.')
      qc.invalidateQueries({ queryKey: ['accounting-user'] })
      qc.invalidateQueries({ queryKey: ['accounting-stats'] })
      setDeleteId(null)
    },
    onError: (e: any) => toast.error(e?.message ?? 'Silinemedi.'),
  })

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearch(searchInput)
    setPage(0)
  }

  const col = createColumnHelper<any>()
  const columns = [
    col.accessor('record_number', {
      header: 'Kayıt No',
      cell: info => <span className="text-xs font-mono text-zinc-500">{info.getValue()}</span>,
    }),
    col.display({
      id: 'type_title',
      header: 'İşlem',
      cell: info => {
        const row = info.row.original
        return (
          <div className="space-y-0.5 min-w-[140px]">
            <p className="font-medium text-zinc-900 dark:text-zinc-100 text-sm truncate max-w-[180px]">{row.title}</p>
            <div className="flex items-center gap-1.5 flex-wrap">
              {typeBadge(row.type ?? '')}
              {row.category && <span className="text-xs text-zinc-400">{row.category}</span>}
            </div>
          </div>
        )
      },
    }),
    col.accessor('status', {
      header: 'Durum',
      cell: info => accStatusBadge(info.getValue() ?? ''),
    }),
    col.display({
      id: 'amount_col',
      header: 'Tutar',
      cell: info => {
        const row = info.row.original
        if (row.amount == null) return <span className="text-zinc-400 text-xs">—</span>
        const isIncome = ['income', 'invoice', 'receipt', 'receivable'].includes(row.type)
        const isExpense = ['expense', 'payment', 'payable'].includes(row.type)
        const colorCls = isIncome ? 'text-emerald-700 dark:text-emerald-400' : isExpense ? 'text-red-700 dark:text-red-400' : 'text-zinc-700 dark:text-zinc-300'
        return (
          <div className={`font-semibold text-sm ${colorCls}`}>
            <span>{isIncome ? '+' : isExpense ? '-' : ''}</span>
            {fmtCurrency(Number(row.amount), row.currency)}
            {row.vat_amount > 0 && (
              <p className="text-xs font-normal text-zinc-400">KDV: {fmtCurrency(Number(row.vat_amount), row.currency)}</p>
            )}
          </div>
        )
      },
    }),
    col.display({
      id: 'vendor_date',
      header: 'Tedarikçi / Tarih',
      cell: info => {
        const row = info.row.original
        return (
          <div className="space-y-0.5 text-xs">
            {row.vendor && <p className="text-zinc-700 dark:text-zinc-300">{row.vendor}</p>}
            {row.transaction_date && <p className="text-zinc-500">{formatDate(row.transaction_date)}</p>}
            {row.due_date && !row.paid_at && <p className="text-amber-600">Vade: {formatDate(row.due_date)}</p>}
            {row.paid_at && <p className="text-emerald-600">Ödendi: {formatDate(row.paid_at)}</p>}
          </div>
        )
      },
    }),
    col.display({
      id: 'creator',
      header: 'Oluşturan',
      cell: info => (
        <div className="flex items-center gap-1.5">
          <UserCircle className="h-4 w-4 text-zinc-400 shrink-0" />
          <span className="text-sm text-zinc-600 dark:text-zinc-400">{info.row.original.created_by?.name ?? '—'}</span>
        </div>
      ),
    }),
    col.display({
      id: 'actions',
      header: '',
      cell: info => {
        const row = info.row.original
        return (
          <div className="flex items-center gap-1">
            <button title="Sil" onClick={() => setDeleteId(row.id)}
              className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/50 text-zinc-400 hover:text-red-600 transition-colors">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )
      },
    }),
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Muhasebe"
        description="Gelir ve gider takibi"
        breadcrumbs={[{ label: 'Modüller' }, { label: 'Muhasebe' }]}
      />

      {/* Financial Dashboard */}
      <FinanceDashboard stats={statsData} loading={statsLoading} />

      {/* Records */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
        <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <form onSubmit={handleSearch} className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <input value={searchInput} onChange={e => setSearchInput(e.target.value)}
                placeholder="Kayıtlarda ara..."
                className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-zinc-400" />
            </form>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowImport(true)}
                className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors">
                <FileSpreadsheet className="h-4 w-4" /> Excel
              </button>
              <button onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
                <Plus className="h-4 w-4" /> Yeni Kayıt
              </button>
            </div>
          </div>

          {/* Type chips */}
          <div className="flex flex-wrap gap-2">
            {TYPE_CHIPS.map(chip => (
              <button key={chip.id} onClick={() => { setTypeChip(chip.id); setPage(0) }}
                className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${typeChip === chip.id ? 'bg-blue-600 border-blue-600 text-white' : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-blue-400 hover:text-blue-600'}`}>
                {chip.label}
              </button>
            ))}
            <span className="border-l border-zinc-200 dark:border-zinc-700 mx-1" />
            {/* Status chips */}
            {ACC_STATUS_CHIPS.map(chip => (
              <button key={chip.id} onClick={() => { setStatusChip(chip.id); setPage(0) }}
                className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${statusChip === chip.id ? 'bg-zinc-800 dark:bg-zinc-200 border-zinc-800 dark:border-zinc-200 text-white dark:text-zinc-900' : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-400'}`}>
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4">
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            total={data?.meta?.total ?? 0}
            pageIndex={page}
            onPaginationChange={s => setPage(s.pageIndex)}
            isLoading={isLoading}
            emptyMessage="Henüz muhasebe kaydı yok."
          />
        </div>
      </div>

      <ConfirmModal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        title="Kaydı sil?"
        description="Bu kayıt kalıcı olarak silinecek."
        confirmLabel="Evet, Sil"
        loading={deleteMutation.isPending}
      />

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['accounting-user'] })
            qc.invalidateQueries({ queryKey: ['accounting-stats'] })
          }}
        />
      )}
      {showImport && <ImportModal onClose={() => setShowImport(false)} />}
    </div>
  )
}
