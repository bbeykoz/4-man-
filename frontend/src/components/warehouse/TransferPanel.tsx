'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, CheckSquare, Loader2, Shuffle, Square } from 'lucide-react'
import { toast } from 'sonner'
import { get, post } from '@/lib/api'
import { cn } from '@/lib/utils'
import { apiErrorMessage, formatQty } from './stock'
import { AsyncActionButton } from '@/components/common/AsyncActionButton'
import { formatMoney } from './purchasing/api'

interface TransferSuggestion {
  product_id: string
  name: string
  sku?: string | null
  unit: string
  from_warehouse_id: string
  from_warehouse: string
  to_warehouse_id: string
  to_warehouse: string
  source_stock: number
  source_daily: number
  dest_stock: number
  dest_daily: number
  dest_cover_days: number | null
  dest_need: number
  quantity: number
  value: number | null
  replaces_purchase: boolean
  reason: string
}

interface TransferData {
  suggestions: TransferSuggestion[]
  summary: { count: number; total_qty: number; total_value: number; replaces_purchase: number; products: number }
  message: string | null
}

const keyOf = (s: TransferSuggestion) => `${s.product_id}|${s.from_warehouse_id}|${s.to_warehouse_id}`

/** Depolar arası akıllı transfer önerileri → seçilenlerden "Bekliyor" transfer emri. */
export function TransferPanel() {
  const qc = useQueryClient()
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [qty, setQty] = useState<Record<string, string>>({})

  const { data, isLoading } = useQuery({
    queryKey: ['stock-transfer-suggestions'],
    queryFn: () => get<{ data: TransferData }>('/modules/stock/transfers/suggestions').then(r => r.data),
  })

  const rows = data?.suggestions ?? []
  const chosen = rows.filter(s => selected[keyOf(s)])

  const createMutation = useMutation({
    mutationFn: () => post<{ message: string }>('/modules/stock/transfers/orders', {
      lines: chosen.map(s => ({
        product_id: s.product_id,
        from_warehouse_id: s.from_warehouse_id,
        to_warehouse_id: s.to_warehouse_id,
        quantity: parseFloat(qty[keyOf(s)] ?? String(s.quantity)),
        reason: s.reason,
      })),
    }),
    onSuccess: (r) => {
      toast.success(r.message)
      setSelected({}); setQty({})
      ;['stock-transfer-suggestions', 'warehouse-records', 'wh-control-records'].forEach(key => qc.invalidateQueries({ queryKey: [key] }))
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Transfer emri oluşturulamadı.')),
  })

  if (isLoading || !data) return <div className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin text-zinc-400 inline" /></div>

  if (data.message) {
    return (
      <div className="py-12 text-center space-y-1">
        <Shuffle className="h-6 w-6 text-zinc-300 inline" />
        <p className="text-sm text-zinc-500">{data.message}</p>
        <p className="text-xs text-zinc-400">Üstteki &quot;Depolar&quot; butonundan depo ekleyebilirsiniz.</p>
      </div>
    )
  }

  const allSelected = rows.length > 0 && rows.every(s => selected[keyOf(s)])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {([
          ['Transfer önerisi', String(data.summary.count), `${data.summary.products} ürün`],
          ['Taşınacak miktar', formatQty(data.summary.total_qty), 'toplam'],
          ['Taşınacak stok değeri', formatMoney(data.summary.total_value), 'birim fiyattan'],
          ['Satın alma yerine', String(data.summary.replaces_purchase), 'şirket toplamında stok yeterli'],
        ] as const).map(([label, value, sub]) => (
          <div key={label} className="rounded-xl border border-zinc-200 dark:border-zinc-800 px-4 py-3">
            <p className="text-xs text-zinc-500">{label}</p>
            <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{value}</p>
            <p className="text-[11px] text-zinc-500">{sub}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <p className="text-xs text-zinc-500 max-w-2xl">
          Her depo için hedef stok = depo tüketimi × (tedarik + gözden geçirme süresi) + güvenlik stoğu payı.
          Açığı olan depo, kendi hedefinin üstünde stoğu olan depodan karşılanır. Onay bekleyen transferler hesaba katılır.
        </p>
        <AsyncActionButton
          label={`Transfer emri oluştur (${chosen.length})`}
          width={230}
          disabled={chosen.length === 0}
          onAction={() => createMutation.mutateAsync()}
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-xs text-zinc-500">
            <tr>
              <th className="w-8 px-3 py-2.5">
                <button onClick={() => setSelected(allSelected ? {} : Object.fromEntries(rows.map(s => [keyOf(s), true])))} aria-label="Tümünü seç">
                  {allSelected ? <CheckSquare className="h-4 w-4 text-blue-600" /> : <Square className="h-4 w-4" />}
                </button>
              </th>
              <th className="text-left px-3 py-2.5">Ürün</th>
              <th className="text-left px-3 py-2.5">Kaynak → Hedef</th>
              <th className="text-right px-3 py-2.5">Kaynak stok</th>
              <th className="text-right px-3 py-2.5">Hedef stok</th>
              <th className="text-right px-3 py-2.5">Hedef ihtiyaç</th>
              <th className="text-left px-3 py-2.5 w-32">Transfer</th>
              <th className="text-left px-3 py-2.5">Gerekçe</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="py-12 text-center text-zinc-400">Şu an transfer gerektiren dengesizlik yok.</td></tr>
            ) : rows.map(s => {
              const k = keyOf(s)
              return (
                <tr key={k} className={cn(selected[k] && 'bg-blue-50/50 dark:bg-blue-950/20')}>
                  <td className="px-3 py-2.5 align-top">
                    <button onClick={() => setSelected(p => ({ ...p, [k]: !p[k] }))} aria-label="Seç">
                      {selected[k] ? <CheckSquare className="h-4 w-4 text-blue-600" /> : <Square className="h-4 w-4 text-zinc-400" />}
                    </button>
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <p className="font-medium">{s.name}</p>
                    {s.replaces_purchase && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">Satın alma yerine transfer</span>}
                  </td>
                  <td className="px-3 py-2.5 align-top text-xs whitespace-nowrap">
                    {s.from_warehouse} <ArrowRight className="h-3 w-3 inline text-zinc-400" /> <strong>{s.to_warehouse}</strong>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums align-top">
                    {formatQty(s.source_stock)}
                    <span className="block text-[11px] text-zinc-400">{s.source_daily ? `günde ${formatQty(s.source_daily)}` : 'tüketim yok'}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums align-top">
                    {formatQty(s.dest_stock)}
                    <span className="block text-[11px] text-red-500">{s.dest_cover_days != null ? `${formatQty(s.dest_cover_days)} gün yeter` : ''}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums align-top">{formatQty(Math.round(s.dest_need))}</td>
                  <td className="px-3 py-2.5 align-top">
                    <div className="flex items-center gap-1">
                      <input
                        type="number" min="0" step="any"
                        value={qty[k] ?? String(s.quantity)}
                        onChange={e => { setQty(p => ({ ...p, [k]: e.target.value })); setSelected(p => ({ ...p, [k]: true })) }}
                        className="w-24 px-2 py-1.5 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                      />
                      <span className="text-xs text-zinc-400">{s.unit}</span>
                    </div>
                    {s.value != null && <span className="text-[11px] text-zinc-400">{formatMoney(s.value)}</span>}
                  </td>
                  <td className="px-3 py-2.5 align-top text-xs text-zinc-600 dark:text-zinc-300 max-w-xs">{s.reason}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-zinc-400">Emir &quot;Bekliyor&quot; transfer kaydı olarak açılır; Depolama listesinden onaylayınca stok FEFO sırasıyla (SKT&apos;si yakın lot önce) taşınır.</p>
    </div>
  )
}
