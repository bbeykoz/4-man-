'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Calculator, Megaphone, Plus, Trash2, Search, X,
  TrendingUp, AlertCircle, CheckCircle2, Clock, Ban, UserCircle,
  Target, MousePointerClick, Eye, Share2, Mail, Globe, Users, Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/common/PageHeader'
import { StatsCard } from '@/components/common/StatsCard'
import { DataTable } from '@/components/common/DataTable'
import { ConfirmModal } from '@/components/common/ConfirmModal'
import { StatusBadge } from '@/components/common/StatusBadge'
import { createRecordService } from '@/services/record.service'
import { get } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { PRIORITY_OPTIONS, ROLE_LEVELS } from '@/lib/constants'
import { useAuthStore } from '@/store/auth.store'
import { createColumnHelper } from '@tanstack/react-table'

// ─── Constants ────────────────────────────────────────────────────────────────

const accountingService = createRecordService('accounting')
const marketingService = createRecordService('marketing')

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

const MARKETING_TYPE_OPTIONS = [
  { value: 'campaign', label: 'Kampanya',    icon: Zap },
  { value: 'lead',     label: 'Lead',        icon: Users },
  { value: 'content',  label: 'İçerik',      icon: Globe },
  { value: 'event',    label: 'Etkinlik',    icon: Share2 },
  { value: 'email',    label: 'E-posta',     icon: Mail },
  { value: 'other',    label: 'Diğer',       icon: Megaphone },
]

const CHANNEL_OPTIONS = [
  { value: 'instagram',  label: 'Instagram' },
  { value: 'facebook',   label: 'Facebook' },
  { value: 'tiktok',     label: 'TikTok' },
  { value: 'twitter',    label: 'X (Twitter)' },
  { value: 'youtube',    label: 'YouTube' },
  { value: 'google_ads', label: 'Google Ads' },
  { value: 'email',      label: 'E-posta' },
  { value: 'sms',        label: 'SMS' },
  { value: 'influencer', label: 'Influencer' },
  { value: 'offline',    label: 'Offline' },
  { value: 'seo',        label: 'SEO' },
  { value: 'other',      label: 'Diğer' },
]

const GOAL_TYPE_OPTIONS = [
  { value: 'leads',      label: 'Lead (Potansiyel Müşteri)' },
  { value: 'visitors',   label: 'Ziyaretçi' },
  { value: 'sales',      label: 'Satış' },
  { value: 'engagement', label: 'Etkileşim' },
  { value: 'awareness',  label: 'Marka Bilinirliği' },
  { value: 'downloads',  label: 'İndirme' },
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

const TABS = [
  { id: 'muhasebe', label: 'Muhasebe', icon: Calculator },
  { id: 'marketing', label: 'Marketing', icon: Megaphone },
]

function marketingTypeBadge(type: string) {
  const map: Record<string, { label: string; cls: string }> = {
    campaign: { label: 'Kampanya',  cls: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' },
    lead:     { label: 'Lead',      cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
    content:  { label: 'İçerik',    cls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
    event:    { label: 'Etkinlik',  cls: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
    email:    { label: 'E-posta',   cls: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400' },
  }
  const entry = map[type] ?? { label: 'Diğer', cls: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400' }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${entry.cls}`}>
      {entry.label}
    </span>
  )
}

function channelBadge(channel: string) {
  const map: Record<string, string> = {
    instagram: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
    facebook:  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    tiktok:    'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
    twitter:   'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
    youtube:   'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    google_ads:'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    email:     'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
    sms:       'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    influencer:'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    offline:   'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    seo:       'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  }
  const label = CHANNEL_OPTIONS.find(c => c.value === channel)?.label ?? channel
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${map[channel] ?? 'bg-zinc-100 text-zinc-600'}`}>
      {label}
    </span>
  )
}

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

interface MarketingCreateModalProps {
  onClose: () => void
  departments: { id: string; name: string }[]
  onSuccess: () => void
}

function MarketingCreateModal({ onClose, departments, onSuccess }: MarketingCreateModalProps) {
  const [title, setTitle]               = useState('')
  const [type, setType]                 = useState('campaign')
  const [status, setStatus]             = useState('draft')
  const [priority, setPriority]         = useState('medium')
  const [channel, setChannel]           = useState('')
  const [budget, setBudget]             = useState('')
  const [spentAmount, setSpentAmount]   = useState('')
  const [startDate, setStartDate]       = useState('')
  const [endDate, setEndDate]           = useState('')
  const [targetAudience, setTargetAudience] = useState('')
  const [goalType, setGoalType]         = useState('')
  const [goalValue, setGoalValue]       = useState('')
  const [adUrl, setAdUrl]               = useState('')
  const [impressions, setImpressions]   = useState('')
  const [clicks, setClicks]             = useState('')
  const [conversions, setConversions]   = useState('')
  const [assignedTo, setAssignedTo]     = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [description, setDescription]   = useState('')

  const { data: usersData } = useQuery({
    queryKey: ['company-users-list'],
    queryFn: () => get<any>('/company/users?per_page=100').then(r => r.data ?? []),
  })
  const users: { id: string; name: string }[] = usersData ?? []

  const budgetNum  = parseFloat(budget) || 0
  const spentNum   = parseFloat(spentAmount) || 0
  const remaining  = Math.max(0, budgetNum - spentNum)
  const ctr        = impressions && clicks ? ((parseInt(clicks) / parseInt(impressions)) * 100).toFixed(1) : null
  const convRate   = clicks && conversions ? ((parseInt(conversions) / parseInt(clicks)) * 100).toFixed(1) : null

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, any>) => marketingService.create(payload),
    onSuccess: () => {
      toast.success('Kampanya oluşturuldu.')
      onSuccess()
      onClose()
    },
    onError: (e: any) => toast.error(e?.message ?? 'Kayıt oluşturulamadı.'),
  })

  const handleSubmit = () => {
    if (!title.trim()) { toast.error('Başlık zorunludur.'); return }
    const payload: Record<string, any> = { title, status, priority, type }
    if (channel) payload.channel = channel
    if (budget) payload.budget = budgetNum
    if (spentAmount) payload.spent_amount = spentNum
    if (startDate) payload.start_date = startDate
    if (endDate) payload.end_date = endDate
    if (targetAudience) payload.target_audience = targetAudience
    if (goalType) payload.goal_type = goalType
    if (goalValue) payload.goal_value = parseInt(goalValue)
    if (adUrl) payload.ad_url = adUrl
    if (impressions) payload.impressions = parseInt(impressions)
    if (clicks) payload.clicks = parseInt(clicks)
    if (conversions) payload.conversions = parseInt(conversions)
    if (assignedTo) payload.assigned_to = assignedTo
    if (departmentId) payload.department_id = departmentId
    if (description) payload.description = description
    createMutation.mutate(payload)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-purple-600" />
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Yeni Kampanya / Marketing Kaydı</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-5">

          {/* Kampanya tipi */}
          <div>
            <label className={labelCls}>Kampanya Tipi</label>
            <div className="grid grid-cols-3 gap-2">
              {MARKETING_TYPE_OPTIONS.map(o => {
                const Icon = o.icon
                return (
                  <button key={o.value} type="button" onClick={() => setType(o.value)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-colors ${
                      type === o.value
                        ? 'bg-purple-600 border-purple-600 text-white'
                        : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-purple-400'
                    }`}>
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    {o.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className={labelCls}>Kampanya Adı <span className="text-red-500">*</span></label>
            <input className={inputCls} placeholder="Kampanya adı" value={title} onChange={e => setTitle(e.target.value)} />
          </div>

          {/* Durum + Öncelik */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Durum</label>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { v: 'draft',       l: 'Taslak' },
                  { v: 'in_progress', l: 'Aktif' },
                  { v: 'pending',     l: 'Bekliyor' },
                  { v: 'completed',   l: 'Tamamlandı' },
                ].map(s => (
                  <button key={s.v} type="button" onClick={() => setStatus(s.v)}
                    className={`py-1.5 text-xs rounded-lg border font-medium transition-colors ${
                      status === s.v ? 'bg-purple-600 border-purple-600 text-white' : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-purple-400'
                    }`}>
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

          {/* Kanal */}
          <div>
            <label className={labelCls}>Kanal</label>
            <div className="flex flex-wrap gap-1.5">
              {CHANNEL_OPTIONS.map(c => (
                <button key={c.value} type="button" onClick={() => setChannel(c.value)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    channel === c.value
                      ? 'bg-purple-600 border-purple-600 text-white'
                      : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-purple-400'
                  }`}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tarihler */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Başlangıç Tarihi</label>
              <input type="date" className={inputCls} value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Bitiş Tarihi</label>
              <input type="date" className={inputCls} value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>

          {/* Bütçe */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-3 space-y-3 bg-zinc-50 dark:bg-zinc-800/50">
            <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Bütçe Takibi</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Toplam Bütçe (₺)</label>
                <input type="number" min="0" step="0.01" className={inputCls} placeholder="0.00" value={budget} onChange={e => setBudget(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Harcanan (₺)</label>
                <input type="number" min="0" step="0.01" className={inputCls} placeholder="0.00" value={spentAmount} onChange={e => setSpentAmount(e.target.value)} />
              </div>
            </div>
            {budgetNum > 0 && (
              <div className="flex items-center gap-3 text-xs">
                <div className="flex-1 bg-zinc-200 dark:bg-zinc-700 rounded-full h-1.5">
                  <div className="bg-purple-600 h-1.5 rounded-full transition-all" style={{ width: `${Math.min(100, (spentNum / budgetNum) * 100)}%` }} />
                </div>
                <span className="text-zinc-500 whitespace-nowrap">
                  Kalan: <strong className="text-zinc-900 dark:text-zinc-100">₺{remaining.toLocaleString('tr-TR')}</strong>
                </span>
              </div>
            )}
          </div>

          {/* Hedef */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Hedef Tipi</label>
              <select className={inputCls} value={goalType} onChange={e => setGoalType(e.target.value)}>
                <option value="">Seçiniz</option>
                {GOAL_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Hedef Değer</label>
              <input type="number" min="0" className={inputCls} placeholder="Örn: 1000 lead" value={goalValue} onChange={e => setGoalValue(e.target.value)} />
            </div>
          </div>

          {/* Performans metrikleri */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-3 space-y-3 bg-zinc-50 dark:bg-zinc-800/50">
            <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Performans Metrikleri</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Gösterim</label>
                <input type="number" min="0" className={inputCls} placeholder="0" value={impressions} onChange={e => setImpressions(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Tıklama</label>
                <input type="number" min="0" className={inputCls} placeholder="0" value={clicks} onChange={e => setClicks(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Dönüşüm</label>
                <input type="number" min="0" className={inputCls} placeholder="0" value={conversions} onChange={e => setConversions(e.target.value)} />
              </div>
            </div>
            {(ctr || convRate) && (
              <div className="flex gap-4 text-xs text-zinc-500">
                {ctr && <span>CTR: <strong className="text-zinc-900 dark:text-zinc-100">%{ctr}</strong></span>}
                {convRate && <span>Dönüşüm Oranı: <strong className="text-zinc-900 dark:text-zinc-100">%{convRate}</strong></span>}
              </div>
            )}
          </div>

          {/* Reklam URL + Hedef kitle */}
          <div>
            <label className={labelCls}>Reklam URL</label>
            <input className={inputCls} placeholder="https://..." value={adUrl} onChange={e => setAdUrl(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Hedef Kitle</label>
            <input className={inputCls} placeholder="18-35 yaş, kadın, İstanbul..." value={targetAudience} onChange={e => setTargetAudience(e.target.value)} />
          </div>

          {/* Sorumlu kişi */}
          {users.length > 0 && (
            <div>
              <label className={labelCls}>Sorumlu Kişi</label>
              <select className={inputCls} value={assignedTo} onChange={e => setAssignedTo(e.target.value)}>
                <option value="">Seçiniz</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          )}

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
            <textarea className={`${inputCls} resize-none`} rows={3} placeholder="İsteğe bağlı açıklama..." value={description} onChange={e => setDescription(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-5 pb-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
            İptal
          </button>
          <button onClick={handleSubmit} disabled={createMutation.isPending}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-purple-600 hover:bg-purple-700 text-white transition-colors disabled:opacity-60">
            {createMutation.isPending ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  )
}

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

// ─── Marketing Tab Section ────────────────────────────────────────────────────

interface MarketingTabSectionProps {
  departments: { id: string; name: string }[]
}

function MarketingTabSection({ departments }: MarketingTabSectionProps) {
  const qc = useQueryClient()
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [typeChip, setTypeChip] = useState('all')
  const [channelFilter, setChannelFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const typeChips = [
    { id: 'all',      label: 'Tümü' },
    { id: 'campaign', label: 'Kampanya' },
    { id: 'lead',     label: 'Lead' },
    { id: 'content',  label: 'İçerik' },
    { id: 'event',    label: 'Etkinlik' },
    { id: 'email',    label: 'E-posta' },
  ]

  const statusChips = [
    { id: 'all',         label: 'Tüm Durumlar' },
    { id: 'draft',       label: 'Taslak' },
    { id: 'in_progress', label: 'Aktif' },
    { id: 'pending',     label: 'Bekliyor' },
    { id: 'completed',   label: 'Tamamlandı' },
    { id: 'cancelled',   label: 'İptal' },
  ]

  const { user, roleLevel } = useAuthStore()
  const deptFilter = roleLevel === ROLE_LEVELS.DEPARTMENT_MANAGER && user?.department_id ? user.department_id : null

  const { data, isLoading } = useQuery({
    queryKey: ['acct-mgr-marketing', page, search, typeChip, channelFilter, statusFilter, deptFilter],
    queryFn: () => {
      const params: Record<string, any> = { page: page + 1, per_page: 15 }
      if (search) params.search = search
      if (typeChip !== 'all') params.type = typeChip
      if (channelFilter !== 'all') params.channel = channelFilter
      if (statusFilter !== 'all') params.status = statusFilter
      if (deptFilter) params.department_id = deptFilter
      return marketingService.list(params)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => marketingService.delete(id),
    onSuccess: () => {
      toast.success('Marketing kaydı silindi.')
      qc.invalidateQueries({ queryKey: ['acct-mgr-marketing'] })
      qc.invalidateQueries({ queryKey: ['acct-mgr-stats'] })
      setDeleteId(null)
    },
    onError: (e: any) => toast.error(e?.message ?? 'Silinemedi.'),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => marketingService.updateStatus(id, status),
    onSuccess: () => {
      toast.success('Durum güncellendi.')
      qc.invalidateQueries({ queryKey: ['acct-mgr-marketing'] })
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
    col.accessor('title', {
      header: 'Başlık',
      cell: info => (
        <div>
          <p className="font-medium text-zinc-900 dark:text-zinc-100 truncate max-w-[160px]">{info.getValue()}</p>
          <div className="mt-0.5">{marketingTypeBadge(info.row.original.type ?? '')}</div>
        </div>
      ),
    }),
    col.accessor('channel', {
      header: 'Kanal',
      cell: info => info.getValue() ? channelBadge(info.getValue()) : <span className="text-zinc-400 text-xs">—</span>,
    }),
    col.accessor('status', {
      header: 'Durum',
      cell: info => <StatusBadge status={info.getValue()} label={info.row.original.status_label} />,
    }),
    col.display({
      id: 'budget_spent',
      header: 'Bütçe / Harcanan',
      cell: info => {
        const row = info.row.original
        const budget = row.budget != null ? Number(row.budget) : null
        const spent = row.spent_amount != null ? Number(row.spent_amount) : 0
        if (budget == null) return <span className="text-zinc-400 text-xs">—</span>
        const pct = Math.min(100, budget > 0 ? (spent / budget) * 100 : 0)
        return (
          <div className="min-w-[100px]">
            <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              ₺{budget.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="flex-1 bg-zinc-200 dark:bg-zinc-700 rounded-full h-1">
                <div
                  className={`h-1 rounded-full transition-all ${pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-yellow-500' : 'bg-purple-500'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs text-zinc-400 whitespace-nowrap">{pct.toFixed(0)}%</span>
            </div>
          </div>
        )
      },
    }),
    col.display({
      id: 'metrics',
      header: 'Metriks',
      cell: info => {
        const row = info.row.original
        if (row.impressions == null && row.clicks == null) return <span className="text-zinc-400 text-xs">—</span>
        const ctr = row.impressions > 0 && row.clicks != null
          ? ((row.clicks / row.impressions) * 100).toFixed(1)
          : null
        return (
          <div className="text-xs text-zinc-500 space-y-0.5">
            <div className="flex items-center gap-1">
              <Eye className="h-3 w-3" />
              <span>{(row.impressions ?? 0).toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-1">
              <MousePointerClick className="h-3 w-3" />
              <span>{(row.clicks ?? 0).toLocaleString()}</span>
              {ctr && <span className="text-zinc-400">({ctr}%)</span>}
            </div>
          </div>
        )
      },
    }),
    col.display({
      id: 'assigned',
      header: 'Sorumlu',
      cell: info => (
        <div className="flex items-center gap-1.5">
          <UserCircle className="h-4 w-4 text-zinc-400 shrink-0" />
          <span className="text-sm text-zinc-600 dark:text-zinc-400 truncate max-w-[80px]">
            {info.row.original.assigned_to?.name ?? info.row.original.created_by?.name ?? '—'}
          </span>
        </div>
      ),
    }),
    col.display({
      id: 'date_range',
      header: 'Tarih Aralığı',
      cell: info => {
        const row = info.row.original
        if (!row.start_date && !row.end_date) return <span className="text-zinc-400 text-xs">—</span>
        return (
          <div className="text-xs text-zinc-500 whitespace-nowrap">
            {row.start_date && <div>{formatDate(row.start_date)}</div>}
            {row.end_date && <div className="text-zinc-400">~ {formatDate(row.end_date)}</div>}
          </div>
        )
      },
    }),
    col.display({
      id: 'actions',
      header: '',
      cell: info => {
        const row = info.row.original
        return (
          <div className="flex items-center gap-1">
            {row.status !== 'in_progress' && row.status !== 'cancelled' && row.status !== 'completed' && (
              <button
                title="Aktifleştir"
                onClick={() => statusMutation.mutate({ id: row.id, status: 'in_progress' })}
                className="p-1.5 rounded-lg hover:bg-yellow-50 dark:hover:bg-yellow-950/30 text-zinc-400 hover:text-yellow-600 transition-colors"
              >
                <Clock className="h-4 w-4" />
              </button>
            )}
            {row.status !== 'completed' && row.status !== 'cancelled' && (
              <button
                title="Tamamlandı"
                onClick={() => statusMutation.mutate({ id: row.id, status: 'completed' })}
                className="p-1.5 rounded-lg hover:bg-green-50 dark:hover:bg-green-950/30 text-zinc-400 hover:text-green-600 transition-colors"
              >
                <CheckCircle2 className="h-4 w-4" />
              </button>
            )}
            {row.status !== 'cancelled' && (
              <button
                title="İptal Et"
                onClick={() => statusMutation.mutate({ id: row.id, status: 'cancelled' })}
                className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-zinc-400 hover:text-red-600 transition-colors"
              >
                <Ban className="h-4 w-4" />
              </button>
            )}
            <button
              title="Sil"
              onClick={() => setDeleteId(row.id)}
              className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/50 text-zinc-400 hover:text-red-600 transition-colors"
            >
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
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Marketing kayıtlarında ara..."
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-500 placeholder:text-zinc-400"
          />
        </form>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
        >
          <Plus className="h-4 w-4" />
          Yeni Kampanya
        </button>
      </div>

      {/* Tip filtresi */}
      <div className="flex flex-wrap gap-2">
        {typeChips.map(chip => (
          <button
            key={chip.id}
            onClick={() => { setTypeChip(chip.id); setPage(0) }}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
              typeChip === chip.id
                ? 'bg-purple-600 border-purple-600 text-white'
                : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-purple-400 hover:text-purple-600'
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Durum + Kanal filtresi */}
      <div className="flex flex-wrap items-center gap-2">
        {statusChips.map(chip => (
          <button
            key={chip.id}
            onClick={() => { setStatusFilter(chip.id); setPage(0) }}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
              statusFilter === chip.id
                ? 'bg-zinc-800 border-zinc-800 text-white dark:bg-zinc-200 dark:border-zinc-200 dark:text-zinc-900'
                : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-400'
            }`}
          >
            {chip.label}
          </button>
        ))}
        <select
          value={channelFilter}
          onChange={e => { setChannelFilter(e.target.value); setPage(0) }}
          className="px-3 py-1.5 text-xs font-medium rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 focus:outline-none focus:border-purple-400 cursor-pointer"
        >
          <option value="all">Tüm Kanallar</option>
          {CHANNEL_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        total={data?.meta?.total ?? 0}
        pageIndex={page}
        onPaginationChange={s => setPage(s.pageIndex)}
        isLoading={isLoading}
        emptyMessage="Henüz marketing kaydı yok."
      />

      <ConfirmModal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        title="Kaydı sil?"
        description="Bu kayıt ve ilişkili tüm veriler kalıcı olarak silinecek."
        confirmLabel="Evet, Sil"
        loading={deleteMutation.isPending}
      />

      {showCreate && (
        <MarketingCreateModal
          onClose={() => setShowCreate(false)}
          departments={departments}
          onSuccess={() => qc.invalidateQueries({ queryKey: ['acct-mgr-marketing'] })}
        />
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AccountingManagerPage() {
  const [activeTab, setActiveTab] = useState('muhasebe')

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['acct-mgr-stats'],
    queryFn: () => get<any>('/dashboard/module/accounting').then(r => r.data),
  })

  const { data: mktStatsData, isLoading: mktStatsLoading } = useQuery({
    queryKey: ['acct-mgr-marketing-stats'],
    queryFn: () => get<any>('/dashboard/module/marketing').then(r => r.data),
  })

  const { data: deptData } = useQuery({
    queryKey: ['company-departments-list'],
    queryFn: () => get<any>('/company/departments').then(r => r.data ?? []),
  })
  const departments: { id: string; name: string }[] = deptData ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Muhasebe & Marketing Müdürü"
        description="Finansal kayıtlar ve pazarlama yönetimi"
        breadcrumbs={[{ label: 'Modüller' }, { label: 'Muhasebe & Marketing Müdürü' }]}
      />

      {/* Muhasebe Stats — Financial Dashboard */}
      <div>
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <Calculator className="h-3.5 w-3.5" /> Muhasebe
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Toplam Gelir */}
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/10 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Toplam Gelir</span>
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400">
              {statsLoading ? '…' : `₺${((statsData?.total_income ?? 0) as number).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`}
            </p>
            <p className="text-xs text-emerald-600/70 mt-1">Bu ay: ₺{((statsData?.month_income ?? 0) as number).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</p>
          </div>
          {/* Toplam Gider */}
          <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-red-700 dark:text-red-400">Toplam Gider</span>
              <AlertCircle className="h-4 w-4 text-red-600" />
            </div>
            <p className="text-xl font-bold text-red-700 dark:text-red-400">
              {statsLoading ? '…' : `₺${((statsData?.total_expense ?? 0) as number).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`}
            </p>
            <p className="text-xs text-red-600/70 mt-1">Bu ay: ₺{((statsData?.month_expense ?? 0) as number).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</p>
          </div>
          {/* Net Bakiye */}
          <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/10 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-blue-700 dark:text-blue-400">Net Bakiye</span>
              <Calculator className="h-4 w-4 text-blue-600" />
            </div>
            <p className="text-xl font-bold text-blue-700 dark:text-blue-400">
              {statsLoading ? '…' : `₺${Math.abs((statsData?.net_balance ?? 0) as number).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`}
            </p>
            <p className="text-xs text-blue-600/70 mt-1">KDV: ₺{((statsData?.total_vat ?? 0) as number).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</p>
          </div>
          {/* Onay Bekleyen */}
          <StatsCard title="Onay Bekleyen" value={statsData?.pending ?? 0} icon={CheckCircle2} color="orange" loading={statsLoading} />
        </div>
      </div>

      {/* Marketing Stats */}
      <div>
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <Megaphone className="h-3.5 w-3.5" /> Marketing
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard title="Toplam Kampanya" value={mktStatsData?.total ?? 0} icon={Megaphone} color="purple" loading={mktStatsLoading} />
          <StatsCard title="Bu Ay" value={mktStatsData?.this_month ?? 0} icon={TrendingUp} color="green" loading={mktStatsLoading} />
          <StatsCard title="Bekleyen" value={mktStatsData?.pending ?? 0} icon={AlertCircle} color="orange" loading={mktStatsLoading} />
          <StatsCard title="Tamamlanan" value={mktStatsData?.completed ?? 0} icon={Target} color="blue" loading={mktStatsLoading} />
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
        <div className="border-b border-zinc-200 dark:border-zinc-800 px-4">
          <nav className="flex gap-1 overflow-x-auto" aria-label="Tabs">
            {TABS.map(tab => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3.5 text-sm font-medium whitespace-nowrap transition-colors ${
                    isActive
                      ? 'border-b-2 border-blue-600 text-blue-600'
                      : 'border-b-2 border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {tab.label}
                </button>
              )
            })}
          </nav>
        </div>

        <div className="p-5">
          {activeTab === 'muhasebe' && (
            <AccountingTabSection departments={departments} />
          )}
          {activeTab === 'marketing' && (
            <MarketingTabSection departments={departments} />
          )}
        </div>
      </div>
    </div>
  )
}
