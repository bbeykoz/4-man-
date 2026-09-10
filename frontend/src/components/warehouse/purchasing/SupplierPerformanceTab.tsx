'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Award, Lightbulb, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { get, post, put } from '@/lib/api'
import { cn } from '@/lib/utils'
import { apiErrorMessage } from '../stock'
import { formatMoney } from './api'

interface SupplierPerf {
  supplier_id: string
  name: string
  code: string
  orders: number
  delivered: number
  open_overdue: number
  declared_lead_time: number | null
  avg_lead_time: number | null
  lead_time_std: number
  on_time_rate: number | null
  avg_delay_days: number
  fill_rate: number | null
  short_delivery_rate: number | null
  otif_rate: number | null
  damage_rate: number | null
  price_change_pct: number | null
  spend: number
  score: number | null
  grade: 'A' | 'B' | 'C' | 'D' | null
  lead_time_gap: number | null
  insights: string[]
}

interface Comparison {
  scope: 'product' | 'category'
  product_id: string | null
  label: string
  insight: string | null
  best_supplier_id: string | null
  suppliers: { supplier_id: string; supplier: string; orders: number; avg_lead_time: number | null; on_time_rate: number | null; avg_price: number | null; damage_rate: number | null }[]
}

interface PerfData {
  days: number
  suppliers: SupplierPerf[]
  comparisons: Comparison[]
  summary: { suppliers: number; orders: number; on_time_rate: number | null; avg_delay: number; overdue: number; spend: number }
}

const GRADE_CLS: Record<string, string> = {
  A: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  B: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  C: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  D: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
}

const pct = (v: number | null) => (v == null ? '—' : `%${v.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`)
const num = (v: number | null, suffix = '') => (v == null ? '—' : `${v.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}${suffix}`)

/** Grafik 5: tedarikçi başına ortalama gecikme (gün). Tek seri → lejant yok, başlık adlandırır. */
export function DelayChart({ rows }: { rows: Pick<SupplierPerf, 'name' | 'avg_delay_days' | 'on_time_rate' | 'orders'>[] }) {
  const data = rows.map(r => ({ name: r.name, delay: r.avg_delay_days, onTime: r.on_time_rate, orders: r.orders }))

  return (
    <figure className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
      <figcaption className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Tedarikçi ortalama gecikmesi (gün)</figcaption>
      <p className="text-[11px] text-zinc-500 mb-2">Beklenen teslim tarihinden sonra geçen gün; günü geçmiş açık siparişler dahil.</p>
      {/* Seri rengi currentColor ile tema değişkeninden gelir: açık #2a78d6, koyu #3987e5 (doğrulandı) */}
      <div className="h-56 text-[#2a78d6] dark:text-[#3987e5]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 20, right: 8, left: -12, bottom: 0 }} barCategoryGap="30%">
            <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.12} className="text-zinc-400" />
            <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#71717a' }} interval={0} />
            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#71717a' }} allowDecimals={false} width={36} />
            <Tooltip
              cursor={{ fill: 'currentColor', fillOpacity: 0.06 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const d = payload[0].payload as (typeof data)[number]
                return (
                  <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-xs shadow-md">
                    <p className="font-semibold text-zinc-900 dark:text-zinc-100">{d.name}</p>
                    <p className="text-zinc-600 dark:text-zinc-300">Ortalama gecikme: <strong>{num(d.delay, ' gün')}</strong></p>
                    <p className="text-zinc-500">Zamanında teslim: {pct(d.onTime)} · {d.orders} sipariş</p>
                  </div>
                )
              }}
            />
            <Bar dataKey="delay" fill="currentColor" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false}>
              <LabelList dataKey="delay" position="top" formatter={(v) => num(Number(v))} style={{ fontSize: 11, fill: '#52525b' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  )
}

/** Tedarikçi performansı: skor, teslim süresi (beyan / gerçek), zamanında / tam / hasarlı teslim, fiyat, karşılaştırmalar. */
export function SupplierPerformanceTab() {
  const qc = useQueryClient()
  const [days, setDays] = useState(180)

  const { data, isLoading } = useQuery({
    queryKey: ['supplier-performance', days],
    queryFn: () => get<{ data: PerfData }>(`/modules/purchasing/performance?days=${days}`).then(r => r.data),
  })

  const invalidate = () => ['supplier-performance', 'purchasing-suppliers', 'stock-risk', 'purchasing-suggestions'].forEach(k => qc.invalidateQueries({ queryKey: [k] }))

  const leadMutation = useMutation({
    mutationFn: (supplierId: string) => post<{ message: string }>(`/modules/purchasing/suppliers/${supplierId}/apply-lead-time`, { days }),
    onSuccess: (r) => { toast.success(r.message); invalidate() },
    onError: (e) => toast.error(apiErrorMessage(e, 'Güncellenemedi.')),
  })

  const preferMutation = useMutation({
    mutationFn: ({ productId, supplierId }: { productId: string; supplierId: string }) =>
      put<{ message: string }>(`/modules/warehouse-products/${productId}`, { default_supplier_id: supplierId }),
    onSuccess: () => { toast.success('Varsayılan tedarikçi güncellendi.'); invalidate() },
    onError: (e) => toast.error(apiErrorMessage(e, 'Güncellenemedi.')),
  })

  if (isLoading || !data) return <div className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin text-zinc-400 inline" /></div>

  if (data.suppliers.length === 0) {
    return <p className="py-12 text-center text-sm text-zinc-400">Seçilen dönemde gönderilmiş sipariş yok. Performans, gönderilen ve teslim alınan siparişlerden hesaplanır.</p>
  }

  const s = data.summary

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {[90, 180, 365].map(d => (
          <button key={d} onClick={() => setDays(d)} className={cn('px-3 py-1.5 text-xs font-medium rounded-full border', days === d ? 'bg-blue-600 border-blue-600 text-white' : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400')}>
            Son {d} gün
          </button>
        ))}
        <p className="ml-auto text-[11px] text-zinc-400">Skor: zamanında teslim %35 · tam teslim %25 · kalite %25 · fiyat istikrarı %15</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {([
          ['Zamanında teslim', pct(s.on_time_rate), `${s.orders} sipariş · ${s.suppliers} tedarikçi`],
          ['Ortalama gecikme', num(s.avg_delay, ' gün'), 'beklenen tarihten sonra'],
          ['Günü geçmiş açık sipariş', String(s.overdue), 'henüz teslim edilmedi'],
          ['Satın alma harcaması', formatMoney(s.spend), `son ${data.days} gün`],
        ] as const).map(([label, value, sub]) => (
          <div key={label} className="rounded-xl border border-zinc-200 dark:border-zinc-800 px-4 py-3">
            <p className="text-xs text-zinc-500">{label}</p>
            <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{value}</p>
            <p className="text-[11px] text-zinc-500">{sub}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-xs text-zinc-500">
            <tr>
              <th className="text-left px-3 py-2.5">Tedarikçi</th>
              <th className="text-center px-3 py-2.5">Skor</th>
              <th className="text-right px-3 py-2.5">Sipariş</th>
              <th className="text-right px-3 py-2.5">Teslim süresi<span className="block font-normal">beyan / gerçek</span></th>
              <th className="text-right px-3 py-2.5">Zamanında</th>
              <th className="text-right px-3 py-2.5">Ort. gecikme</th>
              <th className="text-right px-3 py-2.5">Tam teslim</th>
              <th className="text-right px-3 py-2.5">Hasarlı</th>
              <th className="text-right px-3 py-2.5">Fiyat değişimi</th>
              <th className="text-right px-3 py-2.5">Harcama</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 tabular-nums">
            {data.suppliers.map(r => {
              const gapWarn = r.lead_time_gap != null && r.declared_lead_time != null && Math.abs(r.lead_time_gap) >= Math.max(2, r.declared_lead_time * 0.2)
              return (
                <tr key={r.supplier_id} className="align-top">
                  <td className="px-3 py-2.5">
                    <p className="font-medium">{r.name}</p>
                    {r.insights.map((i, idx) => <p key={idx} className="text-[11px] text-zinc-500 max-w-xs">• {i}</p>)}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {r.grade ? <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold', GRADE_CLS[r.grade])}><Award className="h-3 w-3" />{r.grade} · {r.score}</span> : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right">{r.orders}{r.open_overdue > 0 && <span className="block text-[11px] text-red-600">{r.open_overdue} gecikmede</span>}</td>
                  <td className="px-3 py-2.5 text-right">
                    {num(r.declared_lead_time)} / <strong className={cn(gapWarn && (r.lead_time_gap! > 0 ? 'text-red-600' : 'text-green-600'))}>{num(r.avg_lead_time)}</strong> gün
                    {gapWarn && (
                      <button onClick={() => leadMutation.mutate(r.supplier_id)} disabled={leadMutation.isPending} className="block ml-auto mt-1 text-[11px] text-blue-600 hover:underline disabled:opacity-50">
                        Gerçek süreyi kullan
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">{pct(r.on_time_rate)}</td>
                  <td className="px-3 py-2.5 text-right">{num(r.avg_delay_days, ' gün')}</td>
                  <td className="px-3 py-2.5 text-right">{pct(r.fill_rate)}</td>
                  <td className="px-3 py-2.5 text-right">{pct(r.damage_rate)}</td>
                  <td className={cn('px-3 py-2.5 text-right', (r.price_change_pct ?? 0) >= 5 && 'text-red-600')}>{r.price_change_pct == null ? '—' : `${r.price_change_pct > 0 ? '+' : ''}${pct(r.price_change_pct)}`}</td>
                  <td className="px-3 py-2.5 text-right">{formatMoney(r.spend)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <DelayChart rows={data.suppliers} />

      {data.comparisons.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Ürün bazında tedarikçi karşılaştırması</h3>
          {data.comparisons.map((c, idx) => (
            <div key={idx} className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{c.label}</p>
                  {c.insight && <p className="text-xs text-violet-700 dark:text-violet-300 flex items-center gap-1"><Lightbulb className="h-3.5 w-3.5" /> {c.insight}</p>}
                </div>
                {c.scope === 'product' && c.best_supplier_id && c.product_id && (
                  <button
                    onClick={() => preferMutation.mutate({ productId: c.product_id!, supplierId: c.best_supplier_id! })}
                    disabled={preferMutation.isPending}
                    className="px-2.5 py-1.5 text-xs rounded-lg border border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-800 dark:text-violet-300 dark:hover:bg-violet-950/30"
                  >
                    En hızlıyı varsayılan tedarikçi yap
                  </button>
                )}
              </div>
              <table className="w-full text-xs tabular-nums">
                <thead className="text-zinc-500">
                  <tr><th className="text-left py-1">Tedarikçi</th><th className="text-right py-1">Sipariş</th><th className="text-right py-1">Ort. teslim</th><th className="text-right py-1">Zamanında</th><th className="text-right py-1">Ort. fiyat</th><th className="text-right py-1">Hasarlı</th></tr>
                </thead>
                <tbody>
                  {c.suppliers.map(sp => (
                    <tr key={sp.supplier_id} className={cn(sp.supplier_id === c.best_supplier_id && 'font-semibold')}>
                      <td className="py-1">{sp.supplier}</td>
                      <td className="py-1 text-right">{sp.orders}</td>
                      <td className="py-1 text-right">{num(sp.avg_lead_time, ' gün')}</td>
                      <td className="py-1 text-right">{pct(sp.on_time_rate)}</td>
                      <td className="py-1 text-right">{formatMoney(sp.avg_price)}</td>
                      <td className="py-1 text-right">{pct(sp.damage_rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
