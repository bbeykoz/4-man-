'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, Loader2, Lightbulb } from 'lucide-react'
import { toast } from 'sonner'
import { get, post } from '@/lib/api'
import { cn } from '@/lib/utils'
import { ConfirmModal } from '@/components/common/ConfirmModal'
import { apiErrorMessage, formatQty, useWarehouses } from './stock'
import { formatMoney } from './purchasing/api'

type MovementClass = 'fast' | 'normal' | 'slow' | 'dead' | 'new' | 'no_stock'

interface DeadRow {
  product_id: string
  name: string
  sku?: string | null
  unit: string
  available: number
  consumed_30: number
  consumed_60: number
  consumed_90: number
  days_since_consumption: number | null
  days_of_supply: number | null
  turnover: number | null
  class: MovementClass
  stock_value: number | null
  excess_qty: number
  excess_value: number | null
  reorder_blocked: boolean
  recommendation: string
}

interface DeadData {
  rows: DeadRow[]
  summary: { counts: Record<MovementClass, number>; dead_value: number; slow_value: number; excess_value: number; total_value: number }
  stop_reorder: { count: number; product_ids: string[]; names: string[]; value: number; message: string | null }
}

const CLASSES: Record<MovementClass, { label: string; cls: string }> = {
  dead:     { label: 'Ölü',     cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  slow:     { label: 'Yavaş',   cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  normal:   { label: 'Normal',  cls: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300' },
  fast:     { label: 'Hızlı',   cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  new:      { label: 'Yeni',    cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  no_stock: { label: 'Stok yok', cls: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500' },
}

/** Hareket analizi: hızlı / normal / yavaş / ölü stok, bağlı sermaye, sipariş durdurma. */
export function DeadStockPanel() {
  const qc = useQueryClient()
  const { data: warehouses = [] } = useWarehouses()
  const [warehouseId, setWarehouseId] = useState('')
  const [filter, setFilter] = useState<MovementClass | ''>('')
  const [confirmAll, setConfirmAll] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['stock-dead', warehouseId],
    queryFn: () => get<{ data: DeadData }>(`/modules/stock/dead-stock${warehouseId ? `?warehouse_id=${warehouseId}` : ''}`).then(r => r.data),
  })

  const blockMutation = useMutation({
    mutationFn: ({ ids, blocked }: { ids: string[]; blocked: boolean }) =>
      post<{ message: string }>('/modules/stock/dead-stock/reorder-block', { product_ids: ids, blocked }),
    onSuccess: (r) => {
      toast.success(r.message)
      setConfirmAll(false)
      ;['stock-dead', 'stock-risk', 'purchasing-suggestions'].forEach(key => qc.invalidateQueries({ queryKey: [key] }))
    },
    onError: (e) => { setConfirmAll(false); toast.error(apiErrorMessage(e, 'Güncellenemedi.')) },
  })

  if (isLoading || !data) return <div className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin text-zinc-400 inline" /></div>

  const rows = filter ? data.rows.filter(r => r.class === filter) : data.rows
  const sr = data.stop_reorder

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {([
          ['Ölü stok değeri', formatMoney(data.summary.dead_value), `${data.summary.counts.dead} ürün`],
          ['Yavaş stok değeri', formatMoney(data.summary.slow_value), `${data.summary.counts.slow} ürün`],
          ['Fazla stok (90 gün üstü)', formatMoney(data.summary.excess_value), 'ölü + yavaş'],
          ['Toplam stok değeri', formatMoney(data.summary.total_value), `${data.rows.length} ürün`],
        ] as const).map(([label, value, sub]) => (
          <div key={label} className="rounded-xl border border-zinc-200 dark:border-zinc-800 px-4 py-3">
            <p className="text-xs text-zinc-500">{label}</p>
            <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{value}</p>
            <p className="text-[11px] text-zinc-500">{sub}</p>
          </div>
        ))}
      </div>

      {sr.message && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between rounded-xl border border-violet-200 bg-violet-50 dark:border-violet-900 dark:bg-violet-950/30 px-4 py-3">
          <div className="flex items-start gap-2">
            <Lightbulb className="h-4 w-4 text-violet-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-violet-900 dark:text-violet-200">{sr.message}</p>
              <p className="text-xs text-violet-700 dark:text-violet-300">{sr.names.join(', ')}{sr.count > sr.names.length && ` ve ${sr.count - sr.names.length} ürün daha`} · bağlı sermaye {formatMoney(sr.value)}</p>
            </div>
          </div>
          <button onClick={() => setConfirmAll(true)} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-violet-600 hover:bg-violet-700 text-white whitespace-nowrap">
            <Ban className="h-4 w-4" /> Hepsinin siparişini durdur
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setFilter('')} className={cn('px-3 py-1.5 text-xs font-medium rounded-full border', !filter ? 'bg-blue-600 border-blue-600 text-white' : 'border-zinc-200 dark:border-zinc-700 text-zinc-600')}>Tümü</button>
        {(['dead', 'slow', 'normal', 'fast', 'new'] as MovementClass[]).map(c => (
          <button key={c} onClick={() => setFilter(c)} className={cn('px-3 py-1.5 text-xs font-medium rounded-full border', filter === c ? 'bg-blue-600 border-blue-600 text-white' : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400')}>
            {CLASSES[c].label} ({data.summary.counts[c] ?? 0})
          </button>
        ))}
        <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)} className="ml-auto px-3 py-1.5 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
          <option value="">Tüm depolar</option>
          {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-xs text-zinc-500">
            <tr>
              <th className="text-left px-3 py-2.5">Ürün</th>
              <th className="text-left px-3 py-2.5">Sınıf</th>
              <th className="text-right px-3 py-2.5">Stok</th>
              <th className="text-right px-3 py-2.5">Tüketim 30 / 60 / 90 gün</th>
              <th className="text-right px-3 py-2.5">Son çıkış</th>
              <th className="text-right px-3 py-2.5">Stok günü</th>
              <th className="text-right px-3 py-2.5">Devir</th>
              <th className="text-right px-3 py-2.5">Bağlı sermaye</th>
              <th className="text-left px-3 py-2.5">Öneri</th>
              <th className="px-3 py-2.5 text-right">Sipariş</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map(r => (
              <tr key={r.product_id}>
                <td className="px-3 py-2.5"><p className="font-medium">{r.name}</p>{r.sku && <p className="text-xs text-zinc-400">{r.sku}</p>}</td>
                <td className="px-3 py-2.5"><span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', CLASSES[r.class].cls)}>{CLASSES[r.class].label}</span></td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatQty(r.available)} {r.unit}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-xs">{formatQty(r.consumed_30)} / {formatQty(r.consumed_60)} / {formatQty(r.consumed_90)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-xs">{r.days_since_consumption != null ? `${r.days_since_consumption} gün önce` : 'hiç'}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.days_of_supply != null ? formatQty(r.days_of_supply) : '∞'}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.turnover != null ? `${r.turnover}×` : '—'}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {formatMoney(r.stock_value)}
                  {r.excess_value ? <span className="block text-[11px] text-amber-600">fazla {formatMoney(r.excess_value)}</span> : null}
                </td>
                <td className="px-3 py-2.5 text-xs text-zinc-600 dark:text-zinc-300 max-w-xs">{r.recommendation}</td>
                <td className="px-3 py-2.5 text-right">
                  <button
                    onClick={() => blockMutation.mutate({ ids: [r.product_id], blocked: !r.reorder_blocked })}
                    disabled={blockMutation.isPending}
                    className={cn(
                      'px-2 py-1 text-xs rounded-lg border whitespace-nowrap',
                      r.reorder_blocked ? 'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300' : 'border-zinc-200 dark:border-zinc-700 text-zinc-500'
                    )}
                    title={r.reorder_blocked ? 'Siparişi yeniden aç' : 'Yeniden siparişi durdur'}
                  >
                    {r.reorder_blocked ? 'Durduruldu' : 'Durdur'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-zinc-400">
        Ölü: 90 gündür çıkış yok · Yavaş: 60 gündür çıkış yok veya stok 180 günden fazla yetiyor · Hızlı: stok 30 günden az yetiyor · Yeni: ilk hareketi 30 günden yeni.
        Siparişi durdurulan ürün satın alma önerilerine girmez.
      </p>

      <ConfirmModal
        open={confirmAll}
        onClose={() => setConfirmAll(false)}
        onConfirm={() => blockMutation.mutate({ ids: sr.product_ids, blocked: true })}
        title={`${sr.count} ürünün siparişi durdurulsun mu?`}
        description="Bu ürünler otomatik satın alma önerilerine girmez. İstediğiniz zaman satırdan tekrar açabilirsiniz."
        confirmLabel="Durdur"
        variant="warning"
        loading={blockMutation.isPending}
      />
    </div>
  )
}
