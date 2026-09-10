'use client'

import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ClipboardCheck, Plus, Trash2, Search, X,
  Package, ArrowDownCircle, ArrowUpCircle, ArrowLeftRight,
  SlidersHorizontal, ClipboardList, Layers,
  Clock, Ban, UserCircle, CheckCircle2,
  Scan, ChevronDown, AlertTriangle, TrendingUp, BoxSelect, Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/common/PageHeader'
import { StatsCard } from '@/components/common/StatsCard'
import { DataTable } from '@/components/common/DataTable'
import { ConfirmModal } from '@/components/common/ConfirmModal'
import { StatusBadge } from '@/components/common/StatusBadge'
import { createRecordService } from '@/services/record.service'
import { get, post, put, del } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { PRIORITY_OPTIONS, ROLE_LEVELS } from '@/lib/constants'
import { useAuthStore } from '@/store/auth.store'
import type { WarehouseRecord, WarehouseProduct } from '@/types/api.types'
import { createColumnHelper } from '@tanstack/react-table'

// ─── Constants ───────────────────────────────────────────────────────────────

const warehouseControlService = createRecordService('warehouse-control')
const packagingService = createRecordService('packaging')

const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelCls = 'block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1'

const UNIT_OPTIONS = ['adet', 'kg', 'gram', 'litre', 'ml', 'kutu', 'palet', 'koli', 'çuval', 'ton', 'metre', 'cm']

const TYPE_OPTIONS = [
  { value: 'stock_in',    label: 'Stok Girişi',      color: 'green' },
  { value: 'stock_out',   label: 'Stok Çıkışı',      color: 'red' },
  { value: 'transfer',    label: 'Transfer',          color: 'blue' },
  { value: 'adjustment',  label: 'Sayım Düzeltme',   color: 'yellow' },
  { value: 'inspection',  label: 'Denetim',           color: 'purple' },
  { value: 'stock_count', label: 'Stok Sayımı',       color: 'orange' },
]

const TABS = [
  { id: 'depolama',  label: 'Depolama',              icon: Layers },
  { id: 'stok',      label: 'Stok Kontrolü',          icon: SlidersHorizontal },
  { id: 'yukleme',   label: 'Yükleme – Boşaltma',     icon: ArrowLeftRight },
  { id: 'paketleme', label: 'Paketleme & Etiketleme', icon: Package },
]

function typeBadge(type: string) {
  const map: Record<string, { label: string; cls: string }> = {
    stock_in:    { label: 'Stok Girişi',    cls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
    stock_out:   { label: 'Stok Çıkışı',   cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
    transfer:    { label: 'Transfer',       cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
    adjustment:  { label: 'Düzeltme',      cls: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
    inspection:  { label: 'Denetim',       cls: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' },
    stock_count: { label: 'Stok Sayımı',   cls: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
  }
  const entry = map[type] ?? { label: type, cls: 'bg-zinc-100 text-zinc-700' }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${entry.cls}`}>
      {entry.label}
    </span>
  )
}

// ─── Ürün Arama Bileşeni ──────────────────────────────────────────────────────

interface ProductSearchProps {
  onSelect: (product: WarehouseProduct) => void
  value: string
  onChange: (v: string) => void
}

function ProductSearch({ onSelect, value, onChange }: ProductSearchProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value)
  const ref = useRef<HTMLDivElement>(null)

  const { data, isFetching } = useQuery({
    queryKey: ['warehouse-products-search', query],
    queryFn: () => get<any>(`/modules/warehouse-products/search?q=${encodeURIComponent(query)}`).then(r => r.data ?? []),
    enabled: query.length >= 1,
  })

  useEffect(() => {
    setQuery(value)
  }, [value])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const products: WarehouseProduct[] = data ?? []

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
        <input
          className={`${inputCls} pl-9 pr-9`}
          placeholder="Ürün adı, SKU veya barkod..."
          value={query}
          onChange={e => { setQuery(e.target.value); onChange(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
        />
        {isFetching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 animate-spin" />
        )}
      </div>
      {open && products.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-lg max-h-52 overflow-y-auto">
          {products.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => { onSelect(p); setQuery(p.name); setOpen(false) }}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 text-left transition-colors"
            >
              <Package className="h-4 w-4 text-zinc-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{p.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {p.sku && <span className="text-xs text-zinc-400">SKU: {p.sku}</span>}
                  {p.barcode && <span className="text-xs text-zinc-400">Barkod: {p.barcode}</span>}
                  <span className="text-xs text-blue-600 dark:text-blue-400">Stok: {p.current_stock} {p.unit}</span>
                </div>
              </div>
              {p.current_stock <= p.min_stock && p.min_stock > 0 && (
                <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}
      {open && query.length >= 1 && !isFetching && products.length === 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-lg px-3 py-3 text-sm text-zinc-400">
          Ürün bulunamadı
        </div>
      )}
    </div>
  )
}

// ─── Warehouse Control Create Modal ──────────────────────────────────────────

interface WarehouseCreateModalProps {
  onClose: () => void
  defaultType?: string
  departments: { id: string; name: string }[]
  onSuccess: () => void
}

function WarehouseCreateModal({ onClose, defaultType, departments, onSuccess }: WarehouseCreateModalProps) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState(defaultType ?? '')
  const [priority, setPriority] = useState('medium')
  const [productId, setProductId] = useState('')
  const [productName, setProductName] = useState('')
  const [productQuery, setProductQuery] = useState('')
  const [sku, setSku] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('')
  const [fromLocation, setFromLocation] = useState('')
  const [toLocation, setToLocation] = useState('')
  const [batchNumber, setBatchNumber] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [transactionDate, setTransactionDate] = useState(new Date().toISOString().split('T')[0])
  const [departmentId, setDepartmentId] = useState('')
  const [description, setDescription] = useState('')

  // Barkod okutma: input'a barkod gelince ürün ara
  const barcodeRef = useRef<HTMLInputElement>(null)
  const handleBarcodeInput = async (barcode: string) => {
    if (!barcode.trim()) return
    try {
      const res = await get<any>(`/modules/warehouse-products/search?q=${encodeURIComponent(barcode)}`)
      const exact = (res.data ?? []).find((p: WarehouseProduct) => p.barcode === barcode || p.sku === barcode)
      if (exact) {
        applyProduct(exact)
        toast.success(`"${exact.name}" bulundu.`)
      } else {
        toast.error('Ürün bulunamadı.')
      }
    } catch {
      toast.error('Ürün aranamadı.')
    }
  }

  const applyProduct = (p: WarehouseProduct) => {
    setProductId(p.id)
    setProductName(p.name)
    setProductQuery(p.name)
    setSku(p.sku ?? '')
    if (!unit) setUnit(p.unit)
    if (!title) setTitle(p.name)
  }

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, any>) => warehouseControlService.create(payload),
    onSuccess: () => {
      toast.success('Kayıt oluşturuldu.')
      onSuccess()
      onClose()
    },
    onError: (e: any) => toast.error(e?.message ?? 'Kayıt oluşturulamadı.'),
  })

  const handleSubmit = () => {
    if (!title.trim()) { toast.error('Başlık zorunludur.'); return }
    const payload: Record<string, any> = { title, status: 'pending', priority, transaction_date: transactionDate }
    if (type) payload.type = type
    if (productId) payload.product_id = productId
    if (productName) payload.product_name = productName
    if (sku) payload.sku = sku
    if (quantity) payload.quantity = parseFloat(quantity)
    if (unit) payload.unit = unit
    if (fromLocation) payload.from_location = fromLocation
    if (toLocation) payload.to_location = toLocation
    if (batchNumber) payload.batch_number = batchNumber
    if (expiryDate) payload.expiry_date = expiryDate
    if (departmentId) payload.department_id = departmentId
    if (description) payload.description = description
    createMutation.mutate(payload)
  }

  const isTransfer = type === 'transfer'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Yeni Kontrol Kaydı</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">

          {/* Barkod okutma */}
          <div className="flex items-center gap-2 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700">
            <Scan className="h-4 w-4 text-zinc-400 shrink-0" />
            <input
              ref={barcodeRef}
              className="flex-1 bg-transparent text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none placeholder:text-zinc-400"
              placeholder="Barkod / QR okutun veya yazın → Enter"
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  handleBarcodeInput((e.target as HTMLInputElement).value);
                  (e.target as HTMLInputElement).value = ''
                }
              }}
            />
          </div>

          {/* Ürün arama */}
          <div>
            <label className={labelCls}>Ürün Seç</label>
            <ProductSearch
              value={productQuery}
              onChange={setProductQuery}
              onSelect={applyProduct}
            />
          </div>

          <div>
            <label className={labelCls}>Başlık <span className="text-red-500">*</span></label>
            <input className={inputCls} placeholder="Kayıt başlığı" value={title} onChange={e => setTitle(e.target.value)} />
          </div>

          <div>
            <label className={labelCls}>Hareket Tipi</label>
            <div className="grid grid-cols-3 gap-2">
              {TYPE_OPTIONS.map(o => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setType(o.value)}
                  className={`px-2 py-2 rounded-lg text-xs font-medium border transition-colors ${
                    type === o.value
                      ? 'bg-orange-600 border-orange-600 text-white'
                      : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-orange-400'
                  }`}
                >
                  {o.label}
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>SKU</label>
              <input className={inputCls} placeholder="Ürün kodu" value={sku} onChange={e => setSku(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Miktar</label>
              <input type="number" min="0" step="0.01" className={inputCls} placeholder="0" value={quantity} onChange={e => setQuantity(e.target.value)} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Birim</label>
            <div className="flex flex-wrap gap-1.5">
              {UNIT_OPTIONS.map(u => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnit(u)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    unit === u
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-blue-400'
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>

          {/* Lokasyon: transfer ise from/to, değilse tek alan */}
          {isTransfer ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Nereden (Çıkış)</label>
                <input className={inputCls} placeholder="A-01, Depo 1..." value={fromLocation} onChange={e => setFromLocation(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Nereye (Giriş)</label>
                <input className={inputCls} placeholder="B-05, Depo 2..." value={toLocation} onChange={e => setToLocation(e.target.value)} />
              </div>
            </div>
          ) : type === 'stock_in' ? (
            <div>
              <label className={labelCls}>Giriş Lokasyonu</label>
              <input className={inputCls} placeholder="Raf, bölme..." value={toLocation} onChange={e => setToLocation(e.target.value)} />
            </div>
          ) : (
            <div>
              <label className={labelCls}>Çıkış Lokasyonu</label>
              <input className={inputCls} placeholder="Raf, bölme..." value={fromLocation} onChange={e => setFromLocation(e.target.value)} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Parti / Lot No</label>
              <input className={inputCls} placeholder="İsteğe bağlı" value={batchNumber} onChange={e => setBatchNumber(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Son Kullanma Tarihi</label>
              <input type="date" className={inputCls} value={expiryDate} onChange={e => setExpiryDate(e.target.value)} />
            </div>
          </div>

          <div>
            <label className={labelCls}>İşlem Tarihi</label>
            <input type="date" className={inputCls} value={transactionDate} onChange={e => setTransactionDate(e.target.value)} />
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
        <div className="flex justify-end gap-3 px-5 pb-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
            İptal
          </button>
          <button onClick={handleSubmit} disabled={createMutation.isPending}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-60">
            {createMutation.isPending ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Ürün Kataloğu Modal ──────────────────────────────────────────────────────

function ProductCatalogModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({ name: '', sku: '', barcode: '', unit: 'adet', category: '', unit_price: '', min_stock: '0', description: '' })

  const { data, isLoading } = useQuery({
    queryKey: ['warehouse-products-catalog', search],
    queryFn: () => get<any>(`/modules/warehouse-products?search=${encodeURIComponent(search)}&per_page=50`).then(r => r.data ?? []),
  })

  const createMutation = useMutation({
    mutationFn: (payload: any) => post<any>('/modules/warehouse-products', payload),
    onSuccess: () => {
      toast.success('Ürün eklendi.')
      qc.invalidateQueries({ queryKey: ['warehouse-products-catalog'] })
      qc.invalidateQueries({ queryKey: ['warehouse-products-search'] })
      setShowAdd(false)
      setForm({ name: '', sku: '', barcode: '', unit: 'adet', category: '', unit_price: '', min_stock: '0', description: '' })
    },
    onError: (e: any) => toast.error(e?.message ?? 'Ürün eklenemedi.'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => del<any>(`/modules/warehouse-products/${id}`),
    onSuccess: () => {
      toast.success('Ürün silindi.')
      qc.invalidateQueries({ queryKey: ['warehouse-products-catalog'] })
      qc.invalidateQueries({ queryKey: ['warehouse-products-search'] })
    },
    onError: (e: any) => toast.error(e?.message ?? 'Silinemedi.'),
  })

  const products: WarehouseProduct[] = data ?? []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <div className="flex items-center gap-2">
            <BoxSelect className="h-5 w-5 text-orange-600" />
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Ürün Kataloğu</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAdd(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Yeni Ürün
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {showAdd && (
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 shrink-0">
            <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-3">Yeni Ürün Ekle</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Ürün Adı <span className="text-red-500">*</span></label>
                <input className={inputCls} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ürün adı" />
              </div>
              <div>
                <label className={labelCls}>SKU</label>
                <input className={inputCls} value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} placeholder="Ürün kodu" />
              </div>
              <div>
                <label className={labelCls}>Barkod</label>
                <input className={inputCls} value={form.barcode} onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))} placeholder="EAN, QR..." />
              </div>
              <div>
                <label className={labelCls}>Birim</label>
                <select className={inputCls} value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
                  {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Kategori</label>
                <input className={inputCls} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="İsteğe bağlı" />
              </div>
              <div>
                <label className={labelCls}>Birim Fiyatı (₺)</label>
                <input type="number" min="0" step="0.01" className={inputCls} value={form.unit_price} onChange={e => setForm(f => ({ ...f, unit_price: e.target.value }))} placeholder="0.00" />
              </div>
              <div>
                <label className={labelCls}>Min. Stok (Kritik Sınır)</label>
                <input type="number" min="0" className={inputCls} value={form.min_stock} onChange={e => setForm(f => ({ ...f, min_stock: e.target.value }))} placeholder="0" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800">İptal</button>
              <button
                disabled={createMutation.isPending}
                onClick={() => {
                  if (!form.name.trim()) { toast.error('Ürün adı zorunludur.'); return }
                  const p: any = { name: form.name }
                  if (form.sku) p.sku = form.sku
                  if (form.barcode) p.barcode = form.barcode
                  p.unit = form.unit
                  if (form.category) p.category = form.category
                  if (form.unit_price) p.unit_price = parseFloat(form.unit_price)
                  p.min_stock = parseInt(form.min_stock) || 0
                  createMutation.mutate(p)
                }}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-60"
              >
                {createMutation.isPending ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>
        )}

        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <input
              className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ürün ara (ad, SKU, barkod)..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 text-zinc-400 animate-spin" />
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-12">
              <Package className="h-10 w-10 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
              <p className="text-sm text-zinc-400">Ürün kataloğu boş.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700">
                <tr>
                  <th className="text-left text-xs font-medium text-zinc-500 px-4 py-3">Ürün</th>
                  <th className="text-left text-xs font-medium text-zinc-500 px-4 py-3">SKU / Barkod</th>
                  <th className="text-right text-xs font-medium text-zinc-500 px-4 py-3">Stok</th>
                  <th className="text-right text-xs font-medium text-zinc-500 px-4 py-3">Birim Fiyat</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {products.map(p => (
                  <tr key={p.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {p.current_stock <= p.min_stock && p.min_stock > 0 && (
                          <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                        )}
                        <div>
                          <p className="font-medium text-zinc-900 dark:text-zinc-100">{p.name}</p>
                          {p.category && <p className="text-xs text-zinc-400">{p.category}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-500">
                      <p>{p.sku ?? '—'}</p>
                      {p.barcode && <p className="text-xs text-zinc-400">{p.barcode}</p>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-medium ${p.current_stock <= p.min_stock && p.min_stock > 0 ? 'text-red-600' : 'text-zinc-900 dark:text-zinc-100'}`}>
                        {p.current_stock} {p.unit}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-700 dark:text-zinc-300">
                      {p.unit_price != null ? `₺${Number(p.unit_price).toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => deleteMutation.mutate(p.id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-zinc-400 hover:text-red-600 transition-colors"
                        title="Sil"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex justify-end px-4 pb-4 pt-3 border-t border-zinc-200 dark:border-zinc-800 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800">
            Kapat
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Packaging Create Modal ───────────────────────────────────────────────────

interface PackagingCreateModalProps {
  onClose: () => void
  departments: { id: string; name: string }[]
  onSuccess: () => void
}

function PackagingCreateModal({ onClose, departments, onSuccess }: PackagingCreateModalProps) {
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState('medium')
  const [orderNumber, setOrderNumber] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [itemCount, setItemCount] = useState('')
  const [packageType, setPackageType] = useState('')
  const [weight, setWeight] = useState('')
  const [dimensions, setDimensions] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [description, setDescription] = useState('')

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, any>) => packagingService.create(payload),
    onSuccess: () => { toast.success('Paket kaydı oluşturuldu.'); onSuccess(); onClose() },
    onError: (e: any) => toast.error(e?.message ?? 'Kayıt oluşturulamadı.'),
  })

  const handleSubmit = () => {
    if (!title.trim()) { toast.error('Başlık zorunludur.'); return }
    const payload: Record<string, any> = { title, status: 'pending', priority }
    if (orderNumber) payload.order_number = orderNumber
    if (customerName) payload.customer_name = customerName
    if (itemCount) payload.item_count = parseInt(itemCount)
    if (packageType) payload.package_type = packageType
    if (weight) payload.weight = parseFloat(weight)
    if (dimensions) payload.dimensions = dimensions
    if (departmentId) payload.department_id = departmentId
    if (description) payload.description = description
    createMutation.mutate(payload)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Yeni Paket Kaydı</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className={labelCls}>Başlık <span className="text-red-500">*</span></label>
            <input className={inputCls} placeholder="Paket başlığı" value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Öncelik</label>
            <select className={inputCls} value={priority} onChange={e => setPriority(e.target.value)}>
              {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Sipariş No</label>
              <input className={inputCls} placeholder="ORD-001" value={orderNumber} onChange={e => setOrderNumber(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Müşteri Adı</label>
              <input className={inputCls} placeholder="İsteğe bağlı" value={customerName} onChange={e => setCustomerName(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Paket Sayısı</label>
              <input type="number" min="0" className={inputCls} placeholder="0" value={itemCount} onChange={e => setItemCount(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Paket Türü</label>
              <input className={inputCls} placeholder="Koli, palet..." value={packageType} onChange={e => setPackageType(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Ağırlık (kg)</label>
              <input type="number" min="0" step="0.01" className={inputCls} placeholder="0.00" value={weight} onChange={e => setWeight(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Boyutlar</label>
              <input className={inputCls} placeholder="50x40x30 cm" value={dimensions} onChange={e => setDimensions(e.target.value)} />
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
        <div className="flex justify-end gap-3 px-5 pb-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
            İptal
          </button>
          <button onClick={handleSubmit} disabled={createMutation.isPending}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-60">
            {createMutation.isPending ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Warehouse Control Tab Section ────────────────────────────────────────────

interface WarehouseControlTabSectionProps {
  tabId: 'depolama' | 'stok' | 'yukleme'
  departments: { id: string; name: string }[]
}

function WarehouseControlTabSection({ tabId, departments }: WarehouseControlTabSectionProps) {
  const qc = useQueryClient()
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [typeChip, setTypeChip] = useState('all')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const stokChips = [
    { id: 'all',         label: 'Tümü' },
    { id: 'stock_in',    label: 'Stok Girişi' },
    { id: 'stock_out',   label: 'Stok Çıkışı' },
    { id: 'adjustment',  label: 'Düzeltme' },
    { id: 'stock_count', label: 'Stok Sayımı' },
  ]
  const yuklemeChips = [
    { id: 'all',       label: 'Tümü' },
    { id: 'stock_out', label: 'Yükleme' },
    { id: 'stock_in',  label: 'Boşaltma' },
    { id: 'transfer',  label: 'Transfer' },
  ]

  const chips = tabId === 'stok' ? stokChips : tabId === 'yukleme' ? yuklemeChips : []
  const defaultType = tabId === 'stok' ? 'stock_in' : tabId === 'yukleme' ? 'stock_in' : undefined

  const { user, roleLevel } = useAuthStore()
  const deptFilter = roleLevel === ROLE_LEVELS.DEPARTMENT_MANAGER && user?.department_id ? user.department_id : null

  const { data, isLoading } = useQuery({
    queryKey: ['wh-control-records', tabId, page, search, typeChip, deptFilter],
    queryFn: () => {
      const params: Record<string, any> = { page: page + 1, per_page: 15 }
      if (search) params.search = search
      if (typeChip !== 'all') params.type = typeChip
      if (deptFilter) params.department_id = deptFilter
      return warehouseControlService.list(params)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => warehouseControlService.delete(id),
    onSuccess: () => {
      toast.success('Kayıt silindi.')
      qc.invalidateQueries({ queryKey: ['wh-control-records'] })
      qc.invalidateQueries({ queryKey: ['wh-control-stats'] })
      setDeleteId(null)
    },
    onError: (e: any) => toast.error(e?.message ?? 'Silinemedi.'),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => warehouseControlService.updateStatus(id, status),
    onSuccess: () => {
      toast.success('Durum güncellendi.')
      qc.invalidateQueries({ queryKey: ['wh-control-records'] })
      qc.invalidateQueries({ queryKey: ['wh-control-stats'] })
    },
    onError: (e: any) => toast.error(e?.message ?? 'Durum güncellenemedi.'),
  })

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearch(searchInput)
    setPage(0)
  }

  const col = createColumnHelper<WarehouseRecord>()
  const columns = [
    col.accessor('record_number', {
      header: 'Kayıt No',
      cell: info => <span className="text-xs font-mono text-zinc-500">{info.getValue()}</span>,
    }),
    col.accessor('title', {
      header: 'Ürün / Başlık',
      cell: info => (
        <div>
          <p className="font-medium text-zinc-900 dark:text-zinc-100 truncate max-w-[180px]">{info.getValue()}</p>
          {(info.row.original.sku || info.row.original.product_name) && (
            <p className="text-xs text-zinc-400">{info.row.original.sku ?? info.row.original.product_name}</p>
          )}
        </div>
      ),
    }),
    col.accessor('type', {
      header: 'Hareket',
      cell: info => typeBadge(info.getValue() ?? ''),
    }),
    col.accessor('status', {
      header: 'Durum',
      cell: info => <StatusBadge status={info.getValue()} label={info.row.original.status_label} />,
    }),
    col.accessor('quantity', {
      header: 'Miktar',
      cell: info => (
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {info.getValue() != null ? `${info.getValue()} ${info.row.original.unit ?? ''}`.trim() : '—'}
        </span>
      ),
    }),
    col.display({
      id: 'location_display',
      header: 'Lokasyon',
      cell: info => {
        const r = info.row.original
        if (r.from_location || r.to_location) {
          return (
            <div className="text-xs">
              {r.from_location && <p className="text-red-500">↑ {r.from_location}</p>}
              {r.to_location && <p className="text-green-600">↓ {r.to_location}</p>}
            </div>
          )
        }
        return <span className="text-sm text-zinc-500">{r.location ?? '—'}</span>
      },
    }),
    col.accessor('batch_number', {
      header: 'Parti',
      cell: info => <span className="text-xs text-zinc-400">{info.getValue() ?? '—'}</span>,
    }),
    col.accessor('transaction_date', {
      header: 'İşlem Tarihi',
      cell: info => <span className="text-xs text-zinc-500">{info.getValue() ? formatDate(info.getValue()!) : '—'}</span>,
    }),
    col.display({
      id: 'created_by',
      header: 'Oluşturan',
      cell: info => (
        <div className="flex items-center gap-1.5">
          <UserCircle className="h-4 w-4 text-zinc-400 shrink-0" />
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            {info.row.original.created_by?.name ?? '—'}
          </span>
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
            {row.status !== 'in_progress' && row.status !== 'cancelled' && row.status !== 'approved' && (
              <button title="İşleme Al" onClick={() => statusMutation.mutate({ id: row.id, status: 'in_progress' })}
                className="p-1.5 rounded-lg hover:bg-yellow-50 dark:hover:bg-yellow-950/30 text-zinc-400 hover:text-yellow-600 transition-colors">
                <Clock className="h-4 w-4" />
              </button>
            )}
            {row.status !== 'approved' && row.status !== 'cancelled' && (
              <button title="Onayla" onClick={() => statusMutation.mutate({ id: row.id, status: 'approved' })}
                className="p-1.5 rounded-lg hover:bg-green-50 dark:hover:bg-green-950/30 text-zinc-400 hover:text-green-600 transition-colors">
                <CheckCircle2 className="h-4 w-4" />
              </button>
            )}
            {row.status !== 'cancelled' && (
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
            placeholder="Kayıtlarda ara..."
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-zinc-400"
          />
        </form>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
        >
          <Plus className="h-4 w-4" />
          Yeni Kayıt
        </button>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {chips.map(chip => (
            <button
              key={chip.id}
              onClick={() => { setTypeChip(chip.id); setPage(0) }}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                typeChip === chip.id
                  ? 'bg-orange-600 border-orange-600 text-white'
                  : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-orange-400 hover:text-orange-600'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}

      <DataTable
        columns={columns as any}
        data={(data?.data ?? []) as WarehouseRecord[]}
        total={data?.meta?.total ?? 0}
        pageIndex={page}
        onPaginationChange={s => setPage(s.pageIndex)}
        isLoading={isLoading}
        emptyMessage="Henüz kontrol kaydı yok."
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
        <WarehouseCreateModal
          onClose={() => setShowCreate(false)}
          defaultType={defaultType}
          departments={departments}
          onSuccess={() => qc.invalidateQueries({ queryKey: ['wh-control-records', tabId] })}
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
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const { user, roleLevel } = useAuthStore()
  const deptFilter = roleLevel === ROLE_LEVELS.DEPARTMENT_MANAGER && user?.department_id ? user.department_id : null

  const { data, isLoading } = useQuery({
    queryKey: ['wh-control-packaging', page, search, deptFilter],
    queryFn: () => {
      const params: Record<string, any> = { page: page + 1, per_page: 15 }
      if (search) params.search = search
      if (deptFilter) params.department_id = deptFilter
      return packagingService.list(params)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => packagingService.delete(id),
    onSuccess: () => {
      toast.success('Paket kaydı silindi.')
      qc.invalidateQueries({ queryKey: ['wh-control-packaging'] })
      setDeleteId(null)
    },
    onError: (e: any) => toast.error(e?.message ?? 'Silinemedi.'),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => packagingService.updateStatus(id, status),
    onSuccess: () => {
      toast.success('Durum güncellendi.')
      qc.invalidateQueries({ queryKey: ['wh-control-packaging'] })
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
      cell: info => <p className="font-medium text-zinc-900 dark:text-zinc-100 truncate max-w-[180px]">{info.getValue()}</p>,
    }),
    col.accessor('status', {
      header: 'Durum',
      cell: info => <StatusBadge status={info.getValue()} label={info.row.original.status_label} />,
    }),
    col.accessor('order_number', {
      header: 'Sipariş No',
      cell: info => <span className="text-sm text-zinc-500">{info.getValue() ?? '—'}</span>,
    }),
    col.accessor('customer_name', {
      header: 'Müşteri',
      cell: info => <span className="text-sm text-zinc-700 dark:text-zinc-300">{info.getValue() ?? '—'}</span>,
    }),
    col.accessor('item_count', {
      header: 'Paket',
      cell: info => <span className="text-sm text-zinc-700 dark:text-zinc-300">{info.getValue() ?? '—'}</span>,
    }),
    col.display({
      id: 'created_by',
      header: 'Oluşturan',
      cell: info => (
        <div className="flex items-center gap-1.5">
          <UserCircle className="h-4 w-4 text-zinc-400 shrink-0" />
          <span className="text-sm text-zinc-600 dark:text-zinc-400">{info.row.original.created_by?.name ?? '—'}</span>
        </div>
      ),
    }),
    col.accessor('created_at', {
      header: 'Tarih',
      cell: info => <span className="text-sm text-zinc-500">{formatDate(info.getValue())}</span>,
    }),
    col.display({
      id: 'actions',
      header: '',
      cell: info => {
        const row = info.row.original
        return (
          <div className="flex items-center gap-1">
            {row.status !== 'in_progress' && row.status !== 'cancelled' && row.status !== 'completed' && (
              <button title="İşleme Al" onClick={() => statusMutation.mutate({ id: row.id, status: 'in_progress' })}
                className="p-1.5 rounded-lg hover:bg-yellow-50 dark:hover:bg-yellow-950/30 text-zinc-400 hover:text-yellow-600 transition-colors">
                <Clock className="h-4 w-4" />
              </button>
            )}
            {row.status !== 'completed' && row.status !== 'cancelled' && (
              <button title="Tamamlandı" onClick={() => statusMutation.mutate({ id: row.id, status: 'completed' })}
                className="p-1.5 rounded-lg hover:bg-green-50 dark:hover:bg-green-950/30 text-zinc-400 hover:text-green-600 transition-colors">
                <CheckCircle2 className="h-4 w-4" />
              </button>
            )}
            {row.status !== 'cancelled' && (
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
            placeholder="Paket kayıtlarında ara..."
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-zinc-400"
          />
        </form>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap">
          <Plus className="h-4 w-4" />
          Yeni Paket
        </button>
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
        title="Paket kaydını sil?"
        description="Bu kayıt kalıcı olarak silinecek."
        confirmLabel="Evet, Sil"
        loading={deleteMutation.isPending}
      />

      {showCreate && (
        <PackagingCreateModal
          onClose={() => setShowCreate(false)}
          departments={departments}
          onSuccess={() => qc.invalidateQueries({ queryKey: ['wh-control-packaging'] })}
        />
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WarehouseControlPage() {
  const [activeTab, setActiveTab] = useState('depolama')
  const [showProductCatalog, setShowProductCatalog] = useState(false)

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['wh-control-stats'],
    queryFn: () => get<any>('/dashboard/module/warehouse-control').then(r => r.data),
  })

  const { data: productStatsData, isLoading: productStatsLoading } = useQuery({
    queryKey: ['wh-product-stats'],
    queryFn: () => get<any>('/modules/warehouse-products/stats').then(r => r.data),
  })

  const { data: deptData } = useQuery({
    queryKey: ['company-departments-list'],
    queryFn: () => get<any>('/company/departments').then(r => r.data ?? []),
  })
  const departments: { id: string; name: string }[] = deptData ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Depo Kontrolcüsü"
        description="Operasyonel depo kontrolü"
        breadcrumbs={[{ label: 'Modüller' }, { label: 'Depo Kontrolcüsü' }]}
        actions={
          <button
            onClick={() => setShowProductCatalog(true)}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <BoxSelect className="h-4 w-4" />
            Ürün Kataloğu
          </button>
        }
      />

      {/* Stats - 6 kart: hareket + ürün istatistikleri */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <StatsCard
          title="Toplam Kayıt"
          value={statsData?.total ?? 0}
          icon={ClipboardCheck}
          color="orange"
          loading={statsLoading}
          subtitle="Tüm hareketler"
        />
        <StatsCard
          title="Stok Giriş"
          value={statsData?.stock_in_this_month ?? statsData?.this_month ?? 0}
          icon={ArrowDownCircle}
          color="green"
          loading={statsLoading}
          subtitle="Bu ay"
        />
        <StatsCard
          title="Stok Çıkış"
          value={statsData?.stock_out_this_month ?? statsData?.completed ?? 0}
          icon={ArrowUpCircle}
          color="red"
          loading={statsLoading}
          subtitle="Bu ay"
        />
        <StatsCard
          title="Bekleyen"
          value={statsData?.pending ?? 0}
          icon={ClipboardList}
          color="purple"
          loading={statsLoading}
          subtitle="İşlem bekliyor"
        />
        <StatsCard
          title="Kritik Stok"
          value={productStatsData?.critical_stock ?? 0}
          icon={AlertTriangle}
          color="red"
          loading={productStatsLoading}
          subtitle="Min. altı ürün"
        />
        <StatsCard
          title="Stok Değeri"
          value={productStatsData?.total_stock_value
            ? `₺${Number(productStatsData.total_stock_value).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}`
            : '₺0'}
          icon={TrendingUp}
          color="green"
          loading={productStatsLoading}
          subtitle={`${productStatsData?.active_products ?? 0} aktif ürün`}
        />
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
                      ? 'border-b-2 border-orange-600 text-orange-600'
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
          {activeTab === 'depolama' && <WarehouseControlTabSection tabId="depolama" departments={departments} />}
          {activeTab === 'stok' && <WarehouseControlTabSection tabId="stok" departments={departments} />}
          {activeTab === 'yukleme' && <WarehouseControlTabSection tabId="yukleme" departments={departments} />}
          {activeTab === 'paketleme' && <PackagingTabSection departments={departments} />}
        </div>
      </div>

      {showProductCatalog && (
        <ProductCatalogModal onClose={() => setShowProductCatalog(false)} />
      )}
    </div>
  )
}
