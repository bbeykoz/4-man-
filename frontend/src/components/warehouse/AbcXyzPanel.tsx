'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckSquare, Loader2, ShieldCheck, Square } from 'lucide-react'
import { toast } from 'sonner'
import { get, post } from '@/lib/api'
import { cn } from '@/lib/utils'
import { ConfirmModal } from '@/components/common/ConfirmModal'
import { apiErrorMessage, formatQty, useWarehouses } from './stock'
import { formatMoney } from './purchasing/api'

interface Policy { priority: string; count: string; reorder: string; safety: string; note: string }

interface AbcRow {
  product_id: string
  name: string
  sku?: string | null
  unit: string
  consumed_qty: number
  consumed_value: number
  value_share: number
  cumulative_share: number
  weekly_mean: number
  cv: number | null
  history_weeks: number
  insufficient_history: boolean
  abc: 'A' | 'B' | 'C'
  xyz: 'X' | 'Y' | 'Z'
  class: string
  service_level: number
  safety_stock: number
  recommended_safety: number
  safety_gap: number
}

interface AbcData {
  days: number
  rows: AbcRow[]
  matrix: Record<string, { count: number; value: number; value_share: number }>
  summary: { products: number; total_value: number; a_share: number; a_count: number; safety_gaps: number }
  policies: Record<string, Policy>
}

const ABC_LABEL = { A: 'A · yüksek değer', B: 'B · orta değer', C: 'C · düşük değer' }
const XYZ_LABEL = { X: 'X · düzenli', Y: 'Y · dalgalı', Z: 'Z · düzensiz' }

/** ABC (değer) × XYZ (talep düzeni) matrisi, sınıf politikaları ve önerilen güvenlik stoğu. */
export function AbcXyzPanel() {
  const qc = useQueryClient()
  const { data: warehouses = [] } = useWarehouses()
  const [days, setDays] = useState<90 | 180 | 365>(90)
  const [warehouseId, setWarehouseId] = useState('')
  const [cell, setCell] = useState<string | null>(null)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [confirm, setConfirm] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['abc-xyz', days, warehouseId],
    queryFn: () => get<{ data: AbcData }>(`/modules/stock/abc-xyz?days=${days}${warehouseId ? `&warehouse_id=${warehouseId}` : ''}`).then(r => r.data),
  })

  const applyMutation = useMutation({
    mutationFn: (ids: string[]) => post<{ message: string }>('/modules/stock/abc-xyz/apply-safety', { product_ids: ids, days }),
    onSuccess: (r) => {
      toast.success(r.message)
      setSelected({}); setConfirm(false)
      ;['abc-xyz', 'stock-risk', 'purchasing-suggestions'].forEach(k => qc.invalidateQueries({ queryKey: [k] }))
    },
    onError: (e) => { setConfirm(false); toast.error(apiErrorMessage(e, 'Uygulanamadı.')) },
  })

  if (isLoading || !data) return <div className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin text-zinc-400 inline" /></div>

  const rows = cell ? data.rows.filter(r => r.class === cell) : data.rows
  const chosen = rows.filter(r => selected[r.product_id])
  const policy = cell ? data.policies[cell] : null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {([90, 180, 365] as const).map(d => (
          <button key={d} onClick={() => setDays(d)} className={cn('px-3 py-1.5 text-xs font-medium rounded-full border', days === d ? 'bg-blue-600 border-blue-600 text-white' : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400')}>
            Son {d} gün
          </button>
        ))}
        <span className="text-[11px] text-zinc-500">
          Toplam tüketim {formatMoney(data.summary.total_value)} · A sınıfı: {data.summary.a_count} ürün, değer payı %{formatQty(data.summary.a_share)}
        </span>
        <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)} className="ml-auto px-3 py-1.5 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
          <option value="">Tüm depolar</option>
          {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* 3×3 matris: hücre = ürün sayısı + değer payı çubuğu (tek seri rengi, iki temada doğrulandı) */}
        <div className="lg:col-span-3 overflow-x-auto">
          <table className="w-full text-sm border-separate border-spacing-1.5">
            <thead>
              <tr>
                <th />
                {(['X', 'Y', 'Z'] as const).map(x => <th key={x} className="text-xs font-medium text-zinc-500 pb-1">{XYZ_LABEL[x]}</th>)}
              </tr>
            </thead>
            <tbody>
              {(['A', 'B', 'C'] as const).map(a => (
                <tr key={a}>
                  <th className="text-xs font-medium text-zinc-500 text-right pr-2 whitespace-nowrap">{ABC_LABEL[a]}</th>
                  {(['X', 'Y', 'Z'] as const).map(x => {
                    const key = a + x
                    const c = data.matrix[key]
                    const active = cell === key
                    return (
                      <td key={key} className="p-0">
                        <button
                          onClick={() => setCell(active ? null : key)}
                          className={cn(
                            'w-full rounded-lg border px-3 py-2.5 text-left transition-colors',
                            active ? 'border-blue-500 ring-1 ring-blue-500 bg-blue-50/60 dark:bg-blue-950/30' : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700',
                            c.count === 0 && 'opacity-50'
                          )}
                          title={data.policies[key].note}
                        >
                          <div className="flex items-baseline justify-between">
                            <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">{key}</span>
                            <span className="text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{c.count}</span>
                          </div>
                          <div className="mt-1.5 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden text-[#2a78d6] dark:text-[#3987e5]">
                            <div className="h-full rounded-full bg-current" style={{ width: `${Math.min(100, c.value_share)}%` }} />
                          </div>
                          <p className="mt-1 text-[11px] text-zinc-500 tabular-nums">değer payı %{formatQty(c.value_share)}</p>
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-zinc-400 mt-1">
            ABC: tüketim değerinin kümülatif ilk %80&apos;i A, sonraki %15&apos;i B, kalanı C · XYZ: haftalık tüketimin değişkenlik katsayısı (CV) ≤ 0,5 X, ≤ 1 Y, üstü veya talep yok Z.
          </p>
        </div>

        <div className="lg:col-span-2 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
          {policy ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-blue-600" /> {cell} stok politikası</p>
              <p className="text-xs text-zinc-600 dark:text-zinc-300">{policy.note}</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                <dt className="text-zinc-500">Öncelik</dt><dd>{policy.priority}</dd>
                <dt className="text-zinc-500">Sayım</dt><dd>{policy.count}</dd>
                <dt className="text-zinc-500">Sipariş</dt><dd>{policy.reorder}</dd>
                <dt className="text-zinc-500">Güvenlik stoğu</dt><dd>{policy.safety}</dd>
                <dt className="text-zinc-500">Hizmet hedefi</dt><dd>%{cell!.startsWith('A') ? 98 : cell!.startsWith('B') ? 95 : 90}</dd>
              </dl>
            </div>
          ) : (
            <div className="text-sm text-zinc-500 space-y-1">
              <p className="font-medium text-zinc-700 dark:text-zinc-300">Politika için bir hücre seçin.</p>
              <p className="text-xs">Örnek: AX ürünleri yüksek öncelikli stok kontrolüne, CZ ürünleri ise temkinli satın alma politikasına alınır.</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <p className="text-xs text-zinc-500">
          Önerilen güvenlik stoğu = z × günlük sapma × √tedarik süresi (A %98, B %95, C %90 hizmet seviyesi). Uygulanınca risk skoru ve sipariş önerileri bunu kullanır.
        </p>
        <button
          onClick={() => setConfirm(true)}
          disabled={chosen.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 whitespace-nowrap"
        >
          <ShieldCheck className="h-4 w-4" /> Önerilen güvenlik stoğunu uygula ({chosen.length})
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-xs text-zinc-500">
            <tr>
              <th className="w-8 px-3 py-2.5">
                <button onClick={() => setSelected(chosen.length === rows.length ? {} : Object.fromEntries(rows.map(r => [r.product_id, true])))} aria-label="Tümünü seç">
                  {chosen.length > 0 && chosen.length === rows.length ? <CheckSquare className="h-4 w-4 text-blue-600" /> : <Square className="h-4 w-4" />}
                </button>
              </th>
              <th className="text-left px-3 py-2.5">Ürün</th>
              <th className="text-center px-3 py-2.5">Sınıf</th>
              <th className="text-right px-3 py-2.5">Tüketim değeri</th>
              <th className="text-right px-3 py-2.5">Pay / kümülatif</th>
              <th className="text-right px-3 py-2.5">Haftalık ort.</th>
              <th className="text-right px-3 py-2.5">CV</th>
              <th className="text-right px-3 py-2.5">Güvenlik stoğu<span className="block font-normal">mevcut → önerilen</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 tabular-nums">
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="py-10 text-center text-zinc-400">Bu sınıfta ürün yok.</td></tr>
            ) : rows.map(r => (
              <tr key={r.product_id} className={cn(selected[r.product_id] && 'bg-blue-50/50 dark:bg-blue-950/20')}>
                <td className="px-3 py-2.5">
                  <button onClick={() => setSelected(p => ({ ...p, [r.product_id]: !p[r.product_id] }))} aria-label="Seç">
                    {selected[r.product_id] ? <CheckSquare className="h-4 w-4 text-blue-600" /> : <Square className="h-4 w-4 text-zinc-400" />}
                  </button>
                </td>
                <td className="px-3 py-2.5">
                  <p className="font-medium">{r.name}</p>
                  {r.insufficient_history && <p className="text-[11px] text-amber-600">{r.history_weeks} haftalık veri; sınıf kesinleşmedi</p>}
                </td>
                <td className="px-3 py-2.5 text-center"><span className="text-xs font-bold px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800">{r.class}</span></td>
                <td className="px-3 py-2.5 text-right">{formatMoney(r.consumed_value)}</td>
                <td className="px-3 py-2.5 text-right">%{formatQty(r.value_share)} <span className="text-[11px] text-zinc-400">/ %{formatQty(r.cumulative_share)}</span></td>
                <td className="px-3 py-2.5 text-right">{formatQty(r.weekly_mean)} {r.unit}</td>
                <td className="px-3 py-2.5 text-right">{r.cv == null ? '—' : formatQty(r.cv)}</td>
                <td className="px-3 py-2.5 text-right">
                  {formatQty(r.safety_stock)} → <strong className={cn(Math.abs(r.safety_gap) >= 1 && (r.safety_gap > 0 ? 'text-orange-600' : 'text-green-600'))}>{formatQty(r.recommended_safety)}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmModal
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => applyMutation.mutate(chosen.map(r => r.product_id))}
        title={`${chosen.length} ürünün güvenlik stoğu güncellensin mi?`}
        description="Ürün kartlarındaki güvenlik stoğu önerilen değerle değişir. Risk skoru ve satın alma önerileri bundan sonra bu değeri kullanır."
        confirmLabel="Uygula"
        variant="default"
        loading={applyMutation.isPending}
      />
    </div>
  )
}
