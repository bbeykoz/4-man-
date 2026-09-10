'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Package, Plus, Trash2, Search, X,
  Truck, CheckCircle2, Clock, Ban, UserCircle,
  AlertCircle, MapPin, Barcode, Weight,
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

const packagingService = createRecordService('packaging')

const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-teal-500'
const labelCls = 'block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1'

const PACKAGE_TYPE_OPTIONS = ['Koli', 'Palet', 'Zarf', 'Poşet', 'Tahta Kasa', 'Özel']

const SHIPPING_COMPANIES = [
  'Yurtiçi Kargo', 'Aras Kargo', 'MNG Kargo', 'Sürat Kargo',
  'PTT Kargo', 'UPS', 'DHL', 'FedEx', 'Diğer',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(status: string, label?: string) {
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

// ─── Create Modal ─────────────────────────────────────────────────────────────

interface PackagingItem { product_name: string; quantity: string; unit: string }

interface CreateModalProps {
  onClose: () => void
  departments: { id: string; name: string }[]
  onSuccess: () => void
}

function PackagingCreateModal({ onClose, departments, onSuccess }: CreateModalProps) {
  const [title, setTitle]                   = useState('')
  const [priority, setPriority]             = useState('medium')
  const [status, setStatus]                 = useState('pending')
  const [orderNumber, setOrderNumber]       = useState('')
  const [customerName, setCustomerName]     = useState('')
  const [address, setAddress]               = useState('')
  const [city, setCity]                     = useState('')
  const [country, setCountry]               = useState('TR')
  const [packageType, setPackageType]       = useState('')
  const [itemCount, setItemCount]           = useState('')
  const [weight, setWeight]                 = useState('')
  const [width, setWidth]                   = useState('')
  const [height, setHeight]                 = useState('')
  const [depth, setDepth]                   = useState('')
  const [shippingCompany, setShippingCompany] = useState('')
  const [shippingTracking, setShippingTracking] = useState('')
  const [shippingDate, setShippingDate]     = useState('')
  const [packedBy, setPackedBy]             = useState('')
  const [departmentId, setDepartmentId]     = useState('')
  const [description, setDescription]       = useState('')
  const [items, setItems]                   = useState<PackagingItem[]>([{ product_name: '', quantity: '', unit: 'adet' }])

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
                  type="number"
                  min="0"
                  step="0.01"
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

          {/* Sorumlu + Departman */}
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PackagingPage() {
  const qc = useQueryClient()
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [carrierFilter, setCarrierFilter] = useState('all')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const statusChips = [
    { id: 'all',         label: 'Tümü' },
    { id: 'pending',     label: 'Bekliyor' },
    { id: 'in_progress', label: 'Paketleniyor' },
    { id: 'approved',    label: 'Hazır' },
    { id: 'completed',   label: 'Kargoya Verildi' },
    { id: 'cancelled',   label: 'İptal' },
  ]

  const { user, roleLevel } = useAuthStore()
  const deptFilter = roleLevel === ROLE_LEVELS.DEPARTMENT_MANAGER && user?.department_id ? user.department_id : null

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['packaging-stats'],
    queryFn: () => get<any>('/dashboard/module/packaging').then(r => r.data),
  })

  const { data: deptData } = useQuery({
    queryKey: ['company-departments-list'],
    queryFn: () => get<any>('/company/departments').then(r => r.data ?? []),
  })
  const departments: { id: string; name: string }[] = deptData ?? []

  const { data, isLoading } = useQuery({
    queryKey: ['packaging-list', page, search, statusFilter, carrierFilter, deptFilter],
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
      toast.success('Kayıt silindi.')
      qc.invalidateQueries({ queryKey: ['packaging-list'] })
      qc.invalidateQueries({ queryKey: ['packaging-stats'] })
      setDeleteId(null)
    },
    onError: (e: any) => toast.error(e?.message ?? 'Silinemedi.'),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => packagingService.updateStatus(id, status),
    onSuccess: () => {
      toast.success('Durum güncellendi.')
      qc.invalidateQueries({ queryKey: ['packaging-list'] })
      qc.invalidateQueries({ queryKey: ['packaging-stats'] })
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
      cell: info => statusBadge(info.getValue(), info.row.original.status_label),
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
    <div className="space-y-6">
      <PageHeader
        title="Paketleme"
        description="Sipariş paketleme ve kargo yönetimi"
        breadcrumbs={[{ label: 'Modüller' }, { label: 'Paketleme' }]}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title="Toplam" value={statsData?.total ?? 0} icon={Package} color="teal" loading={statsLoading} />
        <StatsCard title="Bekliyor" value={statsData?.pending ?? 0} icon={AlertCircle} color="orange" loading={statsLoading} />
        <StatsCard title="Paketleniyor" value={statsData?.in_progress ?? 0} icon={Clock} color="blue" loading={statsLoading} />
        <StatsCard title="Kargoya Verildi" value={statsData?.completed ?? 0} icon={Truck} color="green" loading={statsLoading} />
      </div>

      {/* Table card */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
        <div className="p-5 space-y-4">

          {/* Search + New */}
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
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap">
              <Plus className="h-4 w-4" />
              Yeni Paket
            </button>
          </div>

          {/* Durum filtresi */}
          <div className="flex flex-wrap items-center gap-2">
            {statusChips.map(chip => (
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
        <PackagingCreateModal
          onClose={() => setShowCreate(false)}
          departments={departments}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['packaging-list'] })
            qc.invalidateQueries({ queryKey: ['packaging-stats'] })
          }}
        />
      )}
    </div>
  )
}
