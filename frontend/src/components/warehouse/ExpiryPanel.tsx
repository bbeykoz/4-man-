'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertOctagon, ArrowRightLeft, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { get, post } from '@/lib/api'
import { cn, formatDate } from '@/lib/utils'
import { ConfirmModal } from '@/components/common/ConfirmModal'
import { apiErrorMessage, formatQty, useWarehouses } from './stock'
import { formatMoney } from './purchasing/api'

type ExpiryLevel = 'expired' | 'critical' | 'warning' | 'watch' | 'ok'

interface ExpiryLot {
  product_id: string
  name: string
  unit: string
  warehouse_id: string
  warehouse_name: string
  lot_number: string | null
  expiry_date: string
  days_to_expiry: number
  level: ExpiryLevel
  bucket: 'available' | 'quarantine'
  quantity: number
  daily_consumption: number
  loss_qty: number
  loss_value: number | null
  recommendation: string
  action: { type: 'transfer' | 'damage'; quantity: number; to_warehouse_id?: string; to_warehouse_name?: string } | null
}

interface ExpiryData {
  lots: ExpiryLot[]
  products: { product_id: string; name: string; headline: string; loss_value: number }[]
  summary: { expired_qty: number; expired_lots: number; critical_lots: number; warning_lots: number; watch_lots: number; loss_qty: number; loss_value: number; action_count: number }
}

const LEVEL: Record<ExpiryLevel, { label: string; cls: string }> = {
  expired:  { label: 'SKT geçti',   cls: 'bg-red-600 text-white' },
  critical: { label: '≤ 30 gün',    cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  warning:  { label: '≤ 60 gün',    cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' },
  watch:    { label: '≤ 90 gün',    cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  ok:       { label: '90+ gün',     cls: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400' },
}

/** SKT / FEFO: lot bazında kalan gün, kayıp riski ve öneriler (transfer / hasar kaydı). */
export function ExpiryPanel() {
  const qc = useQueryClient()
  const { data: warehouses = [] } = useWarehouses()
  const [warehouseId, setWarehouseId] = useState('')
  const [pending, setPending] = useState<ExpiryLot | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['stock-expiry', warehouseId],
    queryFn: () => get<{ data: ExpiryData }>(`/modules/stock/expiry${warehouseId ? `?warehouse_id=${warehouseId}` : ''}`).then(r => r.data),
  })

  const actionMutation = useMutation({
    mutationFn: (lot: ExpiryLot) => post<{ message: string }>('/modules/stock/expiry/actions', {
      type: lot.action!.type,
      product_id: lot.product_id,
      warehouse_id: lot.warehouse_id,
      to_warehouse_id: lot.action!.to_warehouse_id ?? null,
      lot_number: lot.lot_number,
      expiry_date: lot.expiry_date,
      quantity: lot.action!.quantity,
    }),
    onSuccess: (r) => {
      toast.success(r.message)
      setPending(null)
      qc.invalidateQueries({ queryKey: ['warehouse-records'] })
      qc.invalidateQueries({ queryKey: ['wh-control-records'] })
    },
    onError: (e) => { setPending(null); toast.error(apiErrorMessage(e, 'Kayıt oluşturulamadı.')) },
  })

  if (isLoading || !data) return <div className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin text-zinc-400 inline" /></div>

  const s = data.summary
  const cards = [
    { label: 'SKT geçmiş', value: `${formatQty(s.expired_qty)} adet`, sub: `${s.expired_lots} lot`, cls: 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30' },
    { label: '30 gün içinde', value: `${s.critical_lots} lot`, sub: 'kritik', cls: 'border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950/30' },
    { label: '31–90 gün', value: `${s.warning_lots + s.watch_lots} lot`, sub: 'izle', cls: 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30' },
    { label: 'Kayıp riski', value: formatMoney(s.loss_value), sub: `${formatQty(s.loss_qty)} adet`, cls: 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900' },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(c => (
          <div key={c.label} className={cn('rounded-xl border px-4 py-3', c.cls)}>
            <p className="text-xs text-zinc-500">{c.label}</p>
            <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{c.value}</p>
            <p className="text-[11px] text-zinc-500">{c.sub}</p>
          </div>
        ))}
      </div>

      {data.products.length > 0 && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-1.5">
          <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5"><AlertOctagon className="h-3.5 w-3.5 text-red-500" /> Öne çıkanlar</p>
          {data.products.slice(0, 5).map(p => <p key={p.product_id} className="text-sm text-zinc-600 dark:text-zinc-300">• {p.headline}</p>)}
        </div>
      )}

      <div className="flex items-center gap-3">
        <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)} className="px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
          <option value="">Tüm depolar</option>
          {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <p className="text-xs text-zinc-400">Çıkışlar otomatik FEFO ile yapılır (SKT&apos;si en yakın lot önce).</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-xs text-zinc-500">
            <tr>
              <th className="text-left px-3 py-2.5">Ürün</th>
              <th className="text-left px-3 py-2.5">Depo / Lot</th>
              <th className="text-left px-3 py-2.5">SKT</th>
              <th className="text-right px-3 py-2.5">Miktar</th>
              <th className="text-right px-3 py-2.5">Günlük tüketim</th>
              <th className="text-right px-3 py-2.5">Kayıp riski</th>
              <th className="text-left px-3 py-2.5">Öneri</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {data.lots.length === 0 ? (
              <tr><td colSpan={8} className="py-12 text-center text-zinc-400">90 gün içinde SKT&apos;si dolacak lot yok.</td></tr>
            ) : data.lots.map((l, i) => (
              <tr key={i}>
                <td className="px-3 py-2.5 font-medium">{l.name}</td>
                <td className="px-3 py-2.5 text-xs">
                  {l.warehouse_name}
                  <span className="block font-mono text-zinc-400">{l.lot_number ?? '—'}{l.bucket === 'quarantine' && ' · karantina'}</span>
                </td>
                <td className="px-3 py-2.5">
                  <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full', LEVEL[l.level].cls)}>
                    {l.days_to_expiry < 0 ? `${-l.days_to_expiry} gün geçti` : `${l.days_to_expiry} gün`}
                  </span>
                  <span className="block text-[11px] text-zinc-400 mt-0.5">{formatDate(l.expiry_date)}</span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatQty(l.quantity)} {l.unit}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{l.daily_consumption ? formatQty(l.daily_consumption) : '—'}</td>
                <td className={cn('px-3 py-2.5 text-right tabular-nums', l.loss_qty > 0 ? 'text-red-600 font-medium' : 'text-zinc-400')}>
                  {l.loss_qty > 0 ? <>{formatQty(Math.round(l.loss_qty))} {l.unit}{l.loss_value != null && <span className="block text-[11px] font-normal">{formatMoney(l.loss_value)}</span>}</> : '—'}
                </td>
                <td className="px-3 py-2.5 text-xs text-zinc-700 dark:text-zinc-300 max-w-xs">{l.recommendation}</td>
                <td className="px-3 py-2.5">
                  {l.action && (
                    <button
                      onClick={() => setPending(l)}
                      className={cn(
                        'inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap',
                        l.action.type === 'transfer' ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'
                      )}
                    >
                      {l.action.type === 'transfer' ? <><ArrowRightLeft className="h-3.5 w-3.5" /> Transfer oluştur</> : <><Trash2 className="h-3.5 w-3.5" /> Hasara ayır</>}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmModal
        open={!!pending}
        onClose={() => setPending(null)}
        onConfirm={() => pending && actionMutation.mutate(pending)}
        title={pending?.action?.type === 'transfer' ? 'Transfer kaydı oluşturulsun mu?' : 'Hasar kaydı oluşturulsun mu?'}
        description={pending?.action
          ? `${pending.name} (${pending.lot_number ?? 'lotsuz'}) — ${formatQty(pending.action.quantity)} ${pending.unit}` +
            (pending.action.type === 'transfer' ? ` → ${pending.action.to_warehouse_name}. ` : ' hasarlı stoğa ayrılacak. ') +
            'Kayıt "Bekliyor" olarak açılır; Depolama listesinden onaylayınca stoğa işlenir.'
          : ''}
        confirmLabel="Kaydı Oluştur"
        variant={pending?.action?.type === 'damage' ? 'danger' : 'default'}
        loading={actionMutation.isPending}
      />
    </div>
  )
}
