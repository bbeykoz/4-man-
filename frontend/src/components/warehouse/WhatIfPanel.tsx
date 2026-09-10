'use client'

import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { FlaskConical, Loader2, Play, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { get, post } from '@/lib/api'
import { cn } from '@/lib/utils'
import { apiErrorMessage, formatQty, useWarehouses } from './stock'
import { formatMoney, useSuppliers } from './purchasing/api'

type Level = 'critical' | 'high' | 'medium' | 'low'

interface ScenarioInput {
  name: string
  demand_change_pct: string
  lead_time_extra_days: string
  safety_change_pct: string
  supplier_id: string
  category: string
}

interface Summary {
  affected_products: number
  shortfall_products: number
  shortfall_qty: number
  shortfall_value: number
  order_qty: number
  order_value: number
  order_qty_change: number
  order_value_change: number
  levels: Record<Level, number>
  avg_risk: number
  avg_risk_change: number
}

interface ProductImpact {
  product_id: string
  name: string
  unit: string
  risk_before: number
  risk_after: number
  level_before: Level
  level_after: Level
  cover_before: number | null
  cover_after: number | null
  order_before: number
  order_after: number
  shortfall: number
  recommendation: string
}

interface ScenarioResult extends Summary {
  name: string
  assumptions: string
  in_scope: number
  products: ProductImpact[]
}

const PRESETS: { label: string; patch: Partial<ScenarioInput> }[] = [
  { label: 'Talep %20 artarsa',        patch: { name: 'Talep +%20', demand_change_pct: '20' } },
  { label: 'Tedarik 5 gün uzarsa',     patch: { name: 'Tedarik +5 gün', lead_time_extra_days: '5' } },
  { label: 'Satışlar %30 düşerse',     patch: { name: 'Satış −%30', demand_change_pct: '-30' } },
  { label: 'Güvenlik stoğu %50 artarsa', patch: { name: 'Güvenlik +%50', safety_change_pct: '50' } },
]

const empty = (i: number): ScenarioInput => ({ name: `Senaryo ${i + 1}`, demand_change_pct: '', lead_time_extra_days: '', safety_change_pct: '', supplier_id: '', category: '' })

const LEVEL_CLS: Record<Level, string> = {
  critical: 'text-red-600', high: 'text-orange-600', medium: 'text-amber-600', low: 'text-green-600',
}

const inputCls = 'w-full px-2.5 py-1.5 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500'

function Delta({ value, money, inverse }: { value: number; money?: boolean; inverse?: boolean }) {
  if (!value) return null
  const bad = inverse ? value < 0 : value > 0
  return (
    <span className={cn('block text-[11px]', bad ? 'text-red-600' : 'text-green-600')}>
      {value > 0 ? '+' : ''}{money ? formatMoney(value) : formatQty(value)}
    </span>
  )
}

/** What-if: varsayım değişikliklerinin stok etkisi, 3 senaryoya kadar mevcut durumla karşılaştırma. */
export function WhatIfPanel() {
  const { data: warehouses = [] } = useWarehouses()
  const { data: suppliers = [] } = useSuppliers()
  const { data: options } = useQuery({
    queryKey: ['what-if-options'],
    queryFn: () => get<{ data: { categories: string[] } }>('/modules/stock/what-if/options').then(r => r.data),
  })

  const [warehouseId, setWarehouseId] = useState('')
  const [scenarios, setScenarios] = useState<ScenarioInput[]>([{ ...empty(0), ...PRESETS[0].patch }])
  const [active, setActive] = useState(0)

  const runMutation = useMutation({
    mutationFn: () => post<{ data: { baseline: Summary; scenarios: ScenarioResult[] } }>('/modules/stock/what-if', {
      warehouse_id: warehouseId || null,
      scenarios: scenarios.map(s => ({
        name: s.name,
        demand_change_pct: s.demand_change_pct ? parseFloat(s.demand_change_pct) : 0,
        lead_time_extra_days: s.lead_time_extra_days ? parseInt(s.lead_time_extra_days) : 0,
        safety_change_pct: s.safety_change_pct ? parseFloat(s.safety_change_pct) : 0,
        supplier_id: s.supplier_id || null,
        category: s.category || null,
      })),
    }).then(r => r.data),
    onError: (e) => toast.error(apiErrorMessage(e, 'Simülasyon çalıştırılamadı.')),
  })

  const update = (i: number, patch: Partial<ScenarioInput>) => setScenarios(p => p.map((s, idx) => idx === i ? { ...s, ...patch } : s))
  const result = runMutation.data
  const selected = result?.scenarios[Math.min(active, (result?.scenarios.length ?? 1) - 1)]

  const columns: { key: string; name: string; sub?: string; s: Summary }[] = result
    ? [{ key: 'base', name: 'Mevcut durum', s: result.baseline }, ...result.scenarios.map((s, i) => ({ key: `s${i}`, name: s.name, sub: s.assumptions, s }))]
    : []

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-zinc-500">Hazır senaryolar:</span>
        {PRESETS.map(p => (
          <button
            key={p.label}
            onClick={() => update(active < scenarios.length ? active : 0, { ...empty(active), ...p.patch })}
            className="px-2.5 py-1 text-xs rounded-full border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:border-blue-400"
          >
            {p.label}
          </button>
        ))}
        <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)} className="ml-auto px-3 py-1.5 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
          <option value="">Tüm depolar</option>
          {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {scenarios.map((s, i) => (
          <div
            key={i}
            onClick={() => setActive(i)}
            className={cn('rounded-xl border p-3 space-y-2 cursor-pointer', active === i ? 'border-blue-400 ring-1 ring-blue-400' : 'border-zinc-200 dark:border-zinc-800')}
          >
            <div className="flex items-center gap-2">
              <input value={s.name} onChange={e => update(i, { name: e.target.value })} className={`${inputCls} font-medium`} maxLength={60} />
              {scenarios.length > 1 && (
                <button onClick={(e) => { e.stopPropagation(); setScenarios(p => p.filter((_, idx) => idx !== i)); setActive(0) }} className="p-1.5 text-zinc-400 hover:text-red-600" aria-label="Senaryoyu sil">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <label className="text-[11px] text-zinc-500">Talep %
                <input type="number" value={s.demand_change_pct} onChange={e => update(i, { demand_change_pct: e.target.value })} placeholder="0" className={inputCls} />
              </label>
              <label className="text-[11px] text-zinc-500">Tedarik ± gün
                <input type="number" value={s.lead_time_extra_days} onChange={e => update(i, { lead_time_extra_days: e.target.value })} placeholder="0" className={inputCls} />
              </label>
              <label className="text-[11px] text-zinc-500">Güvenlik %
                <input type="number" value={s.safety_change_pct} onChange={e => update(i, { safety_change_pct: e.target.value })} placeholder="0" className={inputCls} />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select value={s.supplier_id} onChange={e => update(i, { supplier_id: e.target.value })} className={inputCls} title="Kapsam: tedarikçi">
                <option value="">Tüm tedarikçiler</option>
                {suppliers.map(sp => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
              </select>
              <select value={s.category} onChange={e => update(i, { category: e.target.value })} className={inputCls} title="Kapsam: kategori">
                <option value="">Tüm kategoriler</option>
                {(options?.categories ?? []).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        ))}
        {scenarios.length < 3 && (
          <button
            onClick={() => { setScenarios(p => [...p, empty(p.length)]); setActive(scenarios.length) }}
            className="rounded-xl border-2 border-dashed border-zinc-200 dark:border-zinc-800 p-3 text-sm text-zinc-500 hover:border-blue-400 hover:text-blue-600 flex items-center justify-center gap-1.5 min-h-32"
          >
            <Plus className="h-4 w-4" /> Karşılaştırmak için senaryo ekle
          </button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => runMutation.mutate()}
          disabled={runMutation.isPending}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60"
        >
          {runMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Simüle et
        </button>
        <p className="text-xs text-zinc-500">Simülasyon hiçbir veriyi değiştirmez; risk hesabı değiştirilmiş varsayımlarla yeniden çalıştırılır.</p>
      </div>

      {!result ? (
        <div className="py-10 text-center space-y-1">
          <FlaskConical className="h-6 w-6 text-zinc-300 inline" />
          <p className="text-sm text-zinc-500">Senaryoyu ayarlayıp &quot;Simüle et&quot;e basın.</p>
        </div>
      ) : (<>
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-xs text-zinc-500">
              <tr>
                <th className="text-left px-3 py-2.5">Gösterge</th>
                {columns.map(c => (
                  <th key={c.key} className="text-right px-3 py-2.5">
                    <span className="text-zinc-800 dark:text-zinc-200">{c.name}</span>
                    {c.sub && <span className="block font-normal text-[11px]">{c.sub}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 tabular-nums">
              <tr>
                <td className="px-3 py-2">Etkilenecek ürün</td>
                {columns.map(c => <td key={c.key} className="px-3 py-2 text-right">{c.key === 'base' ? '—' : c.s.affected_products}</td>)}
              </tr>
              <tr>
                <td className="px-3 py-2">Stok açığı <span className="text-[11px] text-zinc-400">(tedarik süresi içinde)</span></td>
                {columns.map(c => <td key={c.key} className="px-3 py-2 text-right">{formatQty(c.s.shortfall_qty)} <span className="block text-[11px] text-zinc-400">{formatMoney(c.s.shortfall_value)} · {c.s.shortfall_products} ürün</span></td>)}
              </tr>
              <tr>
                <td className="px-3 py-2">Önerilen sipariş</td>
                {columns.map(c => (
                  <td key={c.key} className="px-3 py-2 text-right">
                    {formatQty(c.s.order_qty)} <span className="text-[11px] text-zinc-400">{formatMoney(c.s.order_value)}</span>
                    {c.key !== 'base' && <Delta value={c.s.order_value_change} money />}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="px-3 py-2">Kritik / yüksek riskli ürün</td>
                {columns.map(c => <td key={c.key} className="px-3 py-2 text-right"><span className="text-red-600">{c.s.levels.critical}</span> / <span className="text-orange-600">{c.s.levels.high}</span></td>)}
              </tr>
              <tr>
                <td className="px-3 py-2">Ortalama risk</td>
                {columns.map(c => <td key={c.key} className="px-3 py-2 text-right">{c.s.avg_risk}{c.key !== 'base' && <Delta value={c.s.avg_risk_change} />}</td>)}
              </tr>
            </tbody>
          </table>
        </div>

        {result.scenarios.length > 1 && (
          <div className="flex gap-2">
            {result.scenarios.map((s, i) => (
              <button key={i} onClick={() => setActive(i)} className={cn('px-3 py-1.5 text-xs rounded-full border', active === i ? 'bg-blue-600 border-blue-600 text-white' : 'border-zinc-200 dark:border-zinc-700 text-zinc-600')}>
                {s.name}
              </button>
            ))}
          </div>
        )}

        {selected && (
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <p className="px-3 pt-3 text-sm font-semibold text-zinc-800 dark:text-zinc-200">{selected.name}: en çok etkilenen ürünler <span className="font-normal text-xs text-zinc-500">({selected.in_scope} ürün kapsamda)</span></p>
            <table className="w-full text-sm mt-2">
              <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-xs text-zinc-500">
                <tr>
                  <th className="text-left px-3 py-2">Ürün</th>
                  <th className="text-right px-3 py-2">Risk</th>
                  <th className="text-right px-3 py-2">Stok günü</th>
                  <th className="text-right px-3 py-2">Önerilen sipariş</th>
                  <th className="text-right px-3 py-2">Stok açığı</th>
                  <th className="text-left px-3 py-2">Senaryodaki öneri</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 tabular-nums">
                {selected.products.length === 0 ? (
                  <tr><td colSpan={6} className="py-8 text-center text-zinc-400">Bu senaryoda değişen ürün yok.</td></tr>
                ) : selected.products.map(p => (
                  <tr key={p.product_id}>
                    <td className="px-3 py-2 font-medium">{p.name}</td>
                    <td className="px-3 py-2 text-right"><span className={LEVEL_CLS[p.level_before]}>{p.risk_before}</span> → <strong className={LEVEL_CLS[p.level_after]}>{p.risk_after}</strong></td>
                    <td className="px-3 py-2 text-right">{p.cover_before != null ? formatQty(p.cover_before) : '∞'} → {p.cover_after != null ? formatQty(p.cover_after) : '∞'}</td>
                    <td className="px-3 py-2 text-right">{formatQty(p.order_before)} → <strong>{formatQty(p.order_after)}</strong> {p.unit}</td>
                    <td className={cn('px-3 py-2 text-right', p.shortfall > 0 && 'text-red-600 font-medium')}>{p.shortfall > 0 ? `${formatQty(p.shortfall)} ${p.unit}` : '—'}</td>
                    <td className="px-3 py-2 text-xs text-zinc-600 dark:text-zinc-300">{p.recommendation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>)}
    </div>
  )
}
