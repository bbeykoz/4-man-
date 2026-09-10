'use client'

import { Fragment, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowDownRight, ArrowUpRight, ChevronDown, ChevronRight, Loader2, Minus } from 'lucide-react'
import { get } from '@/lib/api'
import { cn, formatDate } from '@/lib/utils'
import { useWarehouses } from './stock'

interface Kpi {
  key: string
  label: string
  unit: string
  current: number | null
  previous: number | null
  change: number | null
  change_pct: number | null
  change_is_points: boolean
  higher_is_better: boolean
  trend: 'better' | 'worse' | 'neutral'
  comment: string
  drivers: string[]
}

interface WarehouseKpi {
  warehouse_id: string
  name: string
  movements: number
  count_accuracy: number | null
  availability: number | null
  processing_hours: number | null
  damage_rate: number | null
  return_rate: number | null
  turnover: number | null
  on_hand: number
  capacity: number | null
  fill_rate: number | null
}

interface KpiReport {
  period_days: number
  current: { from: string; to: string }
  previous: { from: string; to: string }
  kpis: Kpi[]
  warehouses: WarehouseKpi[]
}

const n = (v: number | null, digits = 1) => (v == null ? '—' : v.toLocaleString('tr-TR', { maximumFractionDigits: digits }))
const withUnit = (v: number | null, unit: string) => {
  if (v == null) return '—'
  if (unit === '%') return `%${n(v)}`
  return `${n(v, 2)}${unit}`
}

function Change({ k }: { k: Kpi }) {
  if (k.change == null) return <span className="text-zinc-400">—</span>
  const Icon = k.change > 0 ? ArrowUpRight : k.change < 0 ? ArrowDownRight : Minus
  const cls = k.trend === 'better' ? 'text-green-600' : k.trend === 'worse' ? 'text-red-600' : 'text-zinc-500'
  const text = k.change_is_points
    ? `${k.change > 0 ? '+' : ''}${n(k.change)} puan`
    : `${k.change > 0 ? '+' : ''}${n(k.change, 2)}${k.unit}${k.change_pct != null ? ` (${k.change_pct > 0 ? '+' : ''}%${n(k.change_pct)})` : ''}`
  return <span className={cn('inline-flex items-center gap-0.5 whitespace-nowrap', cls)}><Icon className="h-3.5 w-3.5" />{text}</span>
}

/** Depo performans KPI'ları: bu dönem / önceki dönem, değişim, yorum, nedenler; depo bazında kıyas. */
export function KpiPanel() {
  const { data: warehouses = [] } = useWarehouses()
  const [period, setPeriod] = useState<30 | 90>(30)
  const [warehouseId, setWarehouseId] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['warehouse-kpis', period, warehouseId],
    queryFn: () => get<{ data: KpiReport }>(`/modules/stock/kpis?period=${period}${warehouseId ? `&warehouse_id=${warehouseId}` : ''}`).then(r => r.data),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {([30, 90] as const).map(p => (
          <button key={p} onClick={() => setPeriod(p)} className={cn('px-3 py-1.5 text-xs font-medium rounded-full border', period === p ? 'bg-blue-600 border-blue-600 text-white' : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400')}>
            Son {p} gün
          </button>
        ))}
        {data && (
          <span className="text-[11px] text-zinc-500">
            {formatDate(data.current.from)}–{formatDate(data.current.to)} · önceki: {formatDate(data.previous.from)}–{formatDate(data.previous.to)}
          </span>
        )}
        <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)} className="ml-auto px-3 py-1.5 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
          <option value="">Tüm depolar</option>
          {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </div>

      {isLoading || !data ? (
        <div className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin text-zinc-400 inline" /></div>
      ) : (<>
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-xs text-zinc-500">
              <tr>
                <th className="w-6 px-3 py-2.5" />
                <th className="text-left px-3 py-2.5">KPI</th>
                <th className="text-right px-3 py-2.5">Bu dönem</th>
                <th className="text-right px-3 py-2.5">Önceki dönem</th>
                <th className="text-right px-3 py-2.5">Değişim</th>
                <th className="text-left px-3 py-2.5">Yorum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 tabular-nums">
              {data.kpis.map(k => {
                const expanded = open === k.key
                return (
                  <Fragment key={k.key}>
                    <tr
                      className={cn(k.drivers.length > 0 && 'cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/40')}
                      onClick={() => k.drivers.length > 0 && setOpen(expanded ? null : k.key)}
                    >
                      <td className="px-3 py-2.5 text-zinc-400">
                        {k.drivers.length > 0 && (expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />)}
                      </td>
                      <td className="px-3 py-2.5 font-medium">{k.label}</td>
                      <td className="px-3 py-2.5 text-right font-semibold">{withUnit(k.current, k.unit)}</td>
                      <td className="px-3 py-2.5 text-right text-zinc-500">{withUnit(k.previous, k.unit)}</td>
                      <td className="px-3 py-2.5 text-right"><Change k={k} /></td>
                      <td className="px-3 py-2.5 text-xs text-zinc-600 dark:text-zinc-300">{k.comment}</td>
                    </tr>
                    {expanded && (
                      <tr className="bg-zinc-50/60 dark:bg-zinc-900/60">
                        <td />
                        <td colSpan={5} className="px-3 py-2.5">
                          <p className="text-[11px] font-semibold text-zinc-500 mb-1">Nedenler / en çok katkı yapanlar</p>
                          <ul className="space-y-0.5">
                            {k.drivers.map((d, i) => <li key={i} className="text-xs text-zinc-600 dark:text-zinc-300">• {d}</li>)}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-zinc-400">
          Dönemler eşit uzunlukta karşılaştırılır. Doğruluk: sistemle ±%2 içinde kalan sayımların oranı · Bulunurluk: dönemde talep gören ürünlerden dönem sonunda stokta olanlar ·
          İşlem süresi: çıkış/transfer kaydının açılmasından stoğa işlenmesine · Devir: yıllık tüketim / ortalama stok. &quot;—&quot;: o dönem ölçüm verisi yok.
        </p>

        {data.warehouses.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <p className="px-3 pt-3 text-sm font-semibold text-zinc-800 dark:text-zinc-200">Depo bazında (bu dönem)</p>
            <table className="w-full text-sm mt-2">
              <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-xs text-zinc-500">
                <tr>
                  <th className="text-left px-3 py-2">Depo</th>
                  <th className="text-right px-3 py-2">Hareket</th>
                  <th className="text-right px-3 py-2">Doğruluk</th>
                  <th className="text-right px-3 py-2">Bulunurluk</th>
                  <th className="text-right px-3 py-2">İşlem süresi</th>
                  <th className="text-right px-3 py-2">Hasar</th>
                  <th className="text-right px-3 py-2">İade</th>
                  <th className="text-right px-3 py-2">Devir</th>
                  <th className="text-right px-3 py-2">Doluluk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 tabular-nums">
                {data.warehouses.map(w => (
                  <tr key={w.warehouse_id}>
                    <td className="px-3 py-2 font-medium">{w.name}</td>
                    <td className="px-3 py-2 text-right">{w.movements}</td>
                    <td className="px-3 py-2 text-right">{withUnit(w.count_accuracy, '%')}</td>
                    <td className="px-3 py-2 text-right">{withUnit(w.availability, '%')}</td>
                    <td className="px-3 py-2 text-right">{w.processing_hours == null ? '—' : `${n(w.processing_hours)} saat`}</td>
                    <td className="px-3 py-2 text-right">{withUnit(w.damage_rate, '%')}</td>
                    <td className="px-3 py-2 text-right">{withUnit(w.return_rate, '%')}</td>
                    <td className="px-3 py-2 text-right">{w.turnover == null ? '—' : `${n(w.turnover, 2)}×`}</td>
                    <td className="px-3 py-2 text-right">
                      {w.fill_rate == null ? <span className="text-zinc-400" title="Depo kapasitesi girilmemiş">kapasite yok</span> : (
                        <span className="inline-flex items-center gap-2">
                          <span className="w-16 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                            <span className={cn('block h-full rounded-full', w.fill_rate > 90 ? 'bg-red-500' : w.fill_rate > 75 ? 'bg-amber-500' : 'bg-green-500')} style={{ width: `${Math.min(100, w.fill_rate)}%` }} />
                          </span>
                          %{n(w.fill_rate)}
                        </span>
                      )}
                    </td>
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
