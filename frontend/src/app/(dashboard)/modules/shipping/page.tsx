'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Truck, Plus, Trash2, Search, X, Clock, CheckCircle2,
  Ban, XCircle, PackageCheck, AlertCircle, ChevronDown,
  Minus, Plane, Anchor, MapPin, Navigation,
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

const shippingService = createRecordService('shipping')

const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500'
const labelCls = 'block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1'
const sectionCls = 'rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30 p-4 space-y-3'

const SHIPPING_TYPE_OPTIONS = [
  { value: 'delivery', label: 'Teslimat' },
  { value: 'pickup',   label: 'Teslim Alma' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'express',  label: 'Ekspres' },
]

const TRANSPORT_MODE_OPTIONS = [
  { value: 'road', label: 'Kara' },
  { value: 'air',  label: 'Hava' },
  { value: 'sea',  label: 'Deniz' },
  { value: 'rail', label: 'Demiryolu' },
]

const CARRIER_OPTIONS = [
  'Yurtiçi Kargo', 'Aras Kargo', 'MNG Kargo', 'PTT Kargo',
  'Sürat Kargo', 'UPS', 'DHL', 'FedEx', 'DPD', 'Özel Araç',
]

const STATUS_CHIPS = [
  { id: 'all',        label: 'Tümü' },
  { id: 'pending',    label: 'Bekliyor' },
  { id: 'confirmed',  label: 'Onaylandı' },
  { id: 'in_transit', label: 'Yolda' },
  { id: 'delivered',  label: 'Teslim Edildi' },
  { id: 'failed',     label: 'Başarısız' },
  { id: 'cancelled',  label: 'İptal' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
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

function typeBadge(type: string) {
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

function transportIcon(mode: string) {
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

// ─── Shipping Item Interface ──────────────────────────────────────────────────

interface ShippingItem {
  name: string
  quantity: string
  weight: string
  volume: string
}

// ─── Create Modal ─────────────────────────────────────────────────────────────

interface ShippingCreateModalProps {
  onClose: () => void
  departments: { id: string; name: string }[]
  onSuccess: () => void
}

function ShippingCreateModal({ onClose, departments, onSuccess }: ShippingCreateModalProps) {
  // Temel
  const [title, setTitle] = useState('')
  const [type, setType] = useState('delivery')
  const [status, setStatus] = useState('pending')
  const [priority, setPriority] = useState('medium')
  // Sipariş & Müşteri
  const [orderNumber, setOrderNumber] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [trackingNumber, setTrackingNumber] = useState('')
  // Araç & Sürücü
  const [transportMode, setTransportMode] = useState('road')
  const [carrier, setCarrier] = useState('')
  const [vehiclePlate, setVehiclePlate] = useState('')
  const [driverName, setDriverName] = useState('')
  const [recipientName, setRecipientName] = useState('')
  const [recipientPhone, setRecipientPhone] = useState('')
  // Adresler
  const [originAddress, setOriginAddress] = useState('')
  const [destinationAddress, setDestinationAddress] = useState('')
  // Yük
  const [items, setItems] = useState<ShippingItem[]>([{ name: '', quantity: '1', weight: '', volume: '' }])
  const [palletCount, setPalletCount] = useState('')
  const [weight, setWeight] = useState('')
  // Tarihler
  const [departureDate, setDepartureDate] = useState('')
  const [estimatedDelivery, setEstimatedDelivery] = useState('')
  const [actualDelivery, setActualDelivery] = useState('')
  // Maliyet
  const [shippingCost, setShippingCost] = useState('')
  const [fuelCost, setFuelCost] = useState('')
  const [driverCost, setDriverCost] = useState('')
  const [extraCost, setExtraCost] = useState('')
  // Diğer
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
  const updateItem = (i: number, field: keyof ShippingItem, val: string) =>
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
    if (actualDelivery) payload.actual_delivery = actualDelivery
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
          {/* 1. Durum & Öncelik */}
          <div className={sectionCls}>
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

          {/* 2. Başlık */}
          <div>
            <label className={labelCls}>Başlık <span className="text-red-500">*</span></label>
            <input className={inputCls} placeholder="Nakliye kaydı başlığı" value={title} onChange={e => setTitle(e.target.value)} />
          </div>

          {/* 3. Sipariş & Müşteri */}
          <div className={sectionCls}>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Sipariş & Müşteri</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Sipariş No</label>
                <input className={inputCls} placeholder="ORD-001" value={orderNumber} onChange={e => setOrderNumber(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Müşteri Adı</label>
                <input className={inputCls} placeholder="Müşteri / firma adı" value={customerName} onChange={e => setCustomerName(e.target.value)} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Takip Numarası</label>
              <input className={inputCls} placeholder="TRK-2024-001" value={trackingNumber} onChange={e => setTrackingNumber(e.target.value)} />
            </div>
          </div>

          {/* 4. Taşıma & Araç */}
          <div className={sectionCls}>
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
              <div className="relative">
                <select className={inputCls} value={carrier} onChange={e => setCarrier(e.target.value)}>
                  <option value="">Seçiniz</option>
                  {CARRIER_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{transportMode === 'road' ? 'Araç Plakası' : 'Uçuş / Sefer No'}</label>
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

          {/* 5. Adresler */}
          <div className={sectionCls}>
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

          {/* 6. Yük Detayı */}
          <div className={sectionCls}>
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

          {/* 7. Tarihler */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Çıkış Tarihi</label>
              <input type="date" className={inputCls} value={departureDate} onChange={e => setDepartureDate(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Tahmini Teslimat</label>
              <input type="date" className={inputCls} value={estimatedDelivery} onChange={e => setEstimatedDelivery(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Gerçek Teslimat</label>
              <input type="date" className={inputCls} value={actualDelivery} onChange={e => setActualDelivery(e.target.value)} />
            </div>
          </div>

          {/* 8. Maliyet */}
          <div className={sectionCls}>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Maliyet Detayı</p>
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
                <p className="text-xs font-semibold text-sky-600">
                  Toplam: ₺{totalCost.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </p>
              </div>
            )}
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ShippingPage() {
  const qc = useQueryClient()
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [statusChip, setStatusChip] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['shipping-stats'],
    queryFn: () => get<any>('/dashboard/module/shipping').then(r => r.data),
  })

  const { data: deptData } = useQuery({
    queryKey: ['company-departments-list'],
    queryFn: () => get<any>('/company/departments').then(r => r.data ?? []),
  })
  const departments: { id: string; name: string }[] = deptData ?? []

  const { data, isLoading } = useQuery({
    queryKey: ['shipping-page', page, search, statusChip, typeFilter],
    queryFn: () => {
      const params: Record<string, any> = { page: page + 1, per_page: 15 }
      if (search) params.search = search
      if (statusChip !== 'all') params.status = statusChip
      if (typeFilter !== 'all') params.type = typeFilter
      return shippingService.list(params)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => shippingService.delete(id),
    onSuccess: () => {
      toast.success('Nakliye kaydı silindi.')
      qc.invalidateQueries({ queryKey: ['shipping-page'] })
      qc.invalidateQueries({ queryKey: ['shipping-stats'] })
      setDeleteId(null)
    },
    onError: (e: any) => toast.error(e?.message ?? 'Silinemedi.'),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => shippingService.updateStatus(id, status),
    onSuccess: () => {
      toast.success('Durum güncellendi.')
      qc.invalidateQueries({ queryKey: ['shipping-page'] })
      qc.invalidateQueries({ queryKey: ['shipping-stats'] })
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
              {typeBadge(row.type ?? '')}
              {row.order_number && <span className="text-xs font-mono text-zinc-500">{row.order_number}</span>}
            </div>
            {row.customer_name && <p className="text-sm text-zinc-700 dark:text-zinc-300">{row.customer_name}</p>}
            {row.tracking_number && <p className="text-xs font-mono text-zinc-400">{row.tracking_number}</p>}
          </div>
        )
      },
    }),
    col.accessor('status', {
      header: 'Durum',
      cell: info => statusBadge(info.getValue() ?? ''),
    }),
    col.display({
      id: 'route',
      header: 'Güzergah',
      cell: info => {
        const row = info.row.original
        return (
          <div className="space-y-0.5 min-w-[130px]">
            {row.origin_address && (
              <div className="flex items-start gap-1">
                <MapPin className="h-3 w-3 text-zinc-400 mt-0.5 shrink-0" />
                <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-1">{row.origin_address}</p>
              </div>
            )}
            {row.destination_address && (
              <div className="flex items-start gap-1">
                <MapPin className="h-3 w-3 text-sky-500 mt-0.5 shrink-0" />
                <p className="text-xs text-zinc-700 dark:text-zinc-300 line-clamp-1">{row.destination_address}</p>
              </div>
            )}
            {row.transport_mode && transportIcon(row.transport_mode)}
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
          </div>
        )
      },
    }),
    col.display({
      id: 'cargo',
      header: 'Yük',
      cell: info => {
        const row = info.row.original
        const items: any[] = row.items ?? []
        return (
          <div className="space-y-0.5">
            {items.length > 0 && (
              <p className="text-xs text-zinc-600 dark:text-zinc-400">{items.length} kalem</p>
            )}
            {row.weight != null && <p className="text-xs text-zinc-500">{row.weight} kg</p>}
            {row.pallet_count != null && <p className="text-xs text-zinc-500">{row.pallet_count} palet</p>}
          </div>
        )
      },
    }),
    col.display({
      id: 'dates',
      header: 'Tarih',
      cell: info => {
        const row = info.row.original
        return (
          <div className="space-y-0.5">
            <p className="text-xs text-zinc-500">{formatDate(row.created_at)}</p>
            {row.estimated_delivery && (
              <p className="text-xs text-sky-600">→ {formatDate(row.estimated_delivery)}</p>
            )}
            {row.actual_delivery && (
              <p className="text-xs text-emerald-600">✓ {formatDate(row.actual_delivery)}</p>
            )}
          </div>
        )
      },
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
              <button title="Onayla"
                onClick={() => statusMutation.mutate({ id: row.id, status: 'confirmed' })}
                className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 text-zinc-400 hover:text-blue-600 transition-colors">
                <CheckCircle2 className="h-4 w-4" />
              </button>
            )}
            {s === 'confirmed' && (
              <button title="Yola Çıktı"
                onClick={() => statusMutation.mutate({ id: row.id, status: 'in_transit' })}
                className="p-1.5 rounded-lg hover:bg-sky-50 dark:hover:bg-sky-950/30 text-zinc-400 hover:text-sky-600 transition-colors">
                <Truck className="h-4 w-4" />
              </button>
            )}
            {s === 'in_transit' && (
              <button title="Teslim Edildi"
                onClick={() => statusMutation.mutate({ id: row.id, status: 'delivered' })}
                className="p-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-zinc-400 hover:text-emerald-600 transition-colors">
                <PackageCheck className="h-4 w-4" />
              </button>
            )}
            {(s === 'pending' || s === 'confirmed' || s === 'in_transit') && (
              <button title="Başarısız"
                onClick={() => statusMutation.mutate({ id: row.id, status: 'failed' })}
                className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-zinc-400 hover:text-red-600 transition-colors">
                <XCircle className="h-4 w-4" />
              </button>
            )}
            {s !== 'cancelled' && s !== 'delivered' && s !== 'failed' && (
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
    <div className="space-y-6">
      <PageHeader
        title="Nakliye"
        description="Sevkiyat ve taşıma süreç yönetimi"
        breadcrumbs={[{ label: 'Modüller' }, { label: 'Nakliye' }]}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title="Toplam Sefer" value={statsData?.total ?? 0} icon={Truck} color="blue" loading={statsLoading} />
        <StatsCard title="Yolda" value={statsData?.in_transit ?? 0} icon={Navigation} color="teal" loading={statsLoading} />
        <StatsCard title="Teslim Edildi" value={statsData?.delivered ?? 0} icon={PackageCheck} color="green" loading={statsLoading} />
        <StatsCard title="Bekleyen" value={statsData?.pending ?? 0} icon={AlertCircle} color="orange" loading={statsLoading} />
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-800">
          <Truck className="h-4 w-4 text-sky-500" />
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Nakliye Kayıtları</span>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="flex gap-3 flex-1">
              <form onSubmit={handleSearch} className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                <input
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  placeholder="Nakliye kayıtlarında ara..."
                  className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500 placeholder:text-zinc-400"
                />
              </form>
              <div className="relative">
                <select
                  value={typeFilter}
                  onChange={e => { setTypeFilter(e.target.value); setPage(0) }}
                  className="pl-3 pr-8 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500 appearance-none cursor-pointer"
                >
                  <option value="all">Tüm Türler</option>
                  {SHIPPING_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" />
              </div>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              Yeni Nakliye
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {STATUS_CHIPS.map(chip => (
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
        <ShippingCreateModal
          onClose={() => setShowCreate(false)}
          departments={departments}
          onSuccess={() => qc.invalidateQueries({ queryKey: ['shipping-page'] })}
        />
      )}
    </div>
  )
}
