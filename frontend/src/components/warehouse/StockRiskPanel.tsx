'use client'

import { Fragment, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Loader2, Search, Settings2, X } from 'lucide-react'
import { toast } from 'sonner'
import { SaveButton } from '@/components/common/SaveButton'
import { get, put } from '@/lib/api'
import { cn } from '@/lib/utils'
import { apiErrorMessage, formatQty, useWarehouses } from './stock'
import { useSuppliers } from './purchasing/api'

type RiskLevel = 'critical' | 'high' | 'medium' | 'low'

interface RiskRow {
  product_id: string
  name: string
  sku?: string | null
  unit: string
  available: number
  daily_consumption: number
  days_of_cover: number | null
  lead_time_days: number
  lead_time_estimated: boolean
  safety_stock: number
  min_stock: number
  stockout_probability: number
  expiry_risk_qty: number
  risk_score: number
  risk_level: RiskLevel
  driver: 'stockout' | 'below_min' | 'expiry' | 'reorder' | null
  suggested_order_qty: number
  explanation: string
  recommendation: string
  on_order: number
  in_draft: number
  default_supplier_id: string | null
  supplier_name: string | null
  min_order_qty: number | null
  order_multiple: number | null
}

const LEVELS: Record<RiskLevel, { label: string; card: string; bar: string; text: string }> = {
  critical: { label: 'Kritik', card: 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30',        bar: 'bg-red-500',     text: 'text-red-700 dark:text-red-400' },
  high:     { label: 'Yüksek', card: 'border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950/30', bar: 'bg-orange-500', text: 'text-orange-700 dark:text-orange-400' },
  medium:   { label: 'Orta',   card: 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30',  bar: 'bg-amber-400',   text: 'text-amber-700 dark:text-amber-400' },
  low:      { label: 'Düşük',  card: 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30',  bar: 'bg-green-500',   text: 'text-green-700 dark:text-green-400' },
}

const DRIVERS: Record<string, string> = {
  stockout:  'Tükenme riski',
  below_min: 'Min/güvenlik stoğu altı',
  expiry:    'SKT riski',
  reorder:   'Sipariş noktası',
}

const inputCls = 'px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500'

/** Ürün bazında 0–100 stok risk skoru, açıklama ve öneri. */
export function StockRiskPanel() {
  const [level, setLevel] = useState<RiskLevel | ''>('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editing, setEditing] = useState<RiskRow | null>(null)
  const { data: warehouses = [] } = useWarehouses()

  const { data, isLoading } = useQuery({
    queryKey: ['stock-risk', level, search, warehouseId],
    queryFn: () => {
      const params = new URLSearchParams()
      if (level) params.set('level', level)
      if (search) params.set('search', search)
      if (warehouseId) params.set('warehouse_id', warehouseId)
      return get<{ data: RiskRow[]; summary: Record<RiskLevel, number> }>(`/modules/stock/risk?${params}`)
    },
  })

  const rows = data?.data ?? []

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {(Object.keys(LEVELS) as RiskLevel[]).map((l) => (
          <button
            key={l}
            onClick={() => setLevel(level === l ? '' : l)}
            className={cn(
              'text-left rounded-xl border px-4 py-3 transition-shadow',
              LEVELS[l].card,
              level === l && 'ring-2 ring-offset-1 ring-blue-500 dark:ring-offset-zinc-900'
            )}
          >
            <p className={cn('text-xs font-medium', LEVELS[l].text)}>{LEVELS[l].label} risk</p>
            <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{data?.summary?.[l] ?? '—'}</p>
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <form onSubmit={(e) => { e.preventDefault(); setSearch(searchInput) }} className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Ürün veya SKU..." className={`${inputCls} w-full pl-9`} />
        </form>
        <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className={inputCls}>
          <option value="">Tüm depolar</option>
          {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <p className="text-xs text-zinc-400 sm:ml-auto">* Tedarik süresi girilmemiş, varsayılan kullanıldı</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-xs text-zinc-500">
            <tr>
              <th className="text-left px-3 py-2.5 w-6" />
              <th className="text-left px-3 py-2.5">Ürün</th>
              <th className="text-right px-3 py-2.5">Kullanılabilir</th>
              <th className="text-right px-3 py-2.5">Günlük tüketim</th>
              <th className="text-right px-3 py-2.5">Tahmini gün</th>
              <th className="text-right px-3 py-2.5">Tedarik</th>
              <th className="text-left px-3 py-2.5 min-w-40">Risk</th>
              <th className="text-left px-3 py-2.5">Öneri</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {isLoading ? (
              <tr><td colSpan={9} className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin text-zinc-400 inline" /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} className="py-12 text-center text-zinc-400">Ürün yok.</td></tr>
            ) : rows.map((r) => {
              const lv = LEVELS[r.risk_level]
              const open = expanded === r.product_id
              return (
                <Fragment key={r.product_id}>
                  <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 cursor-pointer" onClick={() => setExpanded(open ? null : r.product_id)}>
                    <td className="px-3 py-2.5 text-zinc-400">{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-zinc-900 dark:text-zinc-100">{r.name}</p>
                      {r.sku && <p className="text-xs text-zinc-400">{r.sku}</p>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatQty(r.available)} {r.unit}
                      {r.on_order > 0 && <p className="text-[11px] text-blue-600">+{formatQty(r.on_order)} yolda</p>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.daily_consumption ? formatQty(r.daily_consumption) : '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.days_of_cover != null ? formatQty(r.days_of_cover) : '∞'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.lead_time_days} gün{r.lead_time_estimated ? '*' : ''}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                          <div className={cn('h-full rounded-full', lv.bar)} style={{ width: `${Math.max(r.risk_score, 3)}%` }} />
                        </div>
                        <span className={cn('text-xs font-semibold tabular-nums', lv.text)}>%{r.risk_score}</span>
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-0.5">{lv.label}{r.driver ? ` · ${DRIVERS[r.driver]}` : ''}</p>
                    </td>
                    <td className="px-3 py-2.5 text-xs font-medium text-zinc-700 dark:text-zinc-300">{r.recommendation}</td>
                    <td className="px-3 py-2.5">
                      <button
                        title="Tedarik süresi / güvenlik stoğu"
                        onClick={(e) => { e.stopPropagation(); setEditing(r) }}
                        className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-blue-600"
                      >
                        <Settings2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                  {open && (
                    <tr className="bg-zinc-50/60 dark:bg-zinc-900/60">
                      <td />
                      <td colSpan={8} className="px-3 py-3 text-sm text-zinc-600 dark:text-zinc-300">
                        <p>{r.explanation}</p>
                        <div className="flex flex-wrap gap-3 mt-2 text-xs text-zinc-500">
                          <span>Tükenme olasılığı: %{r.stockout_probability}</span>
                          {r.expiry_risk_qty > 0 && <span className="text-red-500">SKT riski: {formatQty(r.expiry_risk_qty)} {r.unit}</span>}
                          <span>Güvenlik stoğu: {formatQty(r.safety_stock)}</span>
                          <span>Min. stok: {formatQty(r.min_stock)}</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {editing && <ProductParamsModal row={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

// ─── Ürün risk parametreleri ─────────────────────────────────────────────────

function ProductParamsModal({ row, onClose }: { row: RiskRow; onClose: () => void }) {
  const qc = useQueryClient()
  const [leadTime, setLeadTime] = useState(row.lead_time_estimated ? '' : String(row.lead_time_days))
  const [safety, setSafety] = useState(row.safety_stock ? String(row.safety_stock) : '')
  const [minStock, setMinStock] = useState(row.min_stock ? String(row.min_stock) : '')
  const [supplierId, setSupplierId] = useState(row.default_supplier_id ?? '')
  const [minOrder, setMinOrder] = useState(row.min_order_qty ? String(row.min_order_qty) : '')
  const [multiple, setMultiple] = useState(row.order_multiple ? String(row.order_multiple) : '')
  const { data: suppliers = [] } = useSuppliers(true)

  const saveMutation = useMutation({
    mutationFn: () => put(`/modules/warehouse-products/${row.product_id}`, {
      lead_time_days: leadTime ? parseInt(leadTime) : null,
      safety_stock: safety ? parseFloat(safety) : null,
      min_stock: minStock ? parseFloat(minStock) : 0,
      default_supplier_id: supplierId || null,
      min_order_qty: minOrder ? parseFloat(minOrder) : null,
      order_multiple: multiple ? parseFloat(multiple) : null,
    }),
    onSuccess: () => {
      toast.success('Parametreler güncellendi, risk yeniden hesaplandı.')
      qc.invalidateQueries({ queryKey: ['stock-risk'] })
      qc.invalidateQueries({ queryKey: ['stock-balances'] })
      qc.invalidateQueries({ queryKey: ['purchasing-suggestions'] })
      onClose()
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Kaydedilemedi.')),
  })

  const fieldCls = `${inputCls} w-full`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b border-zinc-200 dark:border-zinc-800">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Stok ve Tedarik Parametreleri</h2>
            <p className="text-xs text-zinc-500 truncate">{row.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Tedarik süresi (gün)</label>
            <input type="number" min="1" max="365" className={fieldCls} value={leadTime} onChange={(e) => setLeadTime(e.target.value)} placeholder="Boş: varsayılan 7 gün" />
            <p className="mt-1 text-[11px] text-zinc-400">Siparişten depoya girişe kadar geçen ortalama süre.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Güvenlik stoğu ({row.unit})</label>
            <input type="number" min="0" step="any" className={fieldCls} value={safety} onChange={(e) => setSafety(e.target.value)} placeholder="0" />
            <p className="mt-1 text-[11px] text-zinc-400">Beklenmedik talep ve gecikmeye karşı elde tutulacak miktar.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Minimum stok ({row.unit})</label>
            <input type="number" min="0" step="any" className={fieldCls} value={minStock} onChange={(e) => setMinStock(e.target.value)} placeholder="0" />
          </div>
          <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Varsayılan tedarikçi</label>
            <select className={fieldCls} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Seçilmemiş</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Min. sipariş</label>
              <input type="number" min="0" step="any" className={fieldCls} value={minOrder} onChange={(e) => setMinOrder(e.target.value)} placeholder="—" />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Paket / koli katı</label>
              <input type="number" min="0" step="any" className={fieldCls} value={multiple} onChange={(e) => setMultiple(e.target.value)} placeholder="—" />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-5 pb-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300">İptal</button>
          <SaveButton size="sm" onSave={() => saveMutation.mutateAsync()} idleText="Kaydet" savedText="Kaydedildi" />
        </div>
      </div>
    </div>
  )
}
