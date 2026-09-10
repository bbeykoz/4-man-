'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Globe, Plus, Trash2, Search, X, Clock, CheckCircle2,
  FileText, XCircle, PackageCheck, AlertCircle,
  ChevronDown, Minus, Plane, Truck, Anchor, Ship,
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

const customsService = createRecordService('customs')

const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500'
const labelCls = 'block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1'
const sectionCls = 'rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30 p-4 space-y-3'

const CUSTOMS_TYPE_OPTIONS = [
  { value: 'import',    label: 'İthalat' },
  { value: 'export',    label: 'İhracat' },
  { value: 'transit',   label: 'Transit' },
  { value: 'temporary', label: 'Geçici' },
]

const TRANSPORT_TYPE_OPTIONS = [
  { value: 'sea',  label: 'Deniz Yolu' },
  { value: 'air',  label: 'Hava Yolu' },
  { value: 'road', label: 'Kara Yolu' },
  { value: 'rail', label: 'Demiryolu' },
]

const INCOTERMS_OPTIONS = ['EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP']

const CURRENCY_OPTIONS = ['USD', 'EUR', 'TRY', 'GBP', 'CNY', 'AED', 'JPY']

const UNIT_OPTIONS_CST = ['adet', 'kg', 'ton', 'litre', 'metreküp', 'koli', 'palet', 'konteyner']

const STATUS_CHIPS = [
  { id: 'all',       label: 'Tümü' },
  { id: 'draft',     label: 'Hazırlanıyor' },
  { id: 'submitted', label: 'Beyan Verildi' },
  { id: 'in_review', label: 'İncelemede' },
  { id: 'approved',  label: 'Onaylandı' },
  { id: 'rejected',  label: 'Reddedildi' },
  { id: 'completed', label: 'Tamamlandı' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
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

function transportIcon(type: string) {
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

// ─── Customs Item Interface ───────────────────────────────────────────────────

interface CustomsItem {
  product_name: string
  hs_code: string
  quantity: string
  unit: string
  unit_price: string
}

// ─── Create Modal ─────────────────────────────────────────────────────────────

interface CustomsCreateModalProps {
  onClose: () => void
  departments: { id: string; name: string }[]
  onSuccess: () => void
}

function CustomsCreateModal({ onClose, departments, onSuccess }: CustomsCreateModalProps) {
  // Temel
  const [title, setTitle] = useState('')
  const [type, setType] = useState('')
  const [status, setStatus] = useState('draft')
  const [priority, setPriority] = useState('medium')
  // Beyan
  const [declarationNumber, setDeclarationNumber] = useState('')
  const [blNumber, setBlNumber] = useState('')
  // Firma
  const [companyName, setCompanyName] = useState('')
  const [taxNumber, setTaxNumber] = useState('')
  const [customsAgent, setCustomsAgent] = useState('')
  // Güzergah & Taşıma
  const [transportType, setTransportType] = useState('')
  const [originCountry, setOriginCountry] = useState('')
  const [destinationCountry, setDestinationCountry] = useState('')
  const [countryOfOrigin, setCountryOfOrigin] = useState('')
  const [portOfEntry, setPortOfEntry] = useState('')
  const [carrierName, setCarrierName] = useState('')
  const [containerNumber, setContainerNumber] = useState('')
  const [vehiclePlate, setVehiclePlate] = useState('')
  const [incoterms, setIncoterms] = useState('')
  // Ürün Kalemleri
  const [items, setItems] = useState<CustomsItem[]>([{ product_name: '', hs_code: '', quantity: '', unit: 'adet', unit_price: '' }])
  // Finansal
  const [currency, setCurrency] = useState('USD')
  const [declaredValue, setDeclaredValue] = useState('')
  const [exchangeRate, setExchangeRate] = useState('')
  const [customsDuty, setCustomsDuty] = useState('')
  const [vatAmount, setVatAmount] = useState('')
  const [otherTaxes, setOtherTaxes] = useState('')
  // Ağırlık & Tarih
  const [netWeight, setNetWeight] = useState('')
  const [grossWeight, setGrossWeight] = useState('')
  const [expectedDate, setExpectedDate] = useState('')
  // Diğer
  const [departmentId, setDepartmentId] = useState('')
  const [description, setDescription] = useState('')

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, any>) => customsService.create(payload),
    onSuccess: () => {
      toast.success('Gümrük kaydı oluşturuldu.')
      onSuccess()
      onClose()
    },
    onError: (e: any) => toast.error(e?.message ?? 'Kayıt oluşturulamadı.'),
  })

  const addItem = () => setItems(prev => [...prev, { product_name: '', hs_code: '', quantity: '', unit: 'adet', unit_price: '' }])
  const removeItem = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i))
  const updateItem = (i: number, field: keyof CustomsItem, val: string) =>
    setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: val } : item))

  // Toplam hesaplar
  const itemsTotal = useMemo(() => items.reduce((sum, it) => {
    const q = parseFloat(it.quantity) || 0
    const p = parseFloat(it.unit_price) || 0
    return sum + q * p
  }, 0), [items])

  const totalTax = useMemo(() => {
    return (parseFloat(customsDuty) || 0) + (parseFloat(vatAmount) || 0) + (parseFloat(otherTaxes) || 0)
  }, [customsDuty, vatAmount, otherTaxes])

  const tlEquivalent = useMemo(() => {
    const val = parseFloat(declaredValue) || itemsTotal
    const rate = parseFloat(exchangeRate) || 0
    if (currency === 'TRY' || !rate) return null
    return val * rate
  }, [declaredValue, itemsTotal, exchangeRate, currency])

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

  const STATUS_OPTS = [
    { value: 'draft',     label: 'Hazırlanıyor' },
    { value: 'submitted', label: 'Beyan Verildi' },
  ]

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
          <div className={sectionCls}>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Durum & Öncelik</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Durum</label>
                <div className="flex flex-wrap gap-2">
                  {STATUS_OPTS.map(o => (
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
          <div className={sectionCls}>
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
          <div className={sectionCls}>
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
          <div className={sectionCls}>
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
                <label className={labelCls}>
                  {transportType === 'road' ? 'Araç Plakası' : 'Konteyner No'}
                </label>
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
          <div className={sectionCls}>
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
          <div className={sectionCls}>
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
                  {CURRENCY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
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
            className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-60">
            {createMutation.isPending ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CustomsPage() {
  const qc = useQueryClient()
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [statusChip, setStatusChip] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['customs-stats'],
    queryFn: () => get<any>('/dashboard/module/customs').then(r => r.data),
  })

  const { data: deptData } = useQuery({
    queryKey: ['company-departments-list'],
    queryFn: () => get<any>('/company/departments').then(r => r.data ?? []),
  })
  const departments: { id: string; name: string }[] = deptData ?? []

  const { data, isLoading } = useQuery({
    queryKey: ['customs-page', page, search, statusChip, typeFilter],
    queryFn: () => {
      const params: Record<string, any> = { page: page + 1, per_page: 15 }
      if (search) params.search = search
      if (statusChip !== 'all') params.status = statusChip
      if (typeFilter !== 'all') params.type = typeFilter
      return customsService.list(params)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => customsService.delete(id),
    onSuccess: () => {
      toast.success('Gümrük kaydı silindi.')
      qc.invalidateQueries({ queryKey: ['customs-page'] })
      qc.invalidateQueries({ queryKey: ['customs-stats'] })
      setDeleteId(null)
    },
    onError: (e: any) => toast.error(e?.message ?? 'Silinemedi.'),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => customsService.updateStatus(id, status),
    onSuccess: () => {
      toast.success('Durum güncellendi.')
      qc.invalidateQueries({ queryKey: ['customs-page'] })
      qc.invalidateQueries({ queryKey: ['customs-stats'] })
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
      cell: info => statusBadge(info.getValue() ?? ''),
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
            {row.transport_type && transportIcon(row.transport_type)}
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
        const shown = items.slice(0, 2)
        return (
          <div className="space-y-0.5 min-w-[120px]">
            {shown.map((it: any, i: number) => (
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
              <p className="text-xs text-zinc-500">
                Vergi: ₺{totalTax.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
              </p>
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
      id: 'workflow',
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
        title="Gümrükleme"
        description="Gümrük beyan ve süreç yönetimi"
        breadcrumbs={[{ label: 'Modüller' }, { label: 'Gümrükleme' }]}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Toplam Beyan"
          value={statsData?.total ?? 0}
          icon={Globe}
          color="purple"
          loading={statsLoading}
        />
        <StatsCard
          title="Hazırlanıyor"
          value={statsData?.draft ?? 0}
          icon={FileText}
          color="blue"
          loading={statsLoading}
        />
        <StatsCard
          title="İncelemede"
          value={statsData?.in_review ?? 0}
          icon={AlertCircle}
          color="orange"
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
          <Globe className="h-4 w-4 text-indigo-500" />
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Gümrük Beyanları</span>
        </div>
        <div className="p-5 space-y-4">
          {/* Toolbar */}
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
              <div className="relative">
                <select
                  value={typeFilter}
                  onChange={e => { setTypeFilter(e.target.value); setPage(0) }}
                  className="pl-3 pr-8 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none cursor-pointer"
                >
                  <option value="all">Tüm Türler</option>
                  {CUSTOMS_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" />
              </div>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              Yeni Beyan
            </button>
          </div>

          {/* Status chips */}
          <div className="flex flex-wrap gap-2">
            {STATUS_CHIPS.map(chip => (
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
        </div>
      </div>

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
          onSuccess={() => qc.invalidateQueries({ queryKey: ['customs-page'] })}
        />
      )}
    </div>
  )
}
