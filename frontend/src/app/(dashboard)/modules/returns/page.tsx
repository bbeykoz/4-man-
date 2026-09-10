'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  RotateCcw, Plus, Trash2, Search, X, Clock, CheckCircle2,
  Ban, XCircle, PackageCheck, AlertCircle, ChevronDown, Minus,
} from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/common/PageHeader'
import { StatsCard } from '@/components/common/StatsCard'
import { DataTable } from '@/components/common/DataTable'
import { ConfirmModal } from '@/components/common/ConfirmModal'
import { createRecordService } from '@/services/record.service'
import { get } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { PRIORITY_OPTIONS } from '@/lib/constants'
import { createColumnHelper } from '@tanstack/react-table'

// ─── Constants ────────────────────────────────────────────────────────────────

const returnsService = createRecordService('returns')

const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500'
const labelCls = 'block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1'
const sectionCls = 'rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30 p-4 space-y-3'

const RETURN_TYPE_OPTIONS = [
  { value: 'customer_return', label: 'Müşteri İadesi' },
  { value: 'supplier_return', label: 'Tedarikçi İadesi' },
  { value: 'damaged',         label: 'Hasarlı' },
  { value: 'expired',         label: 'Süresi Dolmuş' },
  { value: 'warranty',        label: 'Garanti' },
  { value: 'service',         label: 'Servis' },
]

const REASON_OPTIONS = [
  'Arızalı / Hasarlı',
  'Yanlış Ürün Gönderildi',
  'Eksik Ürün',
  'Kalite Sorunu',
  'İstenmiyor / Vazgeçildi',
  'Garanti Kapsamında',
  'Süresi Dolmuş',
  'Diğer',
]

const CONDITION_OPTIONS = [
  'Yeni Gibi',
  'İyi',
  'Orta',
  'Kötü / Hasarlı',
  'Kullanılamaz',
]

const RETURN_OUTCOME_OPTIONS = [
  { value: 'refund',   label: 'Para İadesi' },
  { value: 'exchange', label: 'Değişim' },
  { value: 'repair',   label: 'Tamir' },
  { value: 'cancel',   label: 'İptal' },
]

const SHIPPING_COMPANIES = [
  'Yurtiçi Kargo', 'Aras Kargo', 'MNG Kargo', 'PTT Kargo',
  'UPS', 'DHL', 'FedEx', 'DPD', 'Sürat Kargo',
]

const UNIT_OPTIONS = ['adet', 'kg', 'gram', 'litre', 'kutu', 'palet', 'koli']

const STATUS_CHIPS = [
  { id: 'all',         label: 'Tümü' },
  { id: 'pending',     label: 'Talep Alındı' },
  { id: 'in_progress', label: 'İnceleniyor' },
  { id: 'approved',    label: 'Onaylandı' },
  { id: 'rejected',    label: 'Reddedildi' },
  { id: 'completed',   label: 'Tamamlandı' },
  { id: 'cancelled',   label: 'İptal' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    draft:       { label: 'Taslak',       cls: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400' },
    pending:     { label: 'Talep Alındı', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
    in_progress: { label: 'İnceleniyor',  cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
    approved:    { label: 'Onaylandı',    cls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
    rejected:    { label: 'Reddedildi',   cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
    completed:   { label: 'Tamamlandı',   cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' },
    cancelled:   { label: 'İptal',        cls: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400' },
  }
  const entry = map[status] ?? { label: status, cls: 'bg-zinc-100 text-zinc-700' }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${entry.cls}`}>
      {entry.label}
    </span>
  )
}

function returnTypeBadge(type: string) {
  const map: Record<string, { label: string; cls: string }> = {
    customer_return: { label: 'Müşteri',   cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
    supplier_return: { label: 'Tedarikçi', cls: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' },
    damaged:         { label: 'Hasarlı',   cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
    expired:         { label: 'Son Tarih', cls: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
    warranty:        { label: 'Garanti',   cls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
    service:         { label: 'Servis',    cls: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400' },
  }
  const entry = map[type] ?? { label: 'Diğer', cls: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400' }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${entry.cls}`}>
      {entry.label}
    </span>
  )
}

function outcomeBadge(outcome: string) {
  const map: Record<string, { label: string; cls: string }> = {
    refund:   { label: 'Para İadesi', cls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
    exchange: { label: 'Değişim',     cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
    repair:   { label: 'Tamir',       cls: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
    cancel:   { label: 'İptal',       cls: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400' },
  }
  if (!outcome) return null
  const entry = map[outcome] ?? { label: outcome, cls: 'bg-zinc-100 text-zinc-700' }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${entry.cls}`}>
      {entry.label}
    </span>
  )
}

// ─── Return Item Interface ────────────────────────────────────────────────────

interface ReturnItem {
  product_name: string
  quantity: string
  unit: string
  condition: string
}

// ─── Create Modal ─────────────────────────────────────────────────────────────

interface ReturnsCreateModalProps {
  onClose: () => void
  departments: { id: string; name: string }[]
  onSuccess: () => void
}

function ReturnsCreateModal({ onClose, departments, onSuccess }: ReturnsCreateModalProps) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState('')
  const [status, setStatus] = useState('pending')
  const [priority, setPriority] = useState('medium')
  const [orderNumber, setOrderNumber] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [rmaNumber, setRmaNumber] = useState('')
  const [reason, setReason] = useState('')
  const [condition, setCondition] = useState('')
  const [returnOutcome, setReturnOutcome] = useState('')
  const [refundAmount, setRefundAmount] = useState('')
  const [shippingCompany, setShippingCompany] = useState('')
  const [shippingTracking, setShippingTracking] = useState('')
  const [shippingDate, setShippingDate] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [description, setDescription] = useState('')
  const [items, setItems] = useState<ReturnItem[]>([{ product_name: '', quantity: '', unit: 'adet', condition: '' }])

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, any>) => returnsService.create(payload),
    onSuccess: () => {
      toast.success('İade kaydı oluşturuldu.')
      onSuccess()
      onClose()
    },
    onError: (e: any) => toast.error(e?.message ?? 'Kayıt oluşturulamadı.'),
  })

  const addItem = () => setItems(prev => [...prev, { product_name: '', quantity: '', unit: 'adet', condition: '' }])
  const removeItem = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i))
  const updateItem = (i: number, field: keyof ReturnItem, val: string) =>
    setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: val } : item))

  const handleSubmit = () => {
    if (!title.trim()) { toast.error('Başlık zorunludur.'); return }
    const validItems = items.filter(it => it.product_name.trim())
    const payload: Record<string, any> = { title, status, priority }
    if (type) payload.type = type
    if (orderNumber) payload.order_number = orderNumber
    if (customerName) payload.customer_name = customerName
    if (rmaNumber) payload.rma_number = rmaNumber
    if (reason) payload.reason = reason
    if (condition) payload.condition = condition
    if (returnOutcome) payload.return_outcome = returnOutcome
    if (refundAmount) payload.refund_amount = parseFloat(refundAmount)
    if (shippingCompany) payload.shipping_company = shippingCompany
    if (shippingTracking) payload.shipping_tracking = shippingTracking
    if (shippingDate) payload.shipping_date = shippingDate
    if (departmentId) payload.department_id = departmentId
    if (description) payload.description = description
    if (validItems.length > 0) payload.items = validItems
    createMutation.mutate(payload)
  }

  const STATUS_OPTS = [
    { value: 'pending',     label: 'Talep Alındı' },
    { value: 'in_progress', label: 'İnceleniyor' },
    { value: 'draft',       label: 'Taslak' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 bg-white dark:bg-zinc-900 z-10">
          <div className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-orange-500" />
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Yeni İade Kaydı</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Durum / Öncelik */}
          <div className={sectionCls}>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Durum & Öncelik</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Durum</label>
                <div className="flex flex-wrap gap-2">
                  {STATUS_OPTS.map(o => (
                    <button key={o.value} type="button" onClick={() => setStatus(o.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${status === o.value ? 'bg-orange-600 border-orange-600 text-white' : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-orange-400'}`}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelCls}>Öncelik</label>
                <div className="flex flex-wrap gap-2">
                  {PRIORITY_OPTIONS.map(o => (
                    <button key={o.value} type="button" onClick={() => setPriority(o.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${priority === o.value ? 'bg-orange-600 border-orange-600 text-white' : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-orange-400'}`}>
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
            <input className={inputCls} placeholder="İade kaydı başlığı" value={title} onChange={e => setTitle(e.target.value)} />
          </div>

          {/* İade Bilgisi */}
          <div className={sectionCls}>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">İade Bilgisi</p>
            <div>
              <label className={labelCls}>İade Türü</label>
              <div className="grid grid-cols-3 gap-2">
                {RETURN_TYPE_OPTIONS.map(o => (
                  <button key={o.value} type="button" onClick={() => setType(prev => prev === o.value ? '' : o.value)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium border text-center transition-colors ${type === o.value ? 'bg-orange-600 border-orange-600 text-white' : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-orange-400'}`}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Sipariş No</label>
                <input className={inputCls} placeholder="ORD-001" value={orderNumber} onChange={e => setOrderNumber(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Müşteri Adı</label>
                <input className={inputCls} placeholder="Müşteri adı" value={customerName} onChange={e => setCustomerName(e.target.value)} />
              </div>
            </div>
            <div>
              <label className={labelCls}>RMA Numarası</label>
              <input className={inputCls} placeholder="RMA-2024-001" value={rmaNumber} onChange={e => setRmaNumber(e.target.value)} />
            </div>
          </div>

          {/* İade Sebebi / Ürün Durumu */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>İade Sebebi</label>
              <select className={inputCls} value={reason} onChange={e => setReason(e.target.value)}>
                <option value="">Seçiniz</option>
                {REASON_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Genel Ürün Durumu</label>
              <select className={inputCls} value={condition} onChange={e => setCondition(e.target.value)}>
                <option value="">Seçiniz</option>
                {CONDITION_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* İade Kalemleri */}
          <div className={sectionCls}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">İade Kalemleri</p>
              <button type="button" onClick={addItem}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors border border-orange-200 dark:border-orange-800">
                <Plus className="h-3 w-3" /> Kalem Ekle
              </button>
            </div>
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-start p-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800">
                  <div className="col-span-4">
                    {i === 0 && <p className="text-[10px] text-zinc-400 mb-1">Ürün Adı</p>}
                    <input className={inputCls} placeholder="Ürün adı" value={item.product_name} onChange={e => updateItem(i, 'product_name', e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    {i === 0 && <p className="text-[10px] text-zinc-400 mb-1">Miktar</p>}
                    <input type="number" min="0" className={inputCls} placeholder="1" value={item.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    {i === 0 && <p className="text-[10px] text-zinc-400 mb-1">Birim</p>}
                    <select className={inputCls} value={item.unit} onChange={e => updateItem(i, 'unit', e.target.value)}>
                      {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div className="col-span-3">
                    {i === 0 && <p className="text-[10px] text-zinc-400 mb-1">Durum</p>}
                    <select className={inputCls} value={item.condition} onChange={e => updateItem(i, 'condition', e.target.value)}>
                      <option value="">Durum</option>
                      {CONDITION_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="col-span-1 flex justify-end">
                    {i === 0 && <p className="text-[10px] invisible mb-1">x</p>}
                    <button type="button" onClick={() => items.length > 1 && removeItem(i)} disabled={items.length === 1}
                      className="p-1.5 rounded text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-30">
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* İade Sonucu */}
          <div className={sectionCls}>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">İade Sonucu</p>
            <div>
              <label className={labelCls}>Sonuç Tipi</label>
              <div className="flex flex-wrap gap-2">
                {RETURN_OUTCOME_OPTIONS.map(o => (
                  <button key={o.value} type="button" onClick={() => setReturnOutcome(prev => prev === o.value ? '' : o.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${returnOutcome === o.value ? 'bg-orange-600 border-orange-600 text-white' : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-orange-400'}`}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls}>İade Tutarı (₺)</label>
              <input type="number" min="0" step="0.01" className={inputCls} placeholder="0.00" value={refundAmount} onChange={e => setRefundAmount(e.target.value)} />
            </div>
          </div>

          {/* Kargo Bilgisi */}
          <div className={sectionCls}>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Kargo Bilgisi</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Kargo Firması</label>
                <select className={inputCls} value={shippingCompany} onChange={e => setShippingCompany(e.target.value)}>
                  <option value="">Seçiniz</option>
                  {SHIPPING_COMPANIES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Takip No</label>
                <input className={inputCls} placeholder="123456789" value={shippingTracking} onChange={e => setShippingTracking(e.target.value)} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Kargo Tarihi</label>
              <input type="date" className={inputCls} value={shippingDate} onChange={e => setShippingDate(e.target.value)} />
            </div>
          </div>

          {/* Departman / Açıklama */}
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

        <div className="flex justify-end gap-3 px-5 pb-5 sticky bottom-0 bg-white dark:bg-zinc-900 border-t border-zinc-100 dark:border-zinc-800 pt-3">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
            İptal
          </button>
          <button onClick={handleSubmit} disabled={createMutation.isPending}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-orange-600 hover:bg-orange-700 text-white transition-colors disabled:opacity-60">
            {createMutation.isPending ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Tab Section ──────────────────────────────────────────────────────────────

interface ReturnsTabSectionProps {
  departments: { id: string; name: string }[]
}

function ReturnsTabSection({ departments }: ReturnsTabSectionProps) {
  const qc = useQueryClient()
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [statusChip, setStatusChip] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['returns-page', page, search, statusChip, typeFilter],
    queryFn: () => {
      const params: Record<string, any> = { page: page + 1, per_page: 15 }
      if (search) params.search = search
      if (statusChip !== 'all') params.status = statusChip
      if (typeFilter !== 'all') params.type = typeFilter
      return returnsService.list(params)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => returnsService.delete(id),
    onSuccess: () => {
      toast.success('İade kaydı silindi.')
      qc.invalidateQueries({ queryKey: ['returns-page'] })
      qc.invalidateQueries({ queryKey: ['returns-stats'] })
      setDeleteId(null)
    },
    onError: (e: any) => toast.error(e?.message ?? 'Silinemedi.'),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => returnsService.updateStatus(id, status),
    onSuccess: () => {
      toast.success('Durum güncellendi.')
      qc.invalidateQueries({ queryKey: ['returns-page'] })
      qc.invalidateQueries({ queryKey: ['returns-stats'] })
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
      id: 'order_info',
      header: 'Sipariş / Müşteri',
      cell: info => {
        const row = info.row.original
        return (
          <div className="space-y-0.5 min-w-[140px]">
            <div className="flex items-center gap-1.5 flex-wrap">
              {returnTypeBadge(row.type ?? '')}
              {row.order_number && <span className="text-xs font-mono text-zinc-500">{row.order_number}</span>}
            </div>
            {row.customer_name && <p className="text-sm text-zinc-700 dark:text-zinc-300">{row.customer_name}</p>}
            {row.rma_number && <p className="text-xs text-zinc-400">RMA: {row.rma_number}</p>}
          </div>
        )
      },
    }),
    col.accessor('status', {
      header: 'Durum',
      cell: info => statusBadge(info.getValue() ?? ''),
    }),
    col.display({
      id: 'items_summary',
      header: 'İade Kalemleri',
      cell: info => {
        const items: any[] = info.row.original.items ?? []
        if (!items.length) return <span className="text-xs text-zinc-400">—</span>
        const shown = items.slice(0, 2)
        return (
          <div className="space-y-0.5 min-w-[130px]">
            {shown.map((it: any, i: number) => (
              <p key={i} className="text-xs text-zinc-600 dark:text-zinc-400 truncate max-w-[140px]">
                {it.product_name}{it.quantity ? ` ×${it.quantity}` : ''}
              </p>
            ))}
            {items.length > 2 && <p className="text-xs text-orange-600">+{items.length - 2} daha</p>}
          </div>
        )
      },
    }),
    col.display({
      id: 'outcome',
      header: 'Sonuç / Tutar',
      cell: info => {
        const row = info.row.original
        const badge = outcomeBadge(row.return_outcome ?? '')
        return (
          <div className="space-y-0.5">
            {badge ?? <span className="text-xs text-zinc-400">—</span>}
            {row.refund_amount != null && (
              <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                ₺{Number(row.refund_amount).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
              </p>
            )}
          </div>
        )
      },
    }),
    col.display({
      id: 'shipping',
      header: 'Kargo',
      cell: info => {
        const row = info.row.original
        if (!row.shipping_company && !row.shipping_tracking) return <span className="text-xs text-zinc-400">—</span>
        return (
          <div className="space-y-0.5">
            {row.shipping_company && <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{row.shipping_company}</p>}
            {row.shipping_tracking && <p className="text-xs font-mono text-zinc-500">{row.shipping_tracking}</p>}
          </div>
        )
      },
    }),
    col.accessor('created_at', {
      header: 'Tarih',
      cell: info => <span className="text-xs text-zinc-500">{formatDate(info.getValue())}</span>,
    }),
    col.display({
      id: 'workflow',
      header: '',
      cell: info => {
        const row = info.row.original
        const s = row.status
        return (
          <div className="flex items-center gap-1">
            {s === 'pending' && (
              <button title="İncelemeye Al"
                onClick={() => statusMutation.mutate({ id: row.id, status: 'in_progress' })}
                className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 text-zinc-400 hover:text-blue-600 transition-colors">
                <Clock className="h-4 w-4" />
              </button>
            )}
            {s === 'in_progress' && (
              <button title="Onayla"
                onClick={() => statusMutation.mutate({ id: row.id, status: 'approved' })}
                className="p-1.5 rounded-lg hover:bg-green-50 dark:hover:bg-green-950/30 text-zinc-400 hover:text-green-600 transition-colors">
                <CheckCircle2 className="h-4 w-4" />
              </button>
            )}
            {s === 'approved' && (
              <button title="Tamamla"
                onClick={() => statusMutation.mutate({ id: row.id, status: 'completed' })}
                className="p-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-zinc-400 hover:text-emerald-600 transition-colors">
                <PackageCheck className="h-4 w-4" />
              </button>
            )}
            {(s === 'pending' || s === 'in_progress') && (
              <button title="Reddet"
                onClick={() => statusMutation.mutate({ id: row.id, status: 'rejected' })}
                className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-zinc-400 hover:text-red-600 transition-colors">
                <XCircle className="h-4 w-4" />
              </button>
            )}
            {s !== 'cancelled' && s !== 'completed' && s !== 'rejected' && (
              <button title="İptal"
                onClick={() => statusMutation.mutate({ id: row.id, status: 'cancelled' })}
                className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 transition-colors">
                <Ban className="h-4 w-4" />
              </button>
            )}
            <button title="Sil"
              onClick={() => setDeleteId(row.id)}
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
        <div className="flex gap-3 flex-1">
          <form onSubmit={handleSearch} className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="İade kayıtlarında ara..."
              className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500 placeholder:text-zinc-400"
            />
          </form>
          <div className="relative">
            <select
              value={typeFilter}
              onChange={e => { setTypeFilter(e.target.value); setPage(0) }}
              className="pl-3 pr-8 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500 appearance-none cursor-pointer"
            >
              <option value="all">Tüm Türler</option>
              {RETURN_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" />
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
        >
          <Plus className="h-4 w-4" />
          Yeni İade
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_CHIPS.map(chip => (
          <button
            key={chip.id}
            onClick={() => { setStatusChip(chip.id); setPage(0) }}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
              statusChip === chip.id
                ? 'bg-orange-600 border-orange-600 text-white'
                : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-orange-400 hover:text-orange-600'
            }`}
          >
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
        emptyMessage="Henüz iade kaydı yok."
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
        <ReturnsCreateModal
          onClose={() => setShowCreate(false)}
          departments={departments}
          onSuccess={() => qc.invalidateQueries({ queryKey: ['returns-page'] })}
        />
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReturnsPage() {
  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['returns-stats'],
    queryFn: () => get<any>('/dashboard/module/returns').then(r => r.data),
  })

  const { data: deptData } = useQuery({
    queryKey: ['company-departments-list'],
    queryFn: () => get<any>('/company/departments').then(r => r.data ?? []),
  })
  const departments: { id: string; name: string }[] = deptData ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        title="İade"
        description="İade talep ve süreç yönetimi"
        breadcrumbs={[{ label: 'Modüller' }, { label: 'İade' }]}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Toplam İade"
          value={statsData?.total ?? 0}
          icon={RotateCcw}
          color="orange"
          loading={statsLoading}
        />
        <StatsCard
          title="Talep Alındı"
          value={statsData?.pending ?? 0}
          icon={AlertCircle}
          color="orange"
          loading={statsLoading}
        />
        <StatsCard
          title="İnceleniyor"
          value={statsData?.in_progress ?? 0}
          icon={Clock}
          color="blue"
          loading={statsLoading}
        />
        <StatsCard
          title="Tamamlandı"
          value={statsData?.completed ?? 0}
          icon={CheckCircle2}
          color="green"
          loading={statsLoading}
        />
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-800">
          <RotateCcw className="h-4 w-4 text-orange-500" />
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">İade Kayıtları</span>
        </div>
        <div className="p-5">
          <ReturnsTabSection departments={departments} />
        </div>
      </div>
    </div>
  )
}
