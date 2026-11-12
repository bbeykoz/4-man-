'use client'

import Link from 'next/link'
import { DashboardPanel } from '@/components/accounting/DashboardPanel'
import { ManagerPanel } from '@/components/accounting/ManagerPanel'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Calculator, Info, Plus, Trash2, Search, X,
  TrendingUp, CheckCircle2, Clock, Ban, UserCircle, ChevronDown,
} from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable } from '@/components/common/DataTable'
import { ConfirmModal } from '@/components/common/ConfirmModal'
import { createRecordService } from '@/services/record.service'
import { get } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { PRIORITY_OPTIONS, ROLE_LEVELS } from '@/lib/constants'
import { useAuthStore } from '@/store/auth.store'
import { createColumnHelper } from '@tanstack/react-table'

// ─── Constants ────────────────────────────────────────────────────────────────

const accountingService = createRecordService('accounting')

const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelCls = 'block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1'

const PAYMENT_METHOD_OPTIONS = [
  { value: '',              label: 'Seçiniz' },
  { value: 'cash',          label: 'Nakit' },
  { value: 'card',          label: 'Kart' },
  { value: 'bank_transfer', label: 'Banka Transferi' },
  { value: 'check',         label: 'Çek' },
  { value: 'other',         label: 'Diğer' },
]




const CURRENCY_OPTIONS = [
  { value: 'TRY', label: 'TRY (₺)' },
  { value: 'USD', label: 'USD ($)' },
  { value: 'EUR', label: 'EUR (€)' },
  { value: 'GBP', label: 'GBP (£)' },
  { value: 'CHF', label: 'CHF (Fr)' },
  { value: 'JPY', label: 'JPY (¥)' },
]

const VAT_RATES = [0, 1, 10, 20]




// ─── Accounting Create Modal ──────────────────────────────────────────────────

const ACC_TYPE_OPTIONS_MGR = [
  { value: 'income',   label: 'Gelir',    cls: 'bg-emerald-600 border-emerald-600 text-white', idle: 'border-emerald-200 text-emerald-700 hover:border-emerald-400 dark:border-emerald-800 dark:text-emerald-400', icon: '↑' },
  { value: 'expense',  label: 'Gider',    cls: 'bg-red-600 border-red-600 text-white',          idle: 'border-red-200 text-red-700 hover:border-red-400 dark:border-red-800 dark:text-red-400', icon: '↓' },
  { value: 'transfer', label: 'Transfer', cls: 'bg-blue-600 border-blue-600 text-white',        idle: 'border-blue-200 text-blue-700 hover:border-blue-400 dark:border-blue-800 dark:text-blue-400', icon: '⇄' },
  { value: 'advance',  label: 'Avans',    cls: 'bg-amber-500 border-amber-500 text-white',      idle: 'border-amber-200 text-amber-700 hover:border-amber-400 dark:border-amber-800 dark:text-amber-400', icon: '⊕' },
]

const INCOME_CATEGORIES_MGR = ['Satış Geliri', 'Hizmet Geliri', 'Faiz Geliri', 'Kira Geliri', 'Komisyon', 'Diğer Gelir']
const EXPENSE_CATEGORIES_MGR = ['Kira', 'Maaş', 'SGK / Vergi', 'Reklam / Pazarlama', 'Kargo', 'Yazılım / Abonelik', 'Ofis Giderleri', 'Seyahat', 'Danışmanlık', 'Hammadde', 'Diğer Gider']

interface AccountingCreateModalProps {
  onClose: () => void
  departments: { id: string; name: string }[]
  onSuccess: () => void
}

function AccountingCreateModal({ onClose, departments, onSuccess }: AccountingCreateModalProps) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState('expense')
  const [status, setStatus] = useState('pending')
  const [priority, setPriority] = useState('medium')
  const [category, setCategory] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('TRY')
  const [vatRate, setVatRate] = useState(0)
  const [vatIncluded, setVatIncluded] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('')
  const [exchangeRate, setExchangeRate] = useState('')
  const [transactionDate, setTransactionDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [paidAt, setPaidAt] = useState('')
  const [vendor, setVendor] = useState('')
  const [referenceNumber, setReferenceNumber] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [description, setDescription] = useState('')

  const amountNum = parseFloat(amount) || 0
  const vatCalc = vatRate > 0 && amountNum > 0
    ? vatIncluded
      ? { net: +(amountNum / (1 + vatRate / 100)).toFixed(2), vat: +(amountNum - amountNum / (1 + vatRate / 100)).toFixed(2), total: amountNum }
      : { net: amountNum, vat: +(amountNum * vatRate / 100).toFixed(2), total: +(amountNum + amountNum * vatRate / 100).toFixed(2) }
    : null
  const tlEquivalent = currency !== 'TRY' && exchangeRate && amountNum > 0 ? amountNum * parseFloat(exchangeRate) : null
  const categories = type === 'income' ? INCOME_CATEGORIES_MGR : type === 'expense' ? EXPENSE_CATEGORIES_MGR : [...INCOME_CATEGORIES_MGR, ...EXPENSE_CATEGORIES_MGR]

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
    const payload: Record<string, any> = { title, type, status, priority, currency, vat_rate: vatRate, vat_included: vatIncluded }
    if (amount) { payload.amount = amountNum; if (vatCalc) payload.vat_amount = vatCalc.vat }
    if (category) payload.category = category
    if (vendor) payload.vendor = vendor
    if (referenceNumber) payload.reference_number = referenceNumber
    if (departmentId) payload.department_id = departmentId
    if (description) payload.description = description
    if (paymentMethod) payload.payment_method = paymentMethod
    if (transactionDate) payload.transaction_date = transactionDate
    if (dueDate) payload.due_date = dueDate
    if (paidAt) payload.paid_at = paidAt
    if (currency !== 'TRY' && exchangeRate) payload.exchange_rate = parseFloat(exchangeRate)
    createMutation.mutate(payload)
  }

  const sectionMgr = 'rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30 p-4 space-y-3'

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
              {ACC_TYPE_OPTIONS_MGR.map(o => (
                <button key={o.value} type="button" onClick={() => { setType(o.value); setCategory('') }}
                  className={`flex flex-col items-center gap-1 px-3 py-3 rounded-xl border text-xs font-semibold transition-colors ${type === o.value ? o.cls : `bg-white dark:bg-zinc-900 ${o.idle}`}`}>
                  <span className="text-base">{o.icon}</span>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Durum + Öncelik */}
          <div className={sectionMgr}>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Durum & Öncelik</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Durum</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { v: 'draft', l: 'Taslak' }, { v: 'pending', l: 'Onay Bekliyor' },
                    { v: 'approved', l: 'Onaylandı' }, { v: 'completed', l: 'Ödendi' },
                  ].map(s => (
                    <button key={s.v} type="button" onClick={() => setStatus(s.v)}
                      className={`py-1.5 text-xs rounded-lg border font-medium transition-colors ${status === s.v ? 'bg-blue-600 border-blue-600 text-white' : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-blue-400'}`}>
                      {s.l}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelCls}>Öncelik</label>
                <select className={inputCls} value={priority} onChange={e => setPriority(e.target.value)}>
                  {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Başlık + Kategori */}
          <div>
            <label className={labelCls}>Başlık <span className="text-red-500">*</span></label>
            <input className={inputCls} placeholder="Kayıt başlığı" value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Kategori</label>
            <select className={inputCls} value={category} onChange={e => setCategory(e.target.value)}>
              <option value="">Seçiniz</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Tutar */}
          <div className={sectionMgr}>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Tutar</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className={labelCls}>Tutar</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-zinc-400">
                    {currency === 'TRY' ? '₺' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '£'}
                  </span>
                  <input type="number" min="0" step="0.01" className={`${inputCls} pl-7`} placeholder="0,00" value={amount} onChange={e => setAmount(e.target.value)} />
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
                {tlEquivalent != null && <p className="text-xs text-zinc-500 mt-1">TL Karşılığı: ₺{tlEquivalent.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</p>}
              </div>
            )}
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
              <div className="space-y-2">
                <div className="flex gap-2">
                  {[{ val: false, lbl: 'KDV Hariç' }, { val: true, lbl: 'KDV Dahil' }].map(({ val, lbl }) => (
                    <button key={lbl} type="button" onClick={() => setVatIncluded(val)}
                      className={`flex-1 py-1.5 text-xs rounded-lg border font-medium transition-colors ${vatIncluded === val ? 'bg-blue-600 border-blue-600 text-white' : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-blue-400'}`}>
                      {lbl}
                    </button>
                  ))}
                </div>
                {vatCalc && amountNum > 0 && (
                  <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 p-2 space-y-1 text-xs">
                    <div className="flex justify-between text-zinc-500"><span>Net tutar</span><span className="font-mono">{vatCalc.net.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {currency}</span></div>
                    <div className="flex justify-between text-zinc-500"><span>KDV (%{vatRate})</span><span className="font-mono">{vatCalc.vat.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {currency}</span></div>
                    <div className="flex justify-between font-semibold text-zinc-900 dark:text-zinc-100 border-t border-blue-200 dark:border-blue-700 pt-1"><span>Toplam</span><span className="font-mono">{vatCalc.total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {currency}</span></div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Tarihler */}
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
            <label className={labelCls}>Referans Numarası</label>
            <input className={inputCls} placeholder="FAT-2024-001" value={referenceNumber} onChange={e => setReferenceNumber(e.target.value)} />
          </div>

          {departments.length > 0 && (
            <div>
              <label className={labelCls}>Departman</label>
              <select className={inputCls} value={departmentId} onChange={e => setDepartmentId(e.target.value)}>
                <option value="">Seçiniz</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className={labelCls}>Açıklama</label>
            <textarea className={`${inputCls} resize-none`} rows={2} placeholder="İsteğe bağlı açıklama..." value={description} onChange={e => setDescription(e.target.value)} />
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

// ─── Marketing Create Modal ───────────────────────────────────────────────────



// ─── Accounting Tab Section ───────────────────────────────────────────────────

const ACC_STATUS_CHIPS_MGR = [
  { id: 'all',       label: 'Tümü' },
  { id: 'draft',     label: 'Taslak' },
  { id: 'pending',   label: 'Onay Bekliyor' },
  { id: 'approved',  label: 'Onaylandı' },
  { id: 'completed', label: 'Ödendi' },
  { id: 'cancelled', label: 'İptal' },
]

const ACC_TYPE_CHIPS_MGR = [
  { id: 'all',      label: 'Tüm Türler' },
  { id: 'income',   label: 'Gelir' },
  { id: 'expense',  label: 'Gider' },
  { id: 'transfer', label: 'Transfer' },
  { id: 'advance',  label: 'Avans' },
]

function fmtAmt(amount: number | null, currency: string) {
  if (amount == null) return '—'
  const sym: Record<string, string> = { TRY: '₺', USD: '$', EUR: '€', GBP: '£' }
  return `${sym[currency] ?? ''}${Math.abs(amount).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`
}

function accTypeBadgeMgr(type: string) {
  const map: Record<string, { label: string; cls: string }> = {
    income:   { label: 'Gelir',    cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' },
    expense:  { label: 'Gider',    cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
    transfer: { label: 'Transfer', cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
    advance:  { label: 'Avans',    cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
    invoice:  { label: 'Fatura',   cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
    payment:  { label: 'Ödeme',    cls: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
    receipt:  { label: 'Makbuz',   cls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  }
  const e = map[type] ?? { label: type, cls: 'bg-zinc-100 text-zinc-700' }
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${e.cls}`}>{e.label}</span>
}

function accStatusBadgeMgr(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    draft:      { label: 'Taslak',        cls: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400' },
    pending:    { label: 'Onay Bekliyor', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
    approved:   { label: 'Onaylandı',    cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
    in_progress:{ label: 'İşlemde',      cls: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400' },
    completed:  { label: 'Ödendi',       cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' },
    cancelled:  { label: 'İptal',        cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  }
  const e = map[status] ?? { label: status, cls: 'bg-zinc-100 text-zinc-700' }
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${e.cls}`}>{e.label}</span>
}

interface AccountingTabSectionProps {
  departments: { id: string; name: string }[]
}

function AccountingTabSection({ departments }: AccountingTabSectionProps) {
  const qc = useQueryClient()
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [statusChip, setStatusChip] = useState('all')
  const [typeChip, setTypeChip] = useState('all')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const { user, roleLevel } = useAuthStore()
  const deptFilter = roleLevel === ROLE_LEVELS.DEPARTMENT_MANAGER && user?.department_id ? user.department_id : null

  const { data, isLoading } = useQuery({
    queryKey: ['acct-mgr-accounting', page, search, statusChip, typeChip, deptFilter],
    queryFn: () => {
      const params: Record<string, any> = { page: page + 1, per_page: 15 }
      if (search) params.search = search
      if (statusChip !== 'all') params.status = statusChip
      if (typeChip !== 'all') params.type = typeChip
      if (deptFilter) params.department_id = deptFilter
      return accountingService.list(params)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => accountingService.delete(id),
    onSuccess: () => {
      toast.success('Kayıt silindi.')
      qc.invalidateQueries({ queryKey: ['acct-mgr-accounting'] })
      qc.invalidateQueries({ queryKey: ['acct-mgr-stats'] })
      setDeleteId(null)
    },
    onError: (e: any) => toast.error(e?.message ?? 'Silinemedi.'),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => accountingService.updateStatus(id, status),
    onSuccess: () => {
      toast.success('Durum güncellendi.')
      qc.invalidateQueries({ queryKey: ['acct-mgr-accounting'] })
      qc.invalidateQueries({ queryKey: ['acct-mgr-stats'] })
    },
    onError: (e: any) => toast.error(e?.message ?? 'Durum güncellenemedi.'),
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
          <div className="space-y-0.5 min-w-[150px]">
            <p className="font-medium text-zinc-900 dark:text-zinc-100 text-sm truncate max-w-[190px]">{row.title}</p>
            <div className="flex items-center gap-1.5 flex-wrap">
              {accTypeBadgeMgr(row.type ?? '')}
              {row.category && <span className="text-xs text-zinc-400">{row.category}</span>}
            </div>
          </div>
        )
      },
    }),
    col.accessor('status', {
      header: 'Durum',
      cell: info => accStatusBadgeMgr(info.getValue() ?? ''),
    }),
    col.display({
      id: 'amount_col',
      header: 'Tutar',
      cell: info => {
        const row = info.row.original
        if (row.amount == null) return <span className="text-zinc-400 text-xs">—</span>
        const isIncome  = ['income', 'invoice', 'receipt', 'receivable'].includes(row.type)
        const isExpense = ['expense', 'payment', 'payable'].includes(row.type)
        const colorCls = isIncome ? 'text-emerald-700 dark:text-emerald-400' : isExpense ? 'text-red-700 dark:text-red-400' : 'text-zinc-700 dark:text-zinc-300'
        return (
          <div className={`font-semibold text-sm ${colorCls}`}>
            {isIncome ? '+' : isExpense ? '-' : ''}{fmtAmt(Number(row.amount), row.currency ?? 'TRY')}
            {row.vat_amount > 0 && <p className="text-xs font-normal text-zinc-400">KDV: {fmtAmt(Number(row.vat_amount), row.currency ?? 'TRY')}</p>}
          </div>
        )
      },
    }),
    col.display({
      id: 'vendor_dates',
      header: 'Kaynak / Tarih',
      cell: info => {
        const row = info.row.original
        return (
          <div className="space-y-0.5 text-xs min-w-[90px]">
            {row.vendor && <p className="text-zinc-600 dark:text-zinc-300 font-medium truncate max-w-[100px]">{row.vendor}</p>}
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
        const st = row.status
        return (
          <div className="flex items-center gap-1">
            {st === 'draft' && (
              <button title="Onaya Gönder"
                onClick={() => statusMutation.mutate({ id: row.id, status: 'pending' })}
                className="p-1.5 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950/30 text-zinc-400 hover:text-amber-600 transition-colors">
                <Clock className="h-4 w-4" />
              </button>
            )}
            {st === 'pending' && (
              <button title="Onayla"
                onClick={() => statusMutation.mutate({ id: row.id, status: 'approved' })}
                className="p-1.5 rounded-lg hover:bg-green-50 dark:hover:bg-green-950/30 text-zinc-400 hover:text-green-600 transition-colors">
                <CheckCircle2 className="h-4 w-4" />
              </button>
            )}
            {st === 'approved' && (
              <button title="Ödendi Olarak İşaretle"
                onClick={() => statusMutation.mutate({ id: row.id, status: 'completed' })}
                className="p-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-zinc-400 hover:text-emerald-600 transition-colors">
                <TrendingUp className="h-4 w-4" />
              </button>
            )}
            {st !== 'completed' && st !== 'cancelled' && (
              <button title="İptal Et"
                onClick={() => statusMutation.mutate({ id: row.id, status: 'cancelled' })}
                className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 transition-colors">
                <Ban className="h-4 w-4" />
              </button>
            )}
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
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <form onSubmit={handleSearch} className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input value={searchInput} onChange={e => setSearchInput(e.target.value)}
            placeholder="Muhasebe kayıtlarında ara..."
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-zinc-400" />
        </form>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap">
          <Plus className="h-4 w-4" /> Yeni Kayıt
        </button>
      </div>

      {/* Type chips */}
      <div className="flex flex-wrap gap-2">
        {ACC_TYPE_CHIPS_MGR.map(chip => (
          <button key={chip.id} onClick={() => { setTypeChip(chip.id); setPage(0) }}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${typeChip === chip.id ? 'bg-blue-600 border-blue-600 text-white' : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-blue-400 hover:text-blue-600'}`}>
            {chip.label}
          </button>
        ))}
        <span className="border-l border-zinc-200 dark:border-zinc-700 mx-1" />
        {/* Status chips */}
        {ACC_STATUS_CHIPS_MGR.map(chip => (
          <button key={chip.id} onClick={() => { setStatusChip(chip.id); setPage(0) }}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${statusChip === chip.id ? 'bg-zinc-800 dark:bg-zinc-200 border-zinc-800 dark:border-zinc-200 text-white dark:text-zinc-900' : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-400'}`}>
            {chip.label}
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        total={data?.meta?.total ?? 0}
        pageIndex={page}
        onPaginationChange={s => setPage(s.pageIndex)}
        isLoading={isLoading}
        emptyMessage="Henüz muhasebe kaydı yok."
      />

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
        <AccountingCreateModal
          onClose={() => setShowCreate(false)}
          departments={departments}
          onSuccess={() => qc.invalidateQueries({ queryKey: ['acct-mgr-accounting'] })}
        />
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

/**
 * Müdür ekranı iki katmandan oluşuyor:
 *   1. Çift taraflı defterden gelen özet + bekleyen iş kuyruğu (güncel katman)
 *   2. Eski düz `accounting_records` listesi — yalnız taşınmamış kayıt varsa
 *
 * İkinci katman kayıt numarası linklemesini koruduğu için silinmedi; kuyruk
 * boşaldığında kendiliğinden ekrandan kalkıyor.
 */
export default function AccountingManagerPage() {
  const [eskiAcik, setEskiAcik] = useState(false)

  const { data: deptData } = useQuery({
    queryKey: ['company-departments-list'],
    queryFn: () => get<any>('/company/departments').then(r => r.data ?? []),
  })
  const departments: { id: string; name: string }[] = deptData ?? []

  // Eski kayıt var mı? Tek satır çekip meta.total'a bakmak yeterli.
  const { data: eskiSayi } = useQuery({
    queryKey: ['acct-mgr-legacy-count'],
    queryFn: () => accountingService.list({ per_page: 1 }).then(r => r.meta?.total ?? 0),
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Muhasebe Müdürü"
        description="Kasa, gelir-gider, onay kuyruğu, dönem kapanışı ve KDV takvimi"
        breadcrumbs={[{ label: 'Modüller' }, { label: 'Muhasebe Müdürü' }]}
      />

      {/* Rakamlar çift taraflı defterden geliyor. */}
      <DashboardPanel />

      {/* Müdürün karar vermesi gereken işler. */}
      <ManagerPanel />

      {(eskiSayi ?? 0) > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <button
            onClick={() => setEskiAcik(v => !v)}
            className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left"
          >
            <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              <Calculator className="h-4 w-4" /> Eski muhasebe kayıtları
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                {eskiSayi} taşınmamış
              </span>
            </h3>
            <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${eskiAcik ? 'rotate-180' : ''}`} />
          </button>

          {eskiAcik && (
            <div className="border-t border-zinc-200 p-5 dark:border-zinc-800">
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  Bu liste eski düz muhasebe kayıtlarını gösterir. Çift taraflı defter, faturalar, cari hesaplar,
                  banka ve KDV için{' '}
                  <Link href="/modules/accounting" className="font-medium underline underline-offset-2">
                    Muhasebe modülünü
                  </Link>{' '}
                  kullanın. Eski kayıtlar <code className="rounded bg-blue-100 px-1 dark:bg-blue-900/50">accounting:migrate-records</code> ile belge katmanına taşınabilir.
                </div>
              </div>

              <AccountingTabSection departments={departments} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
