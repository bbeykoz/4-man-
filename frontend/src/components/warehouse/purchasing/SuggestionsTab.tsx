'use client'

import { useMemo, useState } from 'react'
import { BrandLoaderBlock } from '@/components/common/BrandLoader'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckSquare, ShoppingCart, Square } from 'lucide-react'
import { toast } from 'sonner'
import { get, post } from '@/lib/api'
import { cn } from '@/lib/utils'
import { apiErrorMessage, formatQty, useWarehouses } from '../stock'
import { PURCHASING_QUERY_KEYS, formatMoney, inputCls, useSuppliers, type Suggestion } from './api'

const RISK_CLS: Record<Suggestion['risk_level'], string> = {
  critical: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  high:     'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  medium:   'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  low:      'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
}

interface LineState { selected: boolean; qty: string; supplierId: string }

/** Otomatik satın alma önerileri → seçilenlerden tedarikçi başına taslak sipariş (kullanıcı onayı). */
export function SuggestionsTab({ onCreated }: { onCreated: () => void }) {
  const qc = useQueryClient()
  const { data: warehouses = [] } = useWarehouses()
  const { data: suppliers = [] } = useSuppliers(true)
  const [warehouseId, setWarehouseId] = useState('')
  const [lines, setLines] = useState<Record<string, LineState>>({})

  const { data = [], isLoading } = useQuery({
    queryKey: ['purchasing-suggestions'],
    queryFn: () => get<{ data: Suggestion[] }>('/modules/purchasing/suggestions').then(r => r.data ?? []),
  })

  const line = (s: Suggestion): LineState =>
    lines[s.product_id] ?? { selected: false, qty: String(s.suggested_qty), supplierId: s.supplier_id ?? '' }
  const setLine = (s: Suggestion, patch: Partial<LineState>) =>
    setLines(prev => ({ ...prev, [s.product_id]: { ...line(s), ...patch } }))

  const groups = useMemo(() => {
    const map = new Map<string, Suggestion[]>()
    for (const s of data) {
      const key = s.supplier_name ?? 'Tedarikçi atanmamış'
      map.set(key, [...(map.get(key) ?? []), s])
    }
    return [...map.entries()]
  }, [data])

  const selected = data.filter(s => line(s).selected)

  // Seçilen satırların ihtiyaç depoları; teslim deposu bunlarla uyuşmuyorsa uyarılır
  const ihtiyacDepolari = [...new Set(selected.map(s => s.need_warehouse_id).filter(Boolean))] as string[]
  const teslimDeposu = warehouseId || warehouses.find(w => w.is_default)?.id || ''
  const ihtiyacUyarisi = (() => {
    if (ihtiyacDepolari.length === 0) return null
    const adi = (id: string) => warehouses.find(w => w.id === id)?.name ?? 'bilinmeyen depo'
    if (ihtiyacDepolari.length > 1) {
      return `Seçilen ürünlerin ihtiyacı farklı depolarda (${ihtiyacDepolari.map(adi).join(', ')}). Tek teslim deposu seçilebilir; gerekirse ayrı sipariş açın.`
    }
    return ihtiyacDepolari[0] !== teslimDeposu
      ? `İhtiyaç ${adi(ihtiyacDepolari[0])} deposunda; teslim deposunu buna göre seçin.`
      : null
  })()

  const createMutation = useMutation({
    mutationFn: () => post<{ message: string }>('/modules/purchasing/suggestions/orders', {
      warehouse_id: warehouseId || null,
      lines: selected.map(s => ({
        product_id: s.product_id,
        quantity: parseFloat(line(s).qty),
        supplier_id: line(s).supplierId || null,
      })),
    }),
    onSuccess: (res) => {
      toast.success(res.message)
      setLines({})
      PURCHASING_QUERY_KEYS.forEach(key => qc.invalidateQueries({ queryKey: [...key] }))
      onCreated()
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Taslak oluşturulamadı.')),
  })

  const submit = () => {
    if (selected.some(s => !line(s).supplierId)) { toast.error('Seçili satırlarda tedarikçi seçin.'); return }
    if (selected.some(s => !(parseFloat(line(s).qty) > 0))) { toast.error('Miktar sıfırdan büyük olmalı.'); return }
    createMutation.mutate()
  }

  if (isLoading) return <BrandLoaderBlock size={64} />

  if (data.length === 0) {
    return <p className="py-12 text-center text-sm text-zinc-400">Şu an sipariş gereken ürün yok. Taslak veya yoldaki siparişler ihtiyacı karşılıyor.</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <p className="text-xs text-zinc-500 max-w-xl">
          Miktar = günlük tüketim × (tedarik süresi + gözden geçirme) + güvenlik stoğu − eldeki − yoldaki; min. sipariş / paket katına yuvarlanır.
          Sipariş sadece onayınızla <strong>taslak</strong> olarak oluşur.
        </p>
        <div className="flex flex-col items-end gap-1">
         <div className="flex items-center gap-2">
          <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)} className={inputCls} title="Teslim deposu">
            <option value="">Teslim: varsayılan depo</option>
            {warehouses.filter(w => w.is_active).map(w => <option key={w.id} value={w.id}>Teslim: {w.name}</option>)}
          </select>
          <button
            onClick={submit}
            disabled={selected.length === 0 || createMutation.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 whitespace-nowrap"
          >
            <ShoppingCart className="h-4 w-4" />
            {createMutation.isPending ? 'Oluşturuluyor...' : `Taslak Sipariş Oluştur (${selected.length})`}
          </button>
         </div>
         {/* Seçilen satırların ihtiyacı başka depodaysa kullanıcı uyarılır */}
         {ihtiyacUyarisi && (
           <p className="text-[11px] text-amber-600 dark:text-amber-400 max-w-sm text-right">
             {ihtiyacUyarisi}
           </p>
         )}
        </div>
      </div>

      {groups.map(([supplierName, rows]) => {
        const allSelected = rows.every(s => line(s).selected)
        const groupTotal = rows.filter(s => line(s).selected)
          .reduce((sum, s) => sum + (s.unit_price ?? 0) * (parseFloat(line(s).qty) || 0), 0)

        return (
          <div key={supplierName} className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800/50">
              <button
                onClick={() => rows.forEach(s => setLine(s, { selected: !allSelected }))}
                className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200"
              >
                {allSelected ? <CheckSquare className="h-4 w-4 text-blue-600" /> : <Square className="h-4 w-4 text-zinc-400" />}
                {supplierName}
                <span className="text-xs font-normal text-zinc-500">({rows.length} ürün)</span>
              </button>
              {groupTotal > 0 && <span className="text-xs text-zinc-500">Seçili tutar: <strong>{formatMoney(groupTotal)}</strong></span>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-zinc-500">
                  <tr className="border-b border-zinc-100 dark:border-zinc-800">
                    <th className="w-8 px-3 py-2" />
                    <th className="text-left px-3 py-2">Ürün</th>
                    <th className="text-right px-3 py-2">Eldeki / Yolda</th>
                    <th className="text-right px-3 py-2">Günlük</th>
                    <th className="text-left px-3 py-2">Risk</th>
                    <th className="text-left px-3 py-2 w-32">Sipariş miktarı</th>
                    {!rows[0].supplier_id && <th className="text-left px-3 py-2">Tedarikçi</th>}
                    <th className="text-right px-3 py-2">Tahmini tutar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {rows.map(s => {
                    const l = line(s)
                    return (
                      <tr key={s.product_id} className={cn(l.selected && 'bg-blue-50/50 dark:bg-blue-950/20')}>
                        <td className="px-3 py-2.5 align-top">
                          <button onClick={() => setLine(s, { selected: !l.selected })} aria-label="Seç">
                            {l.selected ? <CheckSquare className="h-4 w-4 text-blue-600" /> : <Square className="h-4 w-4 text-zinc-400" />}
                          </button>
                        </td>
                        <td className="px-3 py-2.5 align-top">
                          <p className="font-medium text-zinc-900 dark:text-zinc-100">{s.name}</p>
                          {/* İhtiyacın hangi depoda olduğu; teslim deposu yanlış seçilmesin */}
                          {s.need_warehouse_name && (
                            <p className="text-[11px] font-medium text-blue-600 dark:text-blue-400">
                              İhtiyaç: {s.need_warehouse_name}
                              {s.warehouse_breakdown.length > 1 && (
                                <span className="font-normal text-zinc-400">
                                  {' '}· diğer depolar: {s.warehouse_breakdown.filter(b => b.warehouse_id !== s.need_warehouse_id)
                                    .map(b => `${b.warehouse_name} ${formatQty(b.available)}`).join(', ')}
                                </span>
                              )}
                            </p>
                          )}
                          <p className="text-[11px] text-zinc-400 max-w-md">{s.reason}</p>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums align-top">
                          {formatQty(s.available)}{s.on_order > 0 && <span className="text-blue-600"> / {formatQty(s.on_order)}</span>} {s.unit}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums align-top">{formatQty(s.daily_consumption)}</td>
                        <td className="px-3 py-2.5 align-top">
                          <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', RISK_CLS[s.risk_level])}>%{s.risk_score}</span>
                        </td>
                        <td className="px-3 py-2.5 align-top">
                          <div className="flex items-center gap-1">
                            <input
                              type="number" min="0" step="any"
                              value={l.qty}
                              onChange={e => setLine(s, { qty: e.target.value, selected: true })}
                              className={`${inputCls} w-24 py-1.5`}
                            />
                            <span className="text-xs text-zinc-400">{s.unit}</span>
                          </div>
                          {parseFloat(l.qty) !== s.suggested_qty && <p className="text-[11px] text-zinc-400 mt-0.5">Öneri: {formatQty(s.suggested_qty)}</p>}
                        </td>
                        {!rows[0].supplier_id && (
                          <td className="px-3 py-2.5 align-top">
                            <select value={l.supplierId} onChange={e => setLine(s, { supplierId: e.target.value, selected: true })} className={`${inputCls} py-1.5`}>
                              <option value="">Seçin</option>
                              {suppliers.map(sp => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
                            </select>
                          </td>
                        )}
                        <td className="px-3 py-2.5 text-right tabular-nums align-top">
                          {s.unit_price != null ? formatMoney(s.unit_price * (parseFloat(l.qty) || 0)) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}
