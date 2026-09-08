'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Truck, Globe, Plus, Trash2, Search, X,
  CheckCircle2, Clock, Ban,
  XCircle, PackageCheck, Minus,
  Plane, Anchor, Navigation, MapPin,
  FileText, AlertCircle, Ship,
} from 'lucide-react'
import { useMemo } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/common/PageHeader'
import { StatsCard } from '@/components/common/StatsCard'
import { DataTable } from '@/components/common/DataTable'
import { ConfirmModal } from '@/components/common/ConfirmModal'

import { createRecordService } from '@/services/record.service'
import { get } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { PRIORITY_OPTIONS, ROLE_LEVELS } from '@/lib/constants'
import { useAuthStore } from '@/store/auth.store'
import { createColumnHelper } from '@tanstack/react-table'

// ─── Constants ────────────────────────────────────────────────────────────────

const shippingService = createRecordService('shipping')
const customsService = createRecordService('customs')

const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelCls = 'block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1'

const SHIPPING_TYPE_OPTIONS = [
  { value: 'delivery', label: 'Teslimat' },
  { value: 'pickup',   label: 'Teslim Alma' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'express',  label: 'Ekspres' },
]

const CUSTOMS_TYPE_OPTIONS = [
  { value: 'import',    label: 'İthalat' },
  { value: 'export',    label: 'İhracat' },
  { value: 'transit',   label: 'Transit' },
  { value: 'temporary', label: 'Geçici' },
]


const TRANSPORT_MODE_OPTIONS = [
  { value: 'road', label: 'Kara' },
  { value: 'air',  label: 'Hava' },
  { value: 'sea',  label: 'Deniz' },
  { value: 'rail', label: 'Demiryolu' },
]

const CARRIER_OPTIONS_MGR = [
  'Yurtiçi Kargo', 'Aras Kargo', 'MNG Kargo', 'PTT Kargo',
  'Sürat Kargo', 'UPS', 'DHL', 'FedEx', 'DPD', 'Özel Araç',
]

const TRANSPORT_TYPE_OPTIONS = [
  { value: 'sea',  label: 'Deniz Yolu' },
  { value: 'air',  label: 'Hava Yolu' },
  { value: 'road', label: 'Kara Yolu' },
  { value: 'rail', label: 'Demiryolu' },
]

const INCOTERMS_OPTIONS = ['EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP']

const CUSTOMS_CURRENCY_OPTIONS = ['USD', 'EUR', 'TRY', 'GBP', 'CNY', 'AED', 'JPY']

const UNIT_OPTIONS_CST = ['adet', 'kg', 'ton', 'litre', 'metreküp', 'koli', 'palet', 'konteyner']

const CST_STATUS_CHIPS = [
  { id: 'all',       label: 'Tümü' },
  { id: 'draft',     label: 'Hazırlanıyor' },
  { id: 'submitted', label: 'Beyan Verildi' },
  { id: 'in_review', label: 'İncelemede' },
  { id: 'approved',  label: 'Onaylandı' },
  { id: 'rejected',  label: 'Reddedildi' },
  { id: 'completed', label: 'Tamamlandı' },
]

interface CustomsItem {
  product_name: string
  hs_code: string
  quantity: string
  unit: string
  unit_price: string
}

const SHIP_STATUS_CHIPS = [
  { id: 'all',        label: 'Tümü' },
  { id: 'pending',    label: 'Bekliyor' },
  { id: 'confirmed',  label: 'Onaylandı' },
  { id: 'in_transit', label: 'Yolda' },
  { id: 'delivered',  label: 'Teslim Edildi' },
  { id: 'failed',     label: 'Başarısız' },
  { id: 'cancelled',  label: 'İptal' },
]

const sectionClsShp = 'rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30 p-4 space-y-3'

function shipStatusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    pending:    { label: 'Bekliyor',       cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
    confirmed:  { label: 'Onaylandı',      cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
    in_transit: { label: 'Yolda',          cls: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400' },
    delivered:  { label: 'Teslim Edildi',  cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' },
    failed:     { label: 'Başarısız',      cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
    cancelled:  { label: 'İptal',          cls: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400' },
  }
  const entry = map[status] ?? { label: status, cls: 'bg-zinc-100 text-zinc-700' }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${entry.cls}`}>
      {entry.label}
    </span>
  )
}

function transportIconMgr(mode: string) {
  const icons: Record<string, React.ReactNode> = {
    road: <Truck className="h-3.5 w-3.5" />,
    air:  <Plane className="h-3.5 w-3.5" />,
    sea:  <Anchor className="h-3.5 w-3.5" />,
    rail: <Navigation className="h-3.5 w-3.5" />,
  }
  const labels: Record<string, string> = { road: 'Kara', air: 'Hava', sea: 'Deniz', rail: 'Demiryolu' }
  if (!mode) return null
  return (
    <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
      {icons[mode]}{labels[mode] ?? mode}
    </span>
  )
}

interface ShippingItemMgr { name: string; quantity: string; weight: string; volume: string }

const TABS = [
  { id: 'nakliye',    label: 'Nakliye',     icon: Truck },
  { id: 'gumrukleme', label: 'Gümrükleme',  icon: Globe },
]

function shippingTypeBadge(type: string) {
  const map: Record<string, { label: string; cls: string }> = {
    delivery: { label: 'Teslimat',    cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
    pickup:   { label: 'Teslim Alma', cls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
    transfer: { label: 'Transfer',    cls: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' },
    express:  { label: 'Ekspres',     cls: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
  }
  const entry = map[type] ?? { label: 'Diğer', cls: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400' }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${entry.cls}`}>
      {entry.label}
    </span>
  )
}

function customsTypeBadge(type: string) {
  const map: Record<string, { label: string; cls: string }> = {
    import:    { label: 'İthalat', cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
    export:    { label: 'İhracat', cls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
    transit:   { label: 'Transit', cls: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
    temporary: { label: 'Geçici',  cls: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' },
  }
  const entry = map[type] ?? { label: 'Diğer', cls: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400' }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${entry.cls}`}>
      {entry.label}
    </span>
  )
}

function customsStatusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    draft:     { label: 'Hazırlanıyor',  cls: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400' },
    submitted: { label: 'Beyan Verildi', cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
    in_review: { label: 'İncelemede',    cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
    approved:  { label: 'Onaylandı',     cls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
    rejected:  { label: 'Reddedildi',    cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
    completed: { label: 'Tamamlandı',    cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' },
  }
  const entry = map[status] ?? { label: status, cls: 'bg-zinc-100 text-zinc-700' }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${entry.cls}`}>
      {entry.label}
    </span>
  )
}

function cstTransportIcon(type: string) {
  const icons: Record<string, React.ReactNode> = {
    sea:  <Anchor className="h-3.5 w-3.5" />,
    air:  <Plane className="h-3.5 w-3.5" />,
    road: <Truck className="h-3.5 w-3.5" />,
    rail: <Ship className="h-3.5 w-3.5" />,
  }
  const labels: Record<string, string> = { sea: 'Deniz', air: 'Hava', road: 'Kara', rail: 'Demiryolu' }
  if (!type) return null
  return (
    <span className="inline-flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400">
      {icons[type]}
      {labels[type] ?? type}
    </span>
  )
}

// ─── Shipping Create Modal ────────────────────────────────────────────────────

interface ShippingCreateModalProps {
  onClose: () => void
  departments: { id: string; name: string }[]
  onSuccess: () => void
}

function ShippingCreateModal({ onClose, departments, onSuccess }: ShippingCreateModalProps) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState('delivery')
  const [status, setStatus] = useState('pending')
  const [priority, setPriority] = useState('medium')
  const [orderNumber, setOrderNumber] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [trackingNumber, setTrackingNumber] = useState('')
  const [transportMode, setTransportMode] = useState('road')
  const [carrier, setCarrier] = useState('')
  const [vehiclePlate, setVehiclePlate] = useState('')
  const [driverName, setDriverName] = useState('')
  const [recipientName, setRecipientName] = useState('')
  const [recipientPhone, setRecipientPhone] = useState('')
  const [originAddress, setOriginAddress] = useState('')
  const [destinationAddress, setDestinationAddress] = useState('')
  const [items, setItems] = useState<ShippingItemMgr[]>([{ name: '', quantity: '1', weight: '', volume: '' }])
  const [palletCount, setPalletCount] = useState('')
  const [weight, setWeight] = useState('')
  const [departureDate, setDepartureDate] = useState('')
  const [estimatedDelivery, setEstimatedDelivery] = useState('')
  const [shippingCost, setShippingCost] = useState('')
  const [fuelCost, setFuelCost] = useState('')
  const [driverCost, setDriverCost] = useState('')
  const [extraCost, setExtraCost] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [description, setDescription] = useState('')

  const totalCost = useMemo(() =>
    (parseFloat(shippingCost) || 0) + (parseFloat(fuelCost) || 0) +
    (parseFloat(driverCost) || 0) + (parseFloat(extraCost) || 0),
    [shippingCost, fuelCost, driverCost, extraCost]
  )

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, any>) => shippingService.create(payload),
    onSuccess: () => {
      toast.success('Nakliye kaydı oluşturuldu.')
      onSuccess()
      onClose()
    },
    onError: (e: any) => toast.error(e?.message ?? 'Kayıt oluşturulamadı.'),
  })

  const addItem = () => setItems(prev => [...prev, { name: '', quantity: '1', weight: '', volume: '' }])
  const removeItem = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i))
  const updateItem = (i: number, field: keyof ShippingItemMgr, val: string) =>
    setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: val } : item))

  const handleSubmit = () => {
    if (!title.trim()) { toast.error('Başlık zorunludur.'); return }
    const validItems = items.filter(it => it.name.trim())
    const payload: Record<string, any> = { title, status, priority, type, transport_mode: transportMode }
    if (orderNumber) payload.order_number = orderNumber
    if (customerName) payload.customer_name = customerName
    if (trackingNumber) payload.tracking_number = trackingNumber
    if (carrier) payload.carrier = carrier
    if (vehiclePlate) payload.vehicle_plate = vehiclePlate
    if (driverName) payload.driver_name = driverName
    if (recipientName) payload.recipient_name = recipientName
    if (recipientPhone) payload.recipient_phone = recipientPhone
    if (originAddress) payload.origin_address = originAddress
    if (destinationAddress) payload.destination_address = destinationAddress
    if (validItems.length > 0) payload.items = validItems
    if (palletCount) payload.pallet_count = parseInt(palletCount)
    if (weight) payload.weight = parseFloat(weight)
    if (departureDate) payload.departure_date = departureDate
    if (estimatedDelivery) payload.estimated_delivery = estimatedDelivery
    if (shippingCost) payload.shipping_cost = parseFloat(shippingCost)
    if (fuelCost) payload.fuel_cost = parseFloat(fuelCost)
    if (driverCost) payload.driver_cost = parseFloat(driverCost)
    if (extraCost) payload.extra_cost = parseFloat(extraCost)
    if (departmentId) payload.department_id = departmentId
    if (description) payload.description = description
    createMutation.mutate(payload)
  }

  const STATUS_OPTS = [
    { value: 'pending',   label: 'Bekliyor' },
    { value: 'confirmed', label: 'Onaylandı' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 bg-white dark:bg-zinc-900 z-10">
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-sky-500" />
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Yeni Nakliye Kaydı</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className={sectionClsShp}>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Durum & Öncelik</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Durum</label>
                <div className="flex flex-wrap gap-2">
                  {STATUS_OPTS.map(o => (
                    <button key={o.value} type="button" onClick={() => setStatus(o.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${status === o.value ? 'bg-sky-600 border-sky-600 text-white' : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-sky-400'}`}>
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
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${priority === o.value ? 'bg-sky-600 border-sky-600 text-white' : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-sky-400'}`}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className={labelCls}>Başlık <span className="text-red-500">*</span></label>
            <input className={inputCls} placeholder="Nakliye kaydı başlığı" value={title} onChange={e => setTitle(e.target.value)} />
          </div>

          <div className={sectionClsShp}>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Sipariş & Müşteri</p>
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
              <label className={labelCls}>Takip Numarası</label>
              <input className={inputCls} placeholder="TRK-2024-001" value={trackingNumber} onChange={e => setTrackingNumber(e.target.value)} />
            </div>
          </div>

          <div className={sectionClsShp}>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Taşıma & Araç</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Nakliye Türü</label>
                <div className="grid grid-cols-2 gap-2">
                  {SHIPPING_TYPE_OPTIONS.map(o => (
                    <button key={o.value} type="button" onClick={() => setType(o.value)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium border text-center transition-colors ${type === o.value ? 'bg-sky-600 border-sky-600 text-white' : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-sky-400'}`}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelCls}>Taşıma Modu</label>
                <div className="grid grid-cols-2 gap-2">
                  {TRANSPORT_MODE_OPTIONS.map(o => (
                    <button key={o.value} type="button" onClick={() => setTransportMode(o.value)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium border text-center transition-colors ${transportMode === o.value ? 'bg-sky-600 border-sky-600 text-white' : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-sky-400'}`}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <label className={labelCls}>Taşıyıcı Firma</label>
              <select className={inputCls} value={carrier} onChange={e => setCarrier(e.target.value)}>
                <option value="">Seçiniz</option>
                {CARRIER_OPTIONS_MGR.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{transportMode === 'road' ? 'Araç Plakası' : 'Sefer / Uçuş No'}</label>
                <input className={inputCls} placeholder={transportMode === 'road' ? '34 ABC 1234' : 'TK-1234'} value={vehiclePlate} onChange={e => setVehiclePlate(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Sürücü / Sorumlu</label>
                <input className={inputCls} placeholder="Ad Soyad" value={driverName} onChange={e => setDriverName(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Teslim Alacak Kişi</label>
                <input className={inputCls} placeholder="Ad Soyad" value={recipientName} onChange={e => setRecipientName(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Telefon</label>
                <input className={inputCls} placeholder="0532 xxx xx xx" value={recipientPhone} onChange={e => setRecipientPhone(e.target.value)} />
              </div>
            </div>
          </div>

          <div className={sectionClsShp}>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Güzergah</p>
            <div>
              <label className={labelCls}>Çıkış Adresi</label>
              <input className={inputCls} placeholder="Gönderim noktası" value={originAddress} onChange={e => setOriginAddress(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Varış Adresi</label>
              <input className={inputCls} placeholder="Teslimat noktası" value={destinationAddress} onChange={e => setDestinationAddress(e.target.value)} />
            </div>
          </div>

          <div className={sectionClsShp}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Yük Detayı</p>
              <button type="button" onClick={addItem}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400 hover:bg-sky-100 dark:hover:bg-sky-900/30 transition-colors border border-sky-200 dark:border-sky-800">
                <Plus className="h-3 w-3" /> Kalem Ekle
              </button>
            </div>
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-start p-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800">
                  <div className="col-span-4">
                    {i === 0 && <p className="text-[10px] text-zinc-400 mb-1">Paket / Ürün Adı</p>}
                    <input className={inputCls} placeholder="Paket adı" value={item.name} onChange={e => updateItem(i, 'name', e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    {i === 0 && <p className="text-[10px] text-zinc-400 mb-1">Adet</p>}
                    <input type="number" min="1" className={inputCls} placeholder="1" value={item.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    {i === 0 && <p className="text-[10px] text-zinc-400 mb-1">Ağırlık (kg)</p>}
                    <input type="number" min="0" step="0.1" className={inputCls} placeholder="0.0" value={item.weight} onChange={e => updateItem(i, 'weight', e.target.value)} />
                  </div>
                  <div className="col-span-3">
                    {i === 0 && <p className="text-[10px] text-zinc-400 mb-1">Hacim (desi)</p>}
                    <input type="number" min="0" step="0.1" className={inputCls} placeholder="0.0" value={item.volume} onChange={e => updateItem(i, 'volume', e.target.value)} />
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Toplam Ağırlık (kg)</label>
                <input type="number" min="0" step="0.01" className={inputCls} placeholder="0.00" value={weight} onChange={e => setWeight(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Palet Sayısı</label>
                <input type="number" min="0" className={inputCls} placeholder="0" value={palletCount} onChange={e => setPalletCount(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Çıkış Tarihi</label>
              <input type="date" className={inputCls} value={departureDate} onChange={e => setDepartureDate(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Tahmini Teslimat</label>
              <input type="date" className={inputCls} value={estimatedDelivery} onChange={e => setEstimatedDelivery(e.target.value)} />
            </div>
          </div>

          <div className={sectionClsShp}>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Maliyet</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Kargo Ücreti (₺)</label>
                <input type="number" min="0" step="0.01" className={inputCls} placeholder="0.00" value={shippingCost} onChange={e => setShippingCost(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Yakıt Maliyeti (₺)</label>
                <input type="number" min="0" step="0.01" className={inputCls} placeholder="0.00" value={fuelCost} onChange={e => setFuelCost(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Sürücü Ücreti (₺)</label>
                <input type="number" min="0" step="0.01" className={inputCls} placeholder="0.00" value={driverCost} onChange={e => setDriverCost(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Ek Masraf (₺)</label>
                <input type="number" min="0" step="0.01" className={inputCls} placeholder="0.00" value={extraCost} onChange={e => setExtraCost(e.target.value)} />
              </div>
            </div>
            {totalCost > 0 && (
              <div className="flex justify-end">
                <p className="text-xs font-semibold text-sky-600">Toplam: ₺{totalCost.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</p>
              </div>
            )}
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
            <textarea className={`${inputCls} resize-none`} rows={3} placeholder="İsteğe bağlı notlar..." value={description} onChange={e => setDescription(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-5 pb-5 sticky bottom-0 bg-white dark:bg-zinc-900 border-t border-zinc-100 dark:border-zinc-800 pt-3">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
            İptal
          </button>
          <button onClick={handleSubmit} disabled={createMutation.isPending}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-sky-600 hover:bg-sky-700 text-white transition-colors disabled:opacity-60">
            {createMutation.isPending ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Customs Create Modal ─────────────────────────────────────────────────────

interface CustomsCreateModalProps {
  onClose: () => void
  departments: { id: string; name: string }[]
  onSuccess: () => void
}

function CustomsCreateModal({ onClose, departments, onSuccess }: CustomsCreateModalProps) {
  const [title, setTitle]                       = useState('')
  const [type, setType]                         = useState('')
  const [status, setStatus]                     = useState('draft')
  const [priority, setPriority]                 = useState('medium')
  const [declarationNumber, setDeclarationNumber] = useState('')
  const [blNumber, setBlNumber]                 = useState('')
  const [companyName, setCompanyName]           = useState('')
  const [taxNumber, setTaxNumber]               = useState('')
  const [customsAgent, setCustomsAgent]         = useState('')
  const [transportType, setTransportType]       = useState('')
  const [originCountry, setOriginCountry]       = useState('')
  const [destinationCountry, setDestinationCountry] = useState('')
  const [countryOfOrigin, setCountryOfOrigin]   = useState('')
  const [portOfEntry, setPortOfEntry]           = useState('')
  const [carrierName, setCarrierName]           = useState('')
  const [containerNumber, setContainerNumber]   = useState('')
  const [vehiclePlate, setVehiclePlate]         = useState('')
  const [incoterms, setIncoterms]               = useState('')
  const [items, setItems]                       = useState<CustomsItem[]>([{ product_name: '', hs_code: '', quantity: '', unit: 'adet', unit_price: '' }])
  const [currency, setCurrency]                 = useState('USD')
  const [declaredValue, setDeclaredValue]       = useState('')
  const [exchangeRate, setExchangeRate]         = useState('')
  const [customsDuty, setCustomsDuty]           = useState('')
  const [vatAmount, setVatAmount]               = useState('')
  const [otherTaxes, setOtherTaxes]             = useState('')
  const [netWeight, setNetWeight]               = useState('')
  const [grossWeight, setGrossWeight]           = useState('')
  const [expectedDate, setExpectedDate]         = useState('')
  const [departmentId, setDepartmentId]         = useState('')
  const [description, setDescription]           = useState('')

  const itemsTotal = useMemo(() => items.reduce((sum, it) => {
    return sum + (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0)
  }, 0), [items])

  const totalTax = useMemo(() =>
    (parseFloat(customsDuty) || 0) + (parseFloat(vatAmount) || 0) + (parseFloat(otherTaxes) || 0)
  , [customsDuty, vatAmount, otherTaxes])

  const tlEquivalent = useMemo(() => {
    const val = parseFloat(declaredValue) || itemsTotal
    const rate = parseFloat(exchangeRate) || 0
    if (currency === 'TRY' || !rate) return null
    return val * rate
  }, [declaredValue, itemsTotal, exchangeRate, currency])

  const addItem = () => setItems(prev => [...prev, { product_name: '', hs_code: '', quantity: '', unit: 'adet', unit_price: '' }])
  const removeItem = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i))
  const updateItem = (i: number, field: keyof CustomsItem, val: string) =>
    setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: val } : item))

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, any>) => customsService.create(payload),
    onSuccess: () => { toast.success('Gümrük kaydı oluşturuldu.'); onSuccess(); onClose() },
    onError: (e: any) => toast.error(e?.message ?? 'Kayıt oluşturulamadı.'),
  })

  const handleSubmit = () => {
    if (!title.trim()) { toast.error('Başlık zorunludur.'); return }
    const validItems = items.filter(it => it.product_name.trim())
    const payload: Record<string, any> = { title, status, priority, currency }
    if (type) payload.type = type
    if (declarationNumber) payload.declaration_number = declarationNumber
    if (blNumber) payload.bl_number = blNumber
    if (companyName) payload.company_name = companyName
    if (taxNumber) payload.tax_number = taxNumber
    if (customsAgent) payload.customs_agent = customsAgent
    if (transportType) payload.transport_type = transportType
    if (originCountry) payload.origin_country = originCountry
    if (destinationCountry) payload.destination_country = destinationCountry
    if (countryOfOrigin) payload.country_of_origin = countryOfOrigin
    if (portOfEntry) payload.port_of_entry = portOfEntry
    if (carrierName) payload.carrier_name = carrierName
    if (containerNumber) payload.container_number = containerNumber
    if (vehiclePlate) payload.vehicle_plate = vehiclePlate
    if (incoterms) payload.incoterms = incoterms
    if (validItems.length > 0) payload.items = validItems
    if (declaredValue) payload.declared_value = parseFloat(declaredValue)
    else if (itemsTotal > 0) payload.declared_value = itemsTotal
    if (exchangeRate) payload.exchange_rate = parseFloat(exchangeRate)
    if (customsDuty) payload.customs_duty = parseFloat(customsDuty)
    if (vatAmount) payload.vat_amount = parseFloat(vatAmount)
    if (otherTaxes) payload.other_taxes = parseFloat(otherTaxes)
    if (netWeight) payload.net_weight = parseFloat(netWeight)
    if (grossWeight) payload.gross_weight = parseFloat(grossWeight)
    if (expectedDate) payload.expected_date = expectedDate
    if (departmentId) payload.department_id = departmentId
    if (description) payload.description = description
    createMutation.mutate(payload)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 bg-white dark:bg-zinc-900 z-10">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-indigo-500" />
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Yeni Gümrük Beyanı</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* 1. Durum / Öncelik */}
          <div className={sectionClsShp}>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Durum & Öncelik</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Durum</label>
                <div className="flex flex-wrap gap-2">
                  {[{ value: 'draft', label: 'Hazırlanıyor' }, { value: 'submitted', label: 'Beyan Verildi' }].map(o => (
                    <button key={o.value} type="button" onClick={() => setStatus(o.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${status === o.value ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-indigo-400'}`}>
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
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${priority === o.value ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-indigo-400'}`}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 2. Başlık */}
          <div>
            <label className={labelCls}>Başlık <span className="text-red-500">*</span></label>
            <input className={inputCls} placeholder="Gümrük beyanı başlığı" value={title} onChange={e => setTitle(e.target.value)} />
          </div>

          {/* 3. Beyan Bilgisi */}
          <div className={sectionClsShp}>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Beyan Bilgisi</p>
            <div>
              <label className={labelCls}>Beyan Türü</label>
              <div className="grid grid-cols-4 gap-2">
                {CUSTOMS_TYPE_OPTIONS.map(o => (
                  <button key={o.value} type="button" onClick={() => setType(prev => prev === o.value ? '' : o.value)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium border text-center transition-colors ${type === o.value ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-indigo-400'}`}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Beyan Numarası</label>
                <input className={inputCls} placeholder="BYN-2024-001" value={declarationNumber} onChange={e => setDeclarationNumber(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Konşimento No (BL)</label>
                <input className={inputCls} placeholder="MSCUXX123456" value={blNumber} onChange={e => setBlNumber(e.target.value)} />
              </div>
            </div>
          </div>

          {/* 4. Firma Bilgisi */}
          <div className={sectionClsShp}>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Firma Bilgisi</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Firma Adı</label>
                <input className={inputCls} placeholder="İthalatçı / İhracatçı firma" value={companyName} onChange={e => setCompanyName(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Vergi No</label>
                <input className={inputCls} placeholder="1234567890" value={taxNumber} onChange={e => setTaxNumber(e.target.value)} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Gümrük Müşaviri</label>
              <input className={inputCls} placeholder="Müşavir adı veya firması" value={customsAgent} onChange={e => setCustomsAgent(e.target.value)} />
            </div>
          </div>

          {/* 5. Güzergah & Taşıma */}
          <div className={sectionClsShp}>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Güzergah & Taşıma</p>
            <div>
              <label className={labelCls}>Taşıma Türü</label>
              <div className="grid grid-cols-4 gap-2">
                {TRANSPORT_TYPE_OPTIONS.map(o => (
                  <button key={o.value} type="button" onClick={() => setTransportType(prev => prev === o.value ? '' : o.value)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium border text-center transition-colors ${transportType === o.value ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-indigo-400'}`}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Çıkış Ülkesi</label>
                <input className={inputCls} placeholder="Çin, Almanya..." value={originCountry} onChange={e => setOriginCountry(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Varış Ülkesi</label>
                <input className={inputCls} placeholder="Türkiye..." value={destinationCountry} onChange={e => setDestinationCountry(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Menşei Ülke</label>
                <input className={inputCls} placeholder="Ürünün üretildiği ülke" value={countryOfOrigin} onChange={e => setCountryOfOrigin(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Giriş Limanı / Kapısı</label>
                <input className={inputCls} placeholder="Ambarlı, İzmir Alsancak..." value={portOfEntry} onChange={e => setPortOfEntry(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Taşıyıcı Firma</label>
                <input className={inputCls} placeholder="MSC, DHL, FedEx..." value={carrierName} onChange={e => setCarrierName(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>{transportType === 'road' ? 'Araç Plakası' : 'Konteyner No'}</label>
                {transportType === 'road'
                  ? <input className={inputCls} placeholder="34 ABC 1234" value={vehiclePlate} onChange={e => setVehiclePlate(e.target.value)} />
                  : <input className={inputCls} placeholder="MSCU1234567" value={containerNumber} onChange={e => setContainerNumber(e.target.value)} />
                }
              </div>
            </div>
            <div>
              <label className={labelCls}>Incoterms</label>
              <div className="flex flex-wrap gap-2">
                {INCOTERMS_OPTIONS.map(t => (
                  <button key={t} type="button" onClick={() => setIncoterms(prev => prev === t ? '' : t)}
                    className={`px-2.5 py-1 rounded text-xs font-mono font-medium border transition-colors ${incoterms === t ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-indigo-400'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 6. Ürün Kalemleri */}
          <div className={sectionClsShp}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Ürün Kalemleri</p>
              <button type="button" onClick={addItem}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors border border-indigo-200 dark:border-indigo-800">
                <Plus className="h-3 w-3" /> Kalem Ekle
              </button>
            </div>
            <div className="space-y-2">
              {items.map((item, i) => {
                const total = (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0)
                return (
                  <div key={i} className="grid grid-cols-12 gap-2 items-start p-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800">
                    <div className="col-span-3">
                      {i === 0 && <p className="text-[10px] text-zinc-400 mb-1">Ürün Adı</p>}
                      <input className={inputCls} placeholder="Ürün adı" value={item.product_name} onChange={e => updateItem(i, 'product_name', e.target.value)} />
                    </div>
                    <div className="col-span-2">
                      {i === 0 && <p className="text-[10px] text-zinc-400 mb-1">HS Kodu</p>}
                      <input className={inputCls} placeholder="8471.30" value={item.hs_code} onChange={e => updateItem(i, 'hs_code', e.target.value)} />
                    </div>
                    <div className="col-span-2">
                      {i === 0 && <p className="text-[10px] text-zinc-400 mb-1">Miktar</p>}
                      <input type="number" min="0" className={inputCls} placeholder="100" value={item.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)} />
                    </div>
                    <div className="col-span-1">
                      {i === 0 && <p className="text-[10px] text-zinc-400 mb-1">Birim</p>}
                      <select className={inputCls} value={item.unit} onChange={e => updateItem(i, 'unit', e.target.value)}>
                        {UNIT_OPTIONS_CST.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2">
                      {i === 0 && <p className="text-[10px] text-zinc-400 mb-1">Birim Fiyat ({currency})</p>}
                      <input type="number" min="0" step="0.01" className={inputCls} placeholder="0.00" value={item.unit_price} onChange={e => updateItem(i, 'unit_price', e.target.value)} />
                    </div>
                    <div className="col-span-1 flex flex-col items-end">
                      {i === 0 && <p className="text-[10px] text-zinc-400 mb-1">Toplam</p>}
                      <p className="text-xs font-medium text-indigo-600 py-2">
                        {total > 0 ? total.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : '—'}
                      </p>
                    </div>
                    <div className="col-span-1 flex justify-end">
                      {i === 0 && <p className="text-[10px] invisible mb-1">x</p>}
                      <button type="button" onClick={() => items.length > 1 && removeItem(i)} disabled={items.length === 1}
                        className="p-1.5 rounded text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-30">
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })}
              {itemsTotal > 0 && (
                <div className="flex justify-end pt-1">
                  <p className="text-xs font-semibold text-indigo-600">
                    Toplam: {itemsTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {currency}
                    {tlEquivalent && ` ≈ ₺${tlEquivalent.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* 7. Finansal Bilgiler */}
          <div className={sectionClsShp}>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Finansal Bilgiler</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Beyan Değeri</label>
                <input type="number" min="0" step="0.01" className={inputCls}
                  placeholder={itemsTotal > 0 ? itemsTotal.toFixed(2) : '0.00'}
                  value={declaredValue} onChange={e => setDeclaredValue(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Para Birimi</label>
                <select className={inputCls} value={currency} onChange={e => setCurrency(e.target.value)}>
                  {CUSTOMS_CURRENCY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            {currency !== 'TRY' && (
              <div>
                <label className={labelCls}>Döviz Kuru (1 {currency} = ? ₺)</label>
                <div className="flex items-center gap-2">
                  <input type="number" min="0" step="0.0001" className={inputCls} placeholder="32.50" value={exchangeRate} onChange={e => setExchangeRate(e.target.value)} />
                  {tlEquivalent && (
                    <p className="text-xs text-indigo-600 whitespace-nowrap font-medium">≈ ₺{tlEquivalent.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</p>
                  )}
                </div>
              </div>
            )}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Gümrük Vergisi</label>
                <input type="number" min="0" step="0.01" className={inputCls} placeholder="0.00" value={customsDuty} onChange={e => setCustomsDuty(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>KDV</label>
                <input type="number" min="0" step="0.01" className={inputCls} placeholder="0.00" value={vatAmount} onChange={e => setVatAmount(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Diğer (ÖTV vb.)</label>
                <input type="number" min="0" step="0.01" className={inputCls} placeholder="0.00" value={otherTaxes} onChange={e => setOtherTaxes(e.target.value)} />
              </div>
            </div>
            {totalTax > 0 && (
              <div className="flex justify-end">
                <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Toplam Vergi: ₺{totalTax.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </p>
              </div>
            )}
          </div>

          {/* 8. Ağırlık & Tarih */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Net Ağırlık (kg)</label>
              <input type="number" min="0" step="0.01" className={inputCls} placeholder="0.00" value={netWeight} onChange={e => setNetWeight(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Brüt Ağırlık (kg)</label>
              <input type="number" min="0" step="0.01" className={inputCls} placeholder="0.00" value={grossWeight} onChange={e => setGrossWeight(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Beklenen Tarih</label>
              <input type="date" className={inputCls} value={expectedDate} onChange={e => setExpectedDate(e.target.value)} />
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
            <textarea className={`${inputCls} resize-none`} rows={3} placeholder="İsteğe bağlı notlar..." value={description} onChange={e => setDescription(e.target.value)} />
          </div>
        </div>

        <div className="flex justify-end gap-3 px-5 pb-5 sticky bottom-0 bg-white dark:bg-zinc-900 border-t border-zinc-100 dark:border-zinc-800 pt-3">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
            İptal
          </button>
          <button onClick={handleSubmit} disabled={createMutation.isPending}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-60">
            {createMutation.isPending ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Shipping Tab Section ─────────────────────────────────────────────────────

interface ShippingTabSectionProps {
  departments: { id: string; name: string }[]
}

function ShippingTabSection({ departments }: ShippingTabSectionProps) {
  const qc = useQueryClient()
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [statusChip, setStatusChip] = useState('all')
  const [typeFilter, setTypeFilter] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const { user, roleLevel } = useAuthStore()
  const deptFilter = roleLevel === ROLE_LEVELS.DEPARTMENT_MANAGER && user?.department_id ? user.department_id : null

  const { data, isLoading } = useQuery({
    queryKey: ['ship-mgr-shipping', page, search, statusChip, typeFilter, deptFilter],
    queryFn: () => {
      const params: Record<string, any> = { page: page + 1, per_page: 15 }
      if (search) params.search = search
      if (statusChip !== 'all') params.status = statusChip
      if (typeFilter) params.type = typeFilter
      if (deptFilter) params.department_id = deptFilter
      return shippingService.list(params)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => shippingService.delete(id),
    onSuccess: () => {
      toast.success('Nakliye kaydı silindi.')
      qc.invalidateQueries({ queryKey: ['ship-mgr-shipping'] })
      qc.invalidateQueries({ queryKey: ['ship-mgr-stats'] })
      setDeleteId(null)
    },
    onError: (e: any) => toast.error(e?.message ?? 'Silinemedi.'),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => shippingService.updateStatus(id, status),
    onSuccess: () => {
      toast.success('Durum güncellendi.')
      qc.invalidateQueries({ queryKey: ['ship-mgr-shipping'] })
      qc.invalidateQueries({ queryKey: ['ship-mgr-stats'] })
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
            <p className="font-medium text-zinc-900 dark:text-zinc-100 text-sm truncate max-w-[160px]">{row.title}</p>
            <div className="flex items-center gap-1.5 flex-wrap">
              {row.type && shippingTypeBadge(row.type)}
              {row.order_number && (
                <span className="text-xs font-mono text-zinc-400">{row.order_number}</span>
              )}
            </div>
            {row.customer_name && (
              <p className="text-xs text-zinc-500 truncate max-w-[160px]">{row.customer_name}</p>
            )}
          </div>
        )
      },
    }),
    col.accessor('status', {
      header: 'Durum',
      cell: info => shipStatusBadge(info.getValue() ?? ''),
    }),
    col.display({
      id: 'route',
      header: 'Güzergah',
      cell: info => {
        const row = info.row.original
        if (!row.origin_address && !row.destination_address) return <span className="text-zinc-400 text-xs">—</span>
        return (
          <div className="space-y-0.5 min-w-[120px]">
            {transportIconMgr(row.transport_mode)}
            {row.origin_address && (
              <div className="flex items-center gap-1">
                <MapPin className="h-3 w-3 text-zinc-400 shrink-0" />
                <span className="text-xs text-zinc-500 truncate max-w-[120px]">{row.origin_address}</span>
              </div>
            )}
            {row.destination_address && (
              <div className="flex items-center gap-1">
                <MapPin className="h-3 w-3 text-sky-400 shrink-0" />
                <span className="text-xs text-zinc-700 dark:text-zinc-300 truncate max-w-[120px]">{row.destination_address}</span>
              </div>
            )}
          </div>
        )
      },
    }),
    col.display({
      id: 'vehicle',
      header: 'Araç / Taşıyıcı',
      cell: info => {
        const row = info.row.original
        return (
          <div className="space-y-0.5">
            {row.carrier && <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{row.carrier}</p>}
            {row.vehicle_plate && <p className="text-xs font-mono text-zinc-500">{row.vehicle_plate}</p>}
            {row.driver_name && <p className="text-xs text-zinc-400">{row.driver_name}</p>}
            {!row.carrier && !row.vehicle_plate && !row.driver_name && <span className="text-zinc-400 text-xs">—</span>}
          </div>
        )
      },
    }),
    col.display({
      id: 'cargo',
      header: 'Yük',
      cell: info => {
        const row = info.row.original
        const itemCount = Array.isArray(row.items) ? row.items.length : null
        return (
          <div className="space-y-0.5 text-xs text-zinc-500">
            {itemCount != null && <p>{itemCount} kalem</p>}
            {row.weight != null && <p>{Number(row.weight).toLocaleString('tr-TR')} kg</p>}
            {row.pallet_count != null && <p>{row.pallet_count} palet</p>}
            {itemCount == null && row.weight == null && row.pallet_count == null && <span>—</span>}
          </div>
        )
      },
    }),
    col.display({
      id: 'dates',
      header: 'Tarihler',
      cell: info => {
        const row = info.row.original
        return (
          <div className="space-y-0.5 text-xs text-zinc-500 min-w-[90px]">
            <p>Oluş: {formatDate(row.created_at)}</p>
            {row.estimated_delivery && <p className="text-amber-600">Tah: {formatDate(row.estimated_delivery)}</p>}
            {row.actual_delivery && <p className="text-emerald-600">Ger: {formatDate(row.actual_delivery)}</p>}
          </div>
        )
      },
    }),
    col.display({
      id: 'actions',
      header: '',
      cell: info => {
        const row = info.row.original
        const st = row.status
        return (
          <div className="flex items-center gap-1">
            {st === 'pending' && (
              <button
                title="Onayla"
                onClick={() => statusMutation.mutate({ id: row.id, status: 'confirmed' })}
                className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 text-zinc-400 hover:text-blue-600 transition-colors"
              >
                <CheckCircle2 className="h-4 w-4" />
              </button>
            )}
            {st === 'confirmed' && (
              <button
                title="Yola Çıkar"
                onClick={() => statusMutation.mutate({ id: row.id, status: 'in_transit' })}
                className="p-1.5 rounded-lg hover:bg-sky-50 dark:hover:bg-sky-950/30 text-zinc-400 hover:text-sky-600 transition-colors"
              >
                <Truck className="h-4 w-4" />
              </button>
            )}
            {st === 'in_transit' && (
              <button
                title="Teslim Edildi"
                onClick={() => statusMutation.mutate({ id: row.id, status: 'delivered' })}
                className="p-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-zinc-400 hover:text-emerald-600 transition-colors"
              >
                <PackageCheck className="h-4 w-4" />
              </button>
            )}
            {st !== 'delivered' && st !== 'failed' && st !== 'cancelled' && (
              <button
                title="Başarısız"
                onClick={() => statusMutation.mutate({ id: row.id, status: 'failed' })}
                className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-zinc-400 hover:text-red-600 transition-colors"
              >
                <XCircle className="h-4 w-4" />
              </button>
            )}
            {st !== 'delivered' && st !== 'cancelled' && (
              <button
                title="İptal Et"
                onClick={() => statusMutation.mutate({ id: row.id, status: 'cancelled' })}
                className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 transition-colors"
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
            placeholder="Nakliye kayıtlarında ara..."
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500 placeholder:text-zinc-400"
          />
        </form>
        <div className="flex items-center gap-2">
          <select
            value={typeFilter}
            onChange={e => { setTypeFilter(e.target.value); setPage(0) }}
            className="px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value="">Tüm Türler</option>
            {SHIPPING_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            Yeni Kayıt
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {SHIP_STATUS_CHIPS.map(chip => (
          <button
            key={chip.id}
            onClick={() => { setStatusChip(chip.id); setPage(0) }}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
              statusChip === chip.id
                ? 'bg-sky-600 border-sky-600 text-white'
                : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-sky-400 hover:text-sky-600'
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
        emptyMessage="Henüz nakliye kaydı yok."
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
        <ShippingCreateModal
          onClose={() => setShowCreate(false)}
          departments={departments}
          onSuccess={() => qc.invalidateQueries({ queryKey: ['ship-mgr-shipping'] })}
        />
      )}
    </div>
  )
}

// ─── Customs Tab Section ──────────────────────────────────────────────────────

interface CustomsTabSectionProps {
  departments: { id: string; name: string }[]
}

function CustomsTabSection({ departments }: CustomsTabSectionProps) {
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
    queryKey: ['ship-mgr-customs', page, search, statusChip, typeFilter, deptFilter],
    queryFn: () => {
      const params: Record<string, any> = { page: page + 1, per_page: 15 }
      if (search) params.search = search
      if (statusChip !== 'all') params.status = statusChip
      if (typeFilter !== 'all') params.type = typeFilter
      if (deptFilter) params.department_id = deptFilter
      return customsService.list(params)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => customsService.delete(id),
    onSuccess: () => {
      toast.success('Gümrük kaydı silindi.')
      qc.invalidateQueries({ queryKey: ['ship-mgr-customs'] })
      qc.invalidateQueries({ queryKey: ['ship-mgr-cst-stats'] })
      setDeleteId(null)
    },
    onError: (e: any) => toast.error(e?.message ?? 'Silinemedi.'),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => customsService.updateStatus(id, status),
    onSuccess: () => {
      toast.success('Durum güncellendi.')
      qc.invalidateQueries({ queryKey: ['ship-mgr-customs'] })
      qc.invalidateQueries({ queryKey: ['ship-mgr-cst-stats'] })
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
      id: 'declaration_info',
      header: 'Beyan / Firma',
      cell: info => {
        const row = info.row.original
        return (
          <div className="space-y-0.5 min-w-[150px]">
            <div className="flex items-center gap-1.5 flex-wrap">
              {customsTypeBadge(row.type ?? '')}
              {row.declaration_number && <span className="text-xs font-mono text-zinc-500">{row.declaration_number}</span>}
            </div>
            {row.company_name && <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{row.company_name}</p>}
            {row.customs_agent && <p className="text-xs text-zinc-400">Müşavir: {row.customs_agent}</p>}
          </div>
        )
      },
    }),
    col.accessor('status', {
      header: 'Durum',
      cell: info => customsStatusBadge(info.getValue() ?? ''),
    }),
    col.display({
      id: 'route',
      header: 'Güzergah',
      cell: info => {
        const row = info.row.original
        const from = row.origin_country || row.country_of_origin
        const to = row.destination_country || row.port_of_entry
        return (
          <div className="space-y-0.5">
            {(from || to) && (
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                {from && <span>{from}</span>}
                {from && to && <span className="mx-1 text-zinc-400">→</span>}
                {to && <span>{to}</span>}
              </p>
            )}
            {row.transport_type && cstTransportIcon(row.transport_type)}
            {row.incoterms && (
              <span className="inline-block text-xs font-mono px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                {row.incoterms}
              </span>
            )}
          </div>
        )
      },
    }),
    col.display({
      id: 'items_summary',
      header: 'Kalemler',
      cell: info => {
        const items: any[] = info.row.original.items ?? []
        if (!items.length) return <span className="text-xs text-zinc-400">—</span>
        return (
          <div className="space-y-0.5 min-w-[120px]">
            {items.slice(0, 2).map((it: any, i: number) => (
              <p key={i} className="text-xs text-zinc-600 dark:text-zinc-400 truncate max-w-[130px]">
                {it.product_name}
                {it.hs_code && <span className="text-zinc-400 ml-1">({it.hs_code})</span>}
              </p>
            ))}
            {items.length > 2 && <p className="text-xs text-indigo-600">+{items.length - 2} daha</p>}
          </div>
        )
      },
    }),
    col.display({
      id: 'financials',
      header: 'Değer / Vergi',
      cell: info => {
        const row = info.row.original
        const totalTax = (row.customs_duty ?? 0) + (row.vat_amount ?? 0) + (row.other_taxes ?? 0)
        return (
          <div className="space-y-0.5">
            {row.declared_value != null && (
              <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                {Number(row.declared_value).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {row.currency}
              </p>
            )}
            {totalTax > 0 && (
              <p className="text-xs text-zinc-500">Vergi: ₺{totalTax.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</p>
            )}
            {row.gross_weight != null && (
              <p className="text-xs text-zinc-400">{row.gross_weight} kg</p>
            )}
          </div>
        )
      },
    }),
    col.accessor('expected_date', {
      header: 'Tarih',
      cell: info => (
        <div className="space-y-0.5">
          <p className="text-xs text-zinc-500">{formatDate(info.row.original.created_at)}</p>
          {info.getValue() && <p className="text-xs text-indigo-600">Beklenen: {formatDate(info.getValue())}</p>}
        </div>
      ),
    }),
    col.display({
      id: 'actions',
      header: '',
      cell: info => {
        const row = info.row.original
        const s = row.status
        return (
          <div className="flex items-center gap-1">
            {s === 'draft' && (
              <button title="Beyan Ver"
                onClick={() => statusMutation.mutate({ id: row.id, status: 'submitted' })}
                className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 text-zinc-400 hover:text-blue-600 transition-colors">
                <FileText className="h-4 w-4" />
              </button>
            )}
            {s === 'submitted' && (
              <button title="İncelemeye Al"
                onClick={() => statusMutation.mutate({ id: row.id, status: 'in_review' })}
                className="p-1.5 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950/30 text-zinc-400 hover:text-amber-600 transition-colors">
                <Clock className="h-4 w-4" />
              </button>
            )}
            {s === 'in_review' && (
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
            {(s === 'submitted' || s === 'in_review') && (
              <button title="Reddet"
                onClick={() => statusMutation.mutate({ id: row.id, status: 'rejected' })}
                className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-zinc-400 hover:text-red-600 transition-colors">
                <XCircle className="h-4 w-4" />
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
        <div className="flex gap-3 flex-1">
          <form onSubmit={handleSearch} className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Gümrük kayıtlarında ara..."
              className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-zinc-400"
            />
          </form>
          <select
            value={typeFilter}
            onChange={e => { setTypeFilter(e.target.value); setPage(0) }}
            className="px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">Tüm Türler</option>
            {CUSTOMS_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
        >
          <Plus className="h-4 w-4" />
          Yeni Beyan
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {CST_STATUS_CHIPS.map(chip => (
          <button
            key={chip.id}
            onClick={() => { setStatusChip(chip.id); setPage(0) }}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
              statusChip === chip.id
                ? 'bg-indigo-600 border-indigo-600 text-white'
                : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-indigo-400 hover:text-indigo-600'
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
        emptyMessage="Henüz gümrük beyanı yok."
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
        <CustomsCreateModal
          onClose={() => setShowCreate(false)}
          departments={departments}
          onSuccess={() => qc.invalidateQueries({ queryKey: ['ship-mgr-customs'] })}
        />
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ShippingManagerPage() {
  const [activeTab, setActiveTab] = useState('nakliye')

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['ship-mgr-stats'],
    queryFn: () => get<any>('/dashboard/module/shipping').then(r => r.data),
  })

  const { data: cstStatsData, isLoading: cstStatsLoading } = useQuery({
    queryKey: ['ship-mgr-cst-stats'],
    queryFn: () => get<any>('/dashboard/module/customs').then(r => r.data),
  })

  const { data: deptData } = useQuery({
    queryKey: ['company-departments-list'],
    queryFn: () => get<any>('/company/departments').then(r => r.data ?? []),
  })
  const departments: { id: string; name: string }[] = deptData ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nakliye & Gümrükleme Müdürü"
        description="Sevkiyat ve gümrük işlemleri yönetimi"
        breadcrumbs={[{ label: 'Modüller' }, { label: 'Nakliye & Gümrükleme Müdürü' }]}
      />

      {/* Nakliye Stats */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider px-0.5">Nakliye</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard title="Toplam Nakliye" value={statsData?.total ?? 0} icon={Truck} color="blue" loading={statsLoading} />
          <StatsCard title="Yolda" value={statsData?.in_transit ?? 0} icon={Truck} color="orange" loading={statsLoading} />
          <StatsCard title="Teslim Edildi" value={statsData?.completed ?? 0} icon={CheckCircle2} color="green" loading={statsLoading} />
          <StatsCard title="Bekleyen" value={statsData?.pending ?? 0} icon={Clock} color="purple" loading={statsLoading} />
        </div>
      </div>

      {/* Gümrükleme Stats */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider px-0.5">Gümrükleme</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard title="Toplam Beyan" value={cstStatsData?.total ?? 0} icon={Globe} color="purple" loading={cstStatsLoading} />
          <StatsCard title="Hazırlanıyor" value={cstStatsData?.draft ?? 0} icon={FileText} color="blue" loading={cstStatsLoading} />
          <StatsCard title="İncelemede" value={cstStatsData?.in_review ?? 0} icon={AlertCircle} color="orange" loading={cstStatsLoading} />
          <StatsCard title="Tamamlandı" value={cstStatsData?.completed ?? 0} icon={CheckCircle2} color="green" loading={cstStatsLoading} />
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
                      ? 'border-b-2 border-sky-600 text-sky-600'
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
          {activeTab === 'nakliye' && (
            <ShippingTabSection departments={departments} />
          )}
          {activeTab === 'gumrukleme' && (
            <CustomsTabSection departments={departments} />
          )}
        </div>
      </div>
    </div>
  )
}
