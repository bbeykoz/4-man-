'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  RotateCcw, Package, Plus, Trash2, Search, X,
  AlertCircle, CheckCircle2, Clock, Ban, UserCircle,
  XCircle, PackageCheck, Minus, ChevronDown,
  Truck, MapPin, Barcode, Weight,
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

const returnsService = createRecordService('returns')
const packagingService = createRecordService('packaging')

const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelCls = 'block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1'

const RETURN_TYPE_OPTIONS = [
  { value: 'customer_return', label: 'Müşteri İadesi' },
  { value: 'supplier_return', label: 'Tedarikçi İadesi' },
  { value: 'damaged',         label: 'Hasarlı' },
  { value: 'expired',         label: 'Süresi Dolmuş' },
  { value: 'warranty',        label: 'Garanti' },
  { value: 'service',         label: 'Servis' },
]

const REASON_OPTIONS = [
  'Arızalı / Hasarlı', 'Yanlış Ürün Gönderildi', 'Eksik Ürün',
  'Kalite Sorunu', 'İstenmiyor / Vazgeçildi', 'Garanti Kapsamında',
  'Süresi Dolmuş', 'Diğer',
]

const CONDITION_OPTIONS = ['Yeni Gibi', 'İyi', 'Orta', 'Kötü / Hasarlı', 'Kullanılamaz']

const RETURN_OUTCOME_OPTIONS = [
  { value: 'refund',   label: 'Para İadesi' },
  { value: 'exchange', label: 'Değişim' },
  { value: 'repair',   label: 'Tamir' },
  { value: 'cancel',   label: 'İptal' },
]

const RETURN_CARRIERS = [
  'Yurtiçi Kargo', 'Aras Kargo', 'MNG Kargo', 'PTT Kargo',
  'UPS', 'DHL', 'FedEx', 'DPD', 'Sürat Kargo',
]

const UNIT_OPTIONS_RTN = ['adet', 'kg', 'gram', 'litre', 'kutu', 'palet', 'koli']

const RET_STATUS_CHIPS = [
  { id: 'all',         label: 'Tümü' },
  { id: 'pending',     label: 'Talep Alındı' },
  { id: 'in_progress', label: 'İnceleniyor' },
  { id: 'approved',    label: 'Onaylandı' },
  { id: 'rejected',    label: 'Reddedildi' },
  { id: 'completed',   label: 'Tamamlandı' },
]

const TABS = [
  { id: 'iade',      label: 'İade',      icon: RotateCcw },
  { id: 'paketleme', label: 'Paketleme', icon: Package },
]

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

function outcomeBadgeRtn(outcome: string) {
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

interface ReturnItemMgr { product_name: string; quantity: string; unit: string; condition: string }

// ─── Returns Create Modal ─────────────────────────────────────────────────────

const sectionClsMgr = 'rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30 p-4 space-y-3'

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
  const [items, setItems] = useState<ReturnItemMgr[]>([{ product_name: '', quantity: '', unit: 'adet', condition: '' }])

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
  const updateItem = (i: number, field: keyof ReturnItemMgr, val: string) =>
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
    { value: 'pending', label: 'Talep Alındı' },
    { value: 'in_progress', label: 'İnceleniyor' },
    { value: 'draft', label: 'Taslak' },
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
          <div className={sectionClsMgr}>
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

          <div>
            <label className={labelCls}>Başlık <span className="text-red-500">*</span></label>
            <input className={inputCls} placeholder="İade kaydı başlığı" value={title} onChange={e => setTitle(e.target.value)} />
          </div>

          <div className={sectionClsMgr}>
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

          <div className={sectionClsMgr}>
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
                      {UNIT_OPTIONS_RTN.map(u => <option key={u} value={u}>{u}</option>)}
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

          <div className={sectionClsMgr}>
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

          <div className={sectionClsMgr}>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Kargo Bilgisi</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Kargo Firması</label>
                <select className={inputCls} value={shippingCompany} onChange={e => setShippingCompany(e.target.value)}>
                  <option value="">Seçiniz</option>
                  {RETURN_CARRIERS.map(s => <option key={s} value={s}>{s}</option>)}
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

// ─── Packaging Create Modal ───────────────────────────────────────────────────

const PACKAGE_TYPE_OPTIONS = ['Koli', 'Palet', 'Zarf', 'Poşet', 'Tahta Kasa', 'Özel']

const SHIPPING_COMPANIES = [
  'Yurtiçi Kargo', 'Aras Kargo', 'MNG Kargo', 'Sürat Kargo',
  'PTT Kargo', 'UPS', 'DHL', 'FedEx', 'Diğer',
]

const PKG_STATUS_CHIPS = [
  { id: 'all',         label: 'Tümü' },
  { id: 'pending',     label: 'Bekliyor' },
  { id: 'in_progress', label: 'Paketleniyor' },
  { id: 'approved',    label: 'Hazır' },
  { id: 'completed',   label: 'Kargoya Verildi' },
  { id: 'cancelled',   label: 'İptal' },
]

function pkgStatusBadge(status: string, label?: string) {
  const map: Record<string, string> = {
    draft:       'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
    pending:     'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    approved:    'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    completed:   'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    cancelled:   'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  }
  const labels: Record<string, string> = {
    draft: 'Taslak', pending: 'Bekliyor', in_progress: 'Paketleniyor',
    approved: 'Hazır', completed: 'Kargoya Verildi', cancelled: 'İptal',
  }
  const text = label ?? labels[status] ?? status
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${map[status] ?? 'bg-zinc-100 text-zinc-600'}`}>
      {text}
    </span>
  )
}

interface PackagingItem { product_name: string; quantity: string; unit: string }

interface PackagingCreateModalProps {
  onClose: () => void
  departments: { id: string; name: string }[]
  onSuccess: () => void
}

function PackagingCreateModal({ onClose, departments, onSuccess }: PackagingCreateModalProps) {
  const [title, setTitle]                     = useState('')
  const [priority, setPriority]               = useState('medium')
  const [status, setStatus]                   = useState('pending')
  const [orderNumber, setOrderNumber]         = useState('')
  const [customerName, setCustomerName]       = useState('')
  const [address, setAddress]                 = useState('')
  const [city, setCity]                       = useState('')
  const [country, setCountry]                 = useState('TR')
  const [packageType, setPackageType]         = useState('')
  const [itemCount, setItemCount]             = useState('')
  const [weight, setWeight]                   = useState('')
  const [width, setWidth]                     = useState('')
  const [height, setHeight]                   = useState('')
  const [depth, setDepth]                     = useState('')
  const [shippingCompany, setShippingCompany] = useState('')
  const [shippingTracking, setShippingTracking] = useState('')
  const [shippingDate, setShippingDate]       = useState('')
  const [packedBy, setPackedBy]               = useState('')
  const [departmentId, setDepartmentId]       = useState('')
  const [description, setDescription]         = useState('')
  const [items, setItems]                     = useState<PackagingItem[]>([{ product_name: '', quantity: '', unit: 'adet' }])

  const w = parseFloat(width) || 0
  const h = parseFloat(height) || 0
  const d = parseFloat(depth) || 0
  const desi = w > 0 && h > 0 && d > 0 ? +((w * h * d) / 3000).toFixed(2) : null

  const { data: usersData } = useQuery({
    queryKey: ['company-users-list'],
    queryFn: () => get<any>('/company/users?per_page=100').then(r => r.data ?? []),
  })
  const users: { id: string; name: string }[] = usersData ?? []

  const addItem = () => setItems(prev => [...prev, { product_name: '', quantity: '', unit: 'adet' }])
  const removeItem = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i))
  const updateItem = (i: number, key: keyof PackagingItem, val: string) =>
    setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [key]: val } : item))

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, any>) => packagingService.create(payload),
    onSuccess: () => { toast.success('Paket kaydı oluşturuldu.'); onSuccess(); onClose() },
    onError: (e: any) => toast.error(e?.message ?? 'Kayıt oluşturulamadı.'),
  })

  const handleSubmit = () => {
    if (!title.trim()) { toast.error('Başlık zorunludur.'); return }
    const payload: Record<string, any> = { title, status, priority }
    if (orderNumber) payload.order_number = orderNumber
    if (customerName) payload.customer_name = customerName
    if (address) payload.address = address
    if (city) payload.city = city
    if (country) payload.country = country
    if (packageType) payload.package_type = packageType
    if (itemCount) payload.item_count = parseInt(itemCount)
    if (weight) payload.weight = parseFloat(weight)
    if (width) payload.width = parseFloat(width)
    if (height) payload.height = parseFloat(height)
    if (depth) payload.depth = parseFloat(depth)
    if (desi) payload.desi = desi
    if (shippingCompany) payload.shipping_company = shippingCompany
    if (shippingTracking) payload.shipping_tracking = shippingTracking
    if (shippingDate) payload.shipping_date = shippingDate
    if (packedBy) payload.packed_by = packedBy
    if (departmentId) payload.department_id = departmentId
    if (description) payload.description = description
    const filledItems = items.filter(i => i.product_name.trim())
    if (filledItems.length > 0) payload.items = filledItems.map(i => ({ product_name: i.product_name, quantity: parseFloat(i.quantity) || 1, unit: i.unit || 'adet' }))
    createMutation.mutate(payload)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-teal-600" />
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Yeni Paket Kaydı</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-5">

          {/* Durum + Öncelik */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Durum</label>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { v: 'pending',     l: 'Bekliyor' },
                  { v: 'in_progress', l: 'Paketleniyor' },
                  { v: 'approved',    l: 'Hazır' },
                  { v: 'completed',   l: 'Kargoya Verildi' },
                ].map(s => (
                  <button key={s.v} type="button" onClick={() => setStatus(s.v)}
                    className={`py-1.5 text-xs rounded-lg border font-medium transition-colors ${
                      status === s.v ? 'bg-teal-600 border-teal-600 text-white' : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-teal-400'
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

          {/* Başlık */}
          <div>
            <label className={labelCls}>Başlık <span className="text-red-500">*</span></label>
            <input className={inputCls} placeholder="Paket başlığı" value={title} onChange={e => setTitle(e.target.value)} />
          </div>

          {/* Sipariş Bilgisi */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-3 space-y-3 bg-zinc-50 dark:bg-zinc-800/50">
            <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Sipariş Bilgisi</p>
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
          </div>

          {/* Adres Bilgisi */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-3 space-y-3 bg-zinc-50 dark:bg-zinc-800/50">
            <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" /> Adres Bilgisi
            </p>
            <div>
              <label className={labelCls}>Adres</label>
              <textarea className={`${inputCls} resize-none`} rows={2} placeholder="Sokak, mahalle, ilçe..." value={address} onChange={e => setAddress(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Şehir</label>
                <input className={inputCls} placeholder="İstanbul" value={city} onChange={e => setCity(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Ülke</label>
                <input className={inputCls} placeholder="TR" value={country} onChange={e => setCountry(e.target.value)} maxLength={5} />
              </div>
            </div>
          </div>

          {/* Paket İçeriği */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-3 space-y-3 bg-zinc-50 dark:bg-zinc-800/50">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Paket İçeriği</p>
              <button type="button" onClick={addItem}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg bg-teal-600 hover:bg-teal-700 text-white transition-colors">
                <Plus className="h-3 w-3" /> Ürün Ekle
              </button>
            </div>
            {items.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  className={`${inputCls} flex-[3]`}
                  placeholder="Ürün adı"
                  value={item.product_name}
                  onChange={e => updateItem(i, 'product_name', e.target.value)}
                />
                <input
                  type="number" min="0" step="0.01"
                  className={`${inputCls} flex-1`}
                  placeholder="Adet"
                  value={item.quantity}
                  onChange={e => updateItem(i, 'quantity', e.target.value)}
                />
                <input
                  className={`${inputCls} flex-1`}
                  placeholder="Birim"
                  value={item.unit}
                  onChange={e => updateItem(i, 'unit', e.target.value)}
                />
                {items.length > 1 && (
                  <button type="button" onClick={() => removeItem(i)} className="p-1.5 text-zinc-400 hover:text-red-600 transition-colors shrink-0">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Paket Detayları */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-3 space-y-3 bg-zinc-50 dark:bg-zinc-800/50">
            <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5">
              <Weight className="h-3.5 w-3.5" /> Paket Detayları
            </p>
            <div>
              <label className={labelCls}>Paket Tipi</label>
              <div className="flex flex-wrap gap-1.5">
                {PACKAGE_TYPE_OPTIONS.map(t => (
                  <button key={t} type="button" onClick={() => setPackageType(t)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      packageType === t
                        ? 'bg-teal-600 border-teal-600 text-white'
                        : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-teal-400'
                    }`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Paket Sayısı</label>
                <input type="number" min="0" className={inputCls} placeholder="1" value={itemCount} onChange={e => setItemCount(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Ağırlık (kg)</label>
                <input type="number" min="0" step="0.01" className={inputCls} placeholder="0.00" value={weight} onChange={e => setWeight(e.target.value)} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Boyutlar (En × Boy × Yükseklik cm)</label>
              <div className="grid grid-cols-3 gap-2">
                <input type="number" min="0" className={inputCls} placeholder="En" value={width} onChange={e => setWidth(e.target.value)} />
                <input type="number" min="0" className={inputCls} placeholder="Boy" value={height} onChange={e => setHeight(e.target.value)} />
                <input type="number" min="0" className={inputCls} placeholder="Yük." value={depth} onChange={e => setDepth(e.target.value)} />
              </div>
            </div>
            {desi != null && (
              <div className="rounded-lg bg-teal-50 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-800 px-3 py-2 text-xs flex items-center gap-2">
                <Barcode className="h-3.5 w-3.5 text-teal-600" />
                <span className="text-zinc-500">Hesaplanan Desi:</span>
                <strong className="text-zinc-900 dark:text-zinc-100">{desi} desi</strong>
                <span className="text-zinc-400">(kargo bedeli için)</span>
              </div>
            )}
          </div>

          {/* Kargo Bilgisi */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-3 space-y-3 bg-zinc-50 dark:bg-zinc-800/50">
            <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5">
              <Truck className="h-3.5 w-3.5" /> Kargo Bilgisi
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Kargo Firması</label>
                <select className={inputCls} value={shippingCompany} onChange={e => setShippingCompany(e.target.value)}>
                  <option value="">Seçiniz</option>
                  {SHIPPING_COMPANIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Takip Numarası</label>
                <input className={inputCls} placeholder="123456789" value={shippingTracking} onChange={e => setShippingTracking(e.target.value)} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Gönderim Tarihi</label>
              <input type="date" className={inputCls} value={shippingDate} onChange={e => setShippingDate(e.target.value)} />
            </div>
          </div>

          {/* Paketleyen + Departman */}
          {users.length > 0 && (
            <div>
              <label className={labelCls}>Paketleyen Kişi</label>
              <select className={inputCls} value={packedBy} onChange={e => setPackedBy(e.target.value)}>
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
            className="px-4 py-2 text-sm font-medium rounded-lg bg-teal-600 hover:bg-teal-700 text-white transition-colors disabled:opacity-60">
            {createMutation.isPending ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Returns Tab Section ──────────────────────────────────────────────────────

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

  const { user, roleLevel } = useAuthStore()
  const deptFilter = roleLevel === ROLE_LEVELS.DEPARTMENT_MANAGER && user?.department_id ? user.department_id : null

  const { data, isLoading } = useQuery({
    queryKey: ['ret-mgr-returns', page, search, statusChip, typeFilter, deptFilter],
    queryFn: () => {
      const params: Record<string, any> = { page: page + 1, per_page: 15 }
      if (search) params.search = search
      if (statusChip !== 'all') params.status = statusChip
      if (typeFilter !== 'all') params.type = typeFilter
      if (deptFilter) params.department_id = deptFilter
      return returnsService.list(params)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => returnsService.delete(id),
    onSuccess: () => {
      toast.success('İade kaydı silindi.')
      qc.invalidateQueries({ queryKey: ['ret-mgr-returns'] })
      qc.invalidateQueries({ queryKey: ['ret-mgr-stats'] })
      setDeleteId(null)
    },
    onError: (e: any) => toast.error(e?.message ?? 'Silinemedi.'),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => returnsService.updateStatus(id, status),
    onSuccess: () => {
      toast.success('Durum güncellendi.')
      qc.invalidateQueries({ queryKey: ['ret-mgr-returns'] })
      qc.invalidateQueries({ queryKey: ['ret-mgr-stats'] })
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
      cell: info => <StatusBadge status={info.getValue()} label={info.row.original.status_label} />,
    }),
    col.display({
      id: 'items_summary',
      header: 'İade Kalemleri',
      cell: info => {
        const items: any[] = info.row.original.items ?? []
        if (!items.length) return <span className="text-xs text-zinc-400">—</span>
        const shown = items.slice(0, 2)
        return (
          <div className="space-y-0.5 min-w-[120px]">
            {shown.map((it: any, i: number) => (
              <p key={i} className="text-xs text-zinc-600 dark:text-zinc-400 truncate max-w-[130px]">
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
        const badge = outcomeBadgeRtn(row.return_outcome ?? '')
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
      id: 'created_by',
      header: 'Oluşturan',
      cell: info => (
        <div className="flex items-center gap-1.5">
          <UserCircle className="h-4 w-4 text-zinc-400 shrink-0" />
          <span className="text-xs text-zinc-600 dark:text-zinc-400">
            {info.row.original.created_by?.name ?? '—'}
          </span>
        </div>
      ),
    }),
    col.accessor('created_at', {
      header: 'Tarih',
      cell: info => <span className="text-xs text-zinc-500">{formatDate(info.getValue())}</span>,
    }),
    col.display({
      id: 'actions',
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
        {RET_STATUS_CHIPS.map(chip => (
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
          onSuccess={() => qc.invalidateQueries({ queryKey: ['ret-mgr-returns'] })}
        />
      )}
    </div>
  )
}

// ─── Packaging Tab Section ────────────────────────────────────────────────────

interface PackagingTabSectionProps {
  departments: { id: string; name: string }[]
}

function PackagingTabSection({ departments }: PackagingTabSectionProps) {
  const qc = useQueryClient()
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [carrierFilter, setCarrierFilter] = useState('all')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const { user, roleLevel } = useAuthStore()
  const deptFilter = roleLevel === ROLE_LEVELS.DEPARTMENT_MANAGER && user?.department_id ? user.department_id : null

  const { data, isLoading } = useQuery({
    queryKey: ['ret-mgr-packaging', page, search, statusFilter, carrierFilter, deptFilter],
    queryFn: () => {
      const params: Record<string, any> = { page: page + 1, per_page: 15 }
      if (search) params.search = search
      if (statusFilter !== 'all') params.status = statusFilter
      if (carrierFilter !== 'all') params.shipping_company = carrierFilter
      if (deptFilter) params.department_id = deptFilter
      return packagingService.list(params)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => packagingService.delete(id),
    onSuccess: () => {
      toast.success('Paket kaydı silindi.')
      qc.invalidateQueries({ queryKey: ['ret-mgr-packaging'] })
      setDeleteId(null)
    },
    onError: (e: any) => toast.error(e?.message ?? 'Silinemedi.'),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => packagingService.updateStatus(id, status),
    onSuccess: () => {
      toast.success('Durum güncellendi.')
      qc.invalidateQueries({ queryKey: ['ret-mgr-packaging'] })
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
      id: 'order_customer',
      header: 'Sipariş / Müşteri',
      cell: info => {
        const row = info.row.original
        return (
          <div>
            {row.order_number && (
              <p className="text-xs font-mono text-teal-600 dark:text-teal-400">{row.order_number}</p>
            )}
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate max-w-[140px]">
              {row.customer_name ?? row.title}
            </p>
          </div>
        )
      },
    }),
    col.accessor('status', {
      header: 'Durum',
      cell: info => pkgStatusBadge(info.getValue(), info.row.original.status_label),
    }),
    col.display({
      id: 'items_summary',
      header: 'İçerik',
      cell: info => {
        const row = info.row.original
        const items: any[] = row.items ?? []
        if (items.length === 0) return <span className="text-zinc-400 text-xs">—</span>
        return (
          <div className="text-xs text-zinc-500 space-y-0.5">
            {items.slice(0, 2).map((it: any, i: number) => (
              <div key={i} className="truncate max-w-[120px]">
                {it.product_name} <span className="text-zinc-400">×{it.quantity}</span>
              </div>
            ))}
            {items.length > 2 && <div className="text-zinc-400">+{items.length - 2} daha</div>}
          </div>
        )
      },
    }),
    col.display({
      id: 'shipping',
      header: 'Kargo',
      cell: info => {
        const row = info.row.original
        if (!row.shipping_company && !row.shipping_tracking) return <span className="text-zinc-400 text-xs">—</span>
        return (
          <div className="text-xs">
            {row.shipping_company && (
              <div className="flex items-center gap-1 text-zinc-700 dark:text-zinc-300">
                <Truck className="h-3 w-3 text-zinc-400" />
                {row.shipping_company}
              </div>
            )}
            {row.shipping_tracking && (
              <div className="text-zinc-400 font-mono mt-0.5">{row.shipping_tracking}</div>
            )}
          </div>
        )
      },
    }),
    col.display({
      id: 'weight_desi',
      header: 'Ağırlık / Desi',
      cell: info => {
        const row = info.row.original
        if (!row.weight && !row.desi) return <span className="text-zinc-400 text-xs">—</span>
        return (
          <div className="text-xs text-zinc-500">
            {row.weight && <div>{row.weight} kg</div>}
            {row.desi && <div className="text-zinc-400">{row.desi} desi</div>}
          </div>
        )
      },
    }),
    col.display({
      id: 'city_packed',
      header: 'Şehir / Sorumlu',
      cell: info => {
        const row = info.row.original
        return (
          <div className="text-xs text-zinc-500">
            {row.city && <div className="flex items-center gap-1"><MapPin className="h-3 w-3" />{row.city}</div>}
            {(row.packed_by ?? row.created_by) && (
              <div className="flex items-center gap-1 mt-0.5 text-zinc-400">
                <UserCircle className="h-3 w-3" />
                {(row.packed_by ?? row.created_by)?.name}
              </div>
            )}
          </div>
        )
      },
    }),
    col.accessor('created_at', {
      header: 'Tarih',
      cell: info => <span className="text-xs text-zinc-500">{formatDate(info.getValue())}</span>,
    }),
    col.display({
      id: 'actions',
      header: '',
      cell: info => {
        const row = info.row.original
        return (
          <div className="flex items-center gap-1">
            {row.status === 'pending' && (
              <button title="Paketleniyor" onClick={() => statusMutation.mutate({ id: row.id, status: 'in_progress' })}
                className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 text-zinc-400 hover:text-blue-600 transition-colors">
                <Clock className="h-4 w-4" />
              </button>
            )}
            {row.status === 'in_progress' && (
              <button title="Hazır" onClick={() => statusMutation.mutate({ id: row.id, status: 'approved' })}
                className="p-1.5 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-950/30 text-zinc-400 hover:text-purple-600 transition-colors">
                <Package className="h-4 w-4" />
              </button>
            )}
            {row.status === 'approved' && (
              <button title="Kargoya Verildi" onClick={() => statusMutation.mutate({ id: row.id, status: 'completed' })}
                className="p-1.5 rounded-lg hover:bg-green-50 dark:hover:bg-green-950/30 text-zinc-400 hover:text-green-600 transition-colors">
                <Truck className="h-4 w-4" />
              </button>
            )}
            {row.status !== 'completed' && row.status !== 'cancelled' && (
              <button title="İptal Et" onClick={() => statusMutation.mutate({ id: row.id, status: 'cancelled' })}
                className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-zinc-400 hover:text-red-600 transition-colors">
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
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Sipariş no, müşteri, takip no ara..."
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-teal-500 placeholder:text-zinc-400"
          />
        </form>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
        >
          <Plus className="h-4 w-4" />
          Yeni Paket
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {PKG_STATUS_CHIPS.map(chip => (
          <button key={chip.id} onClick={() => { setStatusFilter(chip.id); setPage(0) }}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
              statusFilter === chip.id
                ? 'bg-teal-600 border-teal-600 text-white'
                : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-teal-400 hover:text-teal-600'
            }`}>
            {chip.label}
          </button>
        ))}
        <select value={carrierFilter} onChange={e => { setCarrierFilter(e.target.value); setPage(0) }}
          className="px-3 py-1.5 text-xs font-medium rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 focus:outline-none focus:border-teal-400 cursor-pointer">
          <option value="all">Tüm Kargo Firmaları</option>
          {SHIPPING_COMPANIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        total={data?.meta?.total ?? 0}
        pageIndex={page}
        onPaginationChange={s => setPage(s.pageIndex)}
        isLoading={isLoading}
        emptyMessage="Henüz paket kaydı yok."
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
        <PackagingCreateModal
          onClose={() => setShowCreate(false)}
          departments={departments}
          onSuccess={() => qc.invalidateQueries({ queryKey: ['ret-mgr-packaging'] })}
        />
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReturnsManagerPage() {
  const [activeTab, setActiveTab] = useState('iade')

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['ret-mgr-stats'],
    queryFn: () => get<any>('/dashboard/module/returns').then(r => r.data),
  })

  const { data: pkgStatsData, isLoading: pkgStatsLoading } = useQuery({
    queryKey: ['ret-mgr-pkg-stats'],
    queryFn: () => get<any>('/dashboard/module/packaging').then(r => r.data),
  })

  const { data: deptData } = useQuery({
    queryKey: ['company-departments-list'],
    queryFn: () => get<any>('/company/departments').then(r => r.data ?? []),
  })
  const departments: { id: string; name: string }[] = deptData ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        title="İade & Paketleme Müdürü"
        description="İade süreçleri ve paketleme yönetimi"
        breadcrumbs={[{ label: 'Modüller' }, { label: 'İade & Paketleme Müdürü' }]}
      />

      {/* İade Stats */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider px-0.5">İade</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard
            title="Toplam İade"
            value={statsData?.total ?? 0}
            icon={RotateCcw}
            color="orange"
            loading={statsLoading}
          />
          <StatsCard
            title="Bekleyen İade"
            value={statsData?.pending ?? 0}
            icon={AlertCircle}
            color="red"
            loading={statsLoading}
          />
          <StatsCard
            title="Onaylanan"
            value={statsData?.completed ?? 0}
            icon={CheckCircle2}
            color="green"
            loading={statsLoading}
          />
          <StatsCard
            title="İşlemdeki"
            value={statsData?.in_progress ?? 0}
            icon={Clock}
            color="blue"
            loading={statsLoading}
          />
        </div>
      </div>

      {/* Paketleme Stats */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider px-0.5">Paketleme</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard
            title="Toplam Paket"
            value={pkgStatsData?.total ?? 0}
            icon={Package}
            color="teal"
            loading={pkgStatsLoading}
          />
          <StatsCard
            title="Bekliyor"
            value={pkgStatsData?.pending ?? 0}
            icon={AlertCircle}
            color="orange"
            loading={pkgStatsLoading}
          />
          <StatsCard
            title="Paketleniyor"
            value={pkgStatsData?.in_progress ?? 0}
            icon={Clock}
            color="blue"
            loading={pkgStatsLoading}
          />
          <StatsCard
            title="Kargoya Verildi"
            value={pkgStatsData?.completed ?? 0}
            icon={Truck}
            color="green"
            loading={pkgStatsLoading}
          />
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
          {activeTab === 'iade' && (
            <ReturnsTabSection departments={departments} />
          )}
          {activeTab === 'paketleme' && (
            <PackagingTabSection departments={departments} />
          )}
        </div>
      </div>
    </div>
  )
}
