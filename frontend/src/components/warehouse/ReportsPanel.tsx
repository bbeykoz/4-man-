'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Download, FileSpreadsheet, Loader2, Table2, BarChart3 } from 'lucide-react'
import { toast } from 'sonner'
import { api, get } from '@/lib/api'
import { cn, formatDate } from '@/lib/utils'
import { formatQty, useWarehouses } from './stock'
import { formatMoney } from './purchasing/api'
import { DelayChart } from './purchasing/SupplierPerformanceTab'

type Bucket = 'available' | 'reserved' | 'quarantine' | 'damaged'

interface Overview {
  monthly_volume: { month: string; label: string; movements: number; in_qty: number; out_qty: number }[]
  risk_trend: { date: string; risky: number; total: number; risky_rate: number }[]
  status_distribution: { bucket: Bucket; label: string; qty: number; value: number; share: number }[]
  warehouse_stock: ({ warehouse: string; capacity: number | null } & Record<Bucket, number>)[]
  supplier_delay: { name: string; avg_delay_days: number; on_time_rate: number | null; orders: number }[]
}

/**
 * Renkler: kategorik slot 1–4 (açık / koyu tema), validate_palette.js ile iki temada doğrulandı.
 * Kova rengi varlığı takip eder (her grafikte aynı), sıraya göre değişmez.
 */
const THEME = '[--c1:#2a78d6] [--c2:#eb6834] [--c3:#1baf7a] [--c4:#eda100] [--surface:#ffffff] [--grid:#e4e4e7] [--ink:#52525b] ' +
  'dark:[--c1:#3987e5] dark:[--c2:#d95926] dark:[--c3:#199e70] dark:[--c4:#c98500] dark:[--surface:#18181b] dark:[--grid:#3f3f46] dark:[--ink:#a1a1aa]'
const BUCKET_COLOR: Record<Bucket, string> = { available: 'var(--c1)', reserved: 'var(--c2)', quarantine: 'var(--c3)', damaged: 'var(--c4)' }
const BUCKET_LABEL: Record<Bucket, string> = { available: 'Kullanılabilir', reserved: 'Rezerve', quarantine: 'Karantina', damaged: 'Hasarlı' }
const BUCKETS: Bucket[] = ['available', 'reserved', 'quarantine', 'damaged']
const AXIS_TICK = { fontSize: 11, fill: 'var(--ink)' }

function TooltipBox({ title, lines }: { title: string; lines: [string, string, string?][] }) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-zinc-900 dark:text-zinc-100">{title}</p>
      {lines.map(([label, value, color]) => (
        <p key={label} className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300">
          {color && <span className="w-2 h-2 rounded-sm" style={{ background: color }} />}
          {label}: <strong>{value}</strong>
        </p>
      ))}
    </div>
  )
}

/** Grafik kartı: başlık, açıklama, grafik ↔ tablo görünümü (her grafiğin tablo ikizi var). */
function ChartCard({ title, subtitle, table, children, className }: { title: string; subtitle?: string; table: React.ReactNode; children: React.ReactNode; className?: string }) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  return (
    <figure className={cn('rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 flex flex-col', className)}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <figcaption className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{title}</figcaption>
          {subtitle && <p className="text-[11px] text-zinc-500">{subtitle}</p>}
        </div>
        <button
          onClick={() => setView(v => (v === 'chart' ? 'table' : 'chart'))}
          className="shrink-0 inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          aria-label={view === 'chart' ? 'Tablo görünümü' : 'Grafik görünümü'}
        >
          {view === 'chart' ? <><Table2 className="h-3 w-3" /> Tablo</> : <><BarChart3 className="h-3 w-3" /> Grafik</>}
        </button>
      </div>
      <div className="flex-1">{view === 'chart' ? children : <div className="overflow-x-auto">{table}</div>}</div>
    </figure>
  )
}

function SimpleTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full text-xs tabular-nums">
      <thead className="text-zinc-500"><tr>{head.map((h, i) => <th key={h} className={cn('py-1.5 px-2 font-medium', i === 0 ? 'text-left' : 'text-right')}>{h}</th>)}</tr></thead>
      <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={cn('py-1.5 px-2', j === 0 ? 'text-left' : 'text-right')}>{c}</td>)}</tr>)}
      </tbody>
    </table>
  )
}

function Legend({ items }: { items: { color: string; label: string; value?: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
      {items.map(i => (
        <li key={i.label} className="flex items-center gap-1.5 text-[11px] text-zinc-600 dark:text-zinc-300">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: i.color }} />
          {i.label}{i.value && <span className="text-zinc-500 tabular-nums">· {i.value}</span>}
        </li>
      ))}
    </ul>
  )
}

/** Raporlar: belgedeki 5 grafik (gerçek veriyle) + Excel dışa aktarmalar. */
export function ReportsPanel() {
  const { data: warehouses = [] } = useWarehouses()
  const [months, setMonths] = useState<6 | 12>(6)
  const [warehouseId, setWarehouseId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [downloading, setDownloading] = useState<string | null>(null)

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['stock-report-overview', months, warehouseId],
    queryFn: () => get<{ data: Overview; exports: Record<string, string> }>(`/modules/stock/reports/overview?months=${months}${warehouseId ? `&warehouse_id=${warehouseId}` : ''}`),
    placeholderData: prev => prev, // yeniden yüklemede önceki grafik soluk kalır, iskelet yanıp sönmez
  })

  const download = async (type: string, label: string) => {
    setDownloading(type)
    try {
      const params = new URLSearchParams({ type })
      if (type === 'movements') { if (from) params.set('from', from); if (to) params.set('to', to) }
      const res = await api.get<Blob>(`/modules/stock/reports/export?${params}`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      const disposition = String(res.headers['content-disposition'] ?? '')
      a.href = url
      a.download = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? `${label} ${new Date().toISOString().slice(0, 10)}.xlsx` // Content-Disposition CORS ile gizli olabilir
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error(`${label} indirilemedi.`)
    } finally {
      setDownloading(null)
    }
  }

  if (isLoading || !data) return <div className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin text-zinc-400 inline" /></div>

  const d = data.data
  const monthly = d.monthly_volume
  const lastMonth = monthly[monthly.length - 1]
  const riskPoints = d.risk_trend
  const status = d.status_distribution
  const statusTotal = status.reduce((s, x) => s + x.qty, 0)

  return (
    <div className={cn('space-y-4', THEME)}>
      {/* Tek filtre satırı: tüm grafikler aynı dilimle çizilir */}
      <div className="flex flex-wrap items-center gap-2">
        {([6, 12] as const).map(m => (
          <button key={m} onClick={() => setMonths(m)} className={cn('px-3 py-1.5 text-xs font-medium rounded-full border', months === m ? 'bg-blue-600 border-blue-600 text-white' : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400')}>
            Son {m} ay
          </button>
        ))}
        <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)} className="px-3 py-1.5 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
          <option value="">Tüm depolar</option>
          {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <span className="text-[11px] text-zinc-400">Depo filtresi aylık hacim ve durum dağılımına uygulanır.</span>
      </div>

      <div className={cn('grid grid-cols-1 xl:grid-cols-2 gap-4 transition-opacity', isFetching && 'opacity-60')}>
        {/* Grafik 1 — Aylık işlem hacmi (tek seri çizgi + %10 alan, son değer etiketli) */}
        <ChartCard
          title="Aylık işlem hacmi"
          subtitle="Stoğa işlenmiş hareket sayısı (iş tarihine göre)"
          table={<SimpleTable head={['Ay', 'Hareket', 'Giriş', 'Çıkış']} rows={monthly.map(m => [m.label, m.movements, formatQty(m.in_qty), formatQty(m.out_qty)])} />}
        >
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthly} margin={{ top: 20, right: 24, left: -12, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--grid)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS_TICK} />
                <YAxis tickLine={false} axisLine={false} tick={AXIS_TICK} allowDecimals={false} width={40} />
                <Tooltip
                  cursor={{ stroke: 'var(--grid)', strokeWidth: 1 }}
                  content={({ active, payload }) => active && payload?.length ? (() => {
                    const m = payload[0].payload as (typeof monthly)[number]
                    return <TooltipBox title={m.label} lines={[['Hareket', String(m.movements), 'var(--c1)'], ['Giriş', formatQty(m.in_qty)], ['Çıkış', formatQty(m.out_qty)]]} />
                  })() : null}
                />
                <Area type="monotone" dataKey="movements" stroke="var(--c1)" strokeWidth={2} fill="var(--c1)" fillOpacity={0.1}
                  dot={{ r: 4, fill: 'var(--c1)', stroke: 'var(--surface)', strokeWidth: 2 }} activeDot={{ r: 5, stroke: 'var(--surface)', strokeWidth: 2 }} isAnimationActive={false}>
                  <LabelList dataKey="movements" position="top" content={({ x, y, index, value }) =>
                    index === monthly.length - 1 ? <text x={Number(x)} y={Number(y) - 10} textAnchor="middle" fontSize={11} fill="var(--ink)">{String(value)}</text> : null} />
                </Area>
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {lastMonth && <p className="text-[11px] text-zinc-500">{lastMonth.label}: {lastMonth.movements} hareket</p>}
        </ChartCard>

        {/* Grafik 2 — Stok risk trendi (en az 2 gün veri yoksa bilgi kartı) */}
        <ChartCard
          title="Stok risk trendi"
          subtitle="Kritik + yüksek riskli ürünlerin oranı (günlük kayıt)"
          table={<SimpleTable head={['Tarih', 'Riskli', 'Toplam', 'Oran']} rows={riskPoints.map(r => [formatDate(r.date), r.risky, r.total, `%${formatQty(r.risky_rate)}`])} />}
        >
          {riskPoints.length < 2 ? (
            <div className="h-56 flex flex-col items-center justify-center text-center gap-1">
              <p className="text-4xl font-semibold text-zinc-900 dark:text-zinc-100">{riskPoints.length ? `%${formatQty(riskPoints[0].risky_rate)}` : '—'}</p>
              <p className="text-xs text-zinc-500">{riskPoints.length ? `${riskPoints[0].risky} / ${riskPoints[0].total} ürün riskli (${formatDate(riskPoints[0].date)})` : 'Henüz kayıt yok'}</p>
              <p className="text-[11px] text-zinc-400 max-w-xs mt-1">Trend çizgisi için veri birikiyor: risk skorları her gece 23:50&apos;de kaydedilir (yerelde <code>php artisan schedule:work</code> açık olmalı).</p>
            </div>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={riskPoints} margin={{ top: 20, right: 24, left: -12, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--grid)" />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} tick={AXIS_TICK} tickFormatter={v => formatDate(v, 'dd.MM')} minTickGap={24} />
                  <YAxis tickLine={false} axisLine={false} tick={AXIS_TICK} width={40} domain={[0, 100]} tickFormatter={v => `%${v}`} />
                  <Tooltip cursor={{ stroke: 'var(--grid)' }} content={({ active, payload }) => active && payload?.length ? (() => {
                    const r = payload[0].payload as (typeof riskPoints)[number]
                    return <TooltipBox title={formatDate(r.date)} lines={[['Riskli oran', `%${formatQty(r.risky_rate)}`, 'var(--c1)'], ['Riskli ürün', `${r.risky} / ${r.total}`]]} />
                  })() : null} />
                  <Line type="monotone" dataKey="risky_rate" stroke="var(--c1)" strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: 'var(--surface)', strokeWidth: 2 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        {/* Grafik 3 — Stok durum dağılımı (parça-bütün → yatay yığılmış çubuk, 2px yüzey boşluğu) */}
        <ChartCard
          title="Stok durum dağılımı"
          subtitle="Kullanılabilir ve kısıtlı (rezerve / karantina / hasarlı) stok"
          table={<SimpleTable head={['Durum', 'Miktar', 'Pay', 'Değer']} rows={status.map(s => [s.label, formatQty(s.qty), `%${formatQty(s.share)}`, formatMoney(s.value)])} />}
        >
          {statusTotal <= 0 ? <p className="h-24 flex items-center justify-center text-sm text-zinc-400">Stok yok.</p> : (<>
            <div className="h-14">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={[Object.fromEntries(status.map(s => [s.bucket, s.qty]))]} margin={{ top: 4, right: 0, left: 0, bottom: 4 }} barSize={24}>
                  <XAxis type="number" hide domain={[0, statusTotal]} />
                  <YAxis type="category" hide />
                  <Tooltip cursor={false} content={({ active, payload }) => active && payload?.length ? (
                    <TooltipBox title="Stok durumu" lines={status.filter(s => s.qty > 0).map(s => [s.label, `${formatQty(s.qty)} (%${formatQty(s.share)})`, BUCKET_COLOR[s.bucket]] as [string, string, string])} />
                  ) : null} />
                  {BUCKETS.map(b => {
                    const nonZero = BUCKETS.filter(x => (status.find(s => s.bucket === x)?.qty ?? 0) > 0)
                    const first = nonZero[0] === b
                    const last = nonZero[nonZero.length - 1] === b
                    return (
                      <Bar key={b} dataKey={b} stackId="s" fill={BUCKET_COLOR[b]} stroke="var(--surface)" strokeWidth={2} isAnimationActive={false}
                        radius={[first ? 4 : 0, last ? 4 : 0, last ? 4 : 0, first ? 4 : 0]} />
                    )
                  })}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <Legend items={status.map(s => ({ color: BUCKET_COLOR[s.bucket], label: s.label, value: `${formatQty(s.qty)} · %${formatQty(s.share)}` }))} />
          </>)}
        </ChartCard>

        {/* Grafik 4 — Depo bazında stok (yığılmış sütun, kova renkleri grafik 3 ile aynı) */}
        <ChartCard
          title="Depo bazında stok"
          subtitle="Transfer algoritmasının başlangıç girdisi"
          table={<SimpleTable head={['Depo', ...BUCKETS.map(b => BUCKET_LABEL[b]), 'Kapasite']} rows={d.warehouse_stock.map(w => [w.warehouse, ...BUCKETS.map(b => formatQty(w[b])), w.capacity ? formatQty(w.capacity) : '—'])} />}
        >
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.warehouse_stock} margin={{ top: 20, right: 8, left: -8, bottom: 0 }} barCategoryGap="35%">
                <CartesianGrid vertical={false} stroke="var(--grid)" />
                <XAxis dataKey="warehouse" tickLine={false} axisLine={false} tick={AXIS_TICK} interval={0} />
                <YAxis tickLine={false} axisLine={false} tick={AXIS_TICK} allowDecimals={false} width={44} />
                <Tooltip cursor={{ fill: 'var(--grid)', fillOpacity: 0.4 }} content={({ active, payload }) => active && payload?.length ? (() => {
                  const w = payload[0].payload as (typeof d.warehouse_stock)[number]
                  return <TooltipBox title={w.warehouse} lines={BUCKETS.filter(b => w[b] > 0).map(b => [BUCKET_LABEL[b], formatQty(w[b]), BUCKET_COLOR[b]] as [string, string, string])} />
                })() : null} />
                {BUCKETS.map((b, i) => (
                  <Bar key={b} dataKey={b} stackId="w" fill={BUCKET_COLOR[b]} stroke="var(--surface)" strokeWidth={2} maxBarSize={24}
                    radius={i === BUCKETS.length - 1 ? [4, 4, 0, 0] : 0} isAnimationActive={false} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Legend items={BUCKETS.map(b => ({ color: BUCKET_COLOR[b], label: BUCKET_LABEL[b] }))} />
        </ChartCard>
      </div>

      {/* Grafik 5 — Tedarikçi gecikmesi (Faz 8 grafiği) */}
      {d.supplier_delay.length > 0 && <DelayChart rows={d.supplier_delay} />}

      {/* Excel dışa aktarma */}
      <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5"><FileSpreadsheet className="h-4 w-4 text-green-600" /> Excel raporları</p>
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            Hareket defteri aralığı:
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="px-2 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900" />
            –
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className="px-2 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {Object.entries(data.exports).map(([type, label]) => (
            <button
              key={type}
              onClick={() => download(type, label)}
              disabled={downloading !== null}
              className="flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-60 text-left"
            >
              <span>{label}</span>
              {downloading === type ? <Loader2 className="h-4 w-4 animate-spin text-zinc-400" /> : <Download className="h-4 w-4 text-zinc-400" />}
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
