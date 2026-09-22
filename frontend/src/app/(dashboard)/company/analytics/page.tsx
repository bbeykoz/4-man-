'use client'

// Düzen: capitalio analytics-page şablonu. Veriler panelin kendi uçlarından:
// /modules/stock/reports/overview ve /modules/stock/kpis.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ChevronDown, Loader2 } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import {
  ChartMarker,
  DashboardCard,
  DashboardChartTooltip,
  DetailHeader,
  DetailTag,
  dashboardPeriods,
  defaultDashboardPeriod,
  type PeriodValue,
} from '@/components/dashboard/shared'
import { get } from '@/lib/api'
import { cn } from '@/lib/utils'

type Bucket = 'available' | 'reserved' | 'quarantine' | 'damaged'

interface Overview {
  monthly_volume: { month: string; label: string; movements: number; in_qty: number; out_qty: number }[]
  risk_trend: { date: string; risky: number; total: number; risky_rate: number }[]
  status_distribution: { bucket: Bucket; label: string; qty: number; value: number; share: number }[]
  warehouse_stock: ({ warehouse: string; capacity: number | null } & Record<Bucket, number>)[]
  supplier_delay: { name: string; avg_delay_days: number; on_time_rate: number | null; orders: number }[]
}

interface Kpi {
  key: string
  label: string
  unit: string
  current: number | null
  previous: number | null
  change: number | null
  trend: 'better' | 'worse' | 'neutral'
  comment: string
}

const nf = (v: number, digits = 0) => v.toLocaleString('tr-TR', { maximumFractionDigits: digits })

const BUCKETS: { key: Bucket; label: string; color: string }[] = [
  { key: 'available', label: 'Kullanılabilir', color: 'var(--chart-1)' },
  { key: 'reserved', label: 'Rezerve', color: 'var(--chart-2)' },
  { key: 'quarantine', label: 'Karantina', color: 'var(--chart-3)' },
  { key: 'damaged', label: 'Hasarlı', color: 'var(--chart-5)' },
]

const MOVEMENT_SERIES = [
  { dataKey: 'in_qty', label: 'Giriş', color: 'var(--chart-4)' },
  { dataKey: 'out_qty', label: 'Çıkış', color: 'var(--chart-1)' },
  { dataKey: 'movements', label: 'Kayıt', color: 'var(--chart-2)' },
]

/** Metrik kartlarında gösterilecek KPI'lar; grafik türü kartın kendi verisine göre. */
const METRIC_KPIS: { key: string; type: 'bars' | 'area'; color: string }[] = [
  { key: 'damage_rate', type: 'bars', color: 'var(--chart-5)' },
  { key: 'return_rate', type: 'bars', color: 'var(--chart-3)' },
  { key: 'processing_hours', type: 'area', color: 'var(--chart-2)' },
]

function seriesNames(series: readonly { dataKey: string; label: string }[]) {
  return Object.fromEntries(series.map(item => [item.dataKey, item.label]))
}

function seriesColors(series: readonly { dataKey: string; color: string }[]) {
  return Object.fromEntries(series.map(item => [item.dataKey, item.color]))
}

function hoverFill(color: string) {
  return `color-mix(in oklab, ${color} 78%, var(--foreground))`
}

function AnalyticsLegend({ series }: { series: readonly { label: string; color: string }[] }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-center gap-5">
      {series.map(item => (
        <div key={item.label} className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <ChartMarker color={item.color} className="size-2.5" />
          <span className="truncate">{item.label}</span>
        </div>
      ))}
    </div>
  )
}

/** Büyük performans grafiği: aylık giriş, çıkış ve kayıt sayısı. */
function MovementChart({ overview }: { overview: Overview }) {
  const chartData = overview.monthly_volume.map(point => ({
    label: point.label,
    in_qty: point.in_qty,
    out_qty: point.out_qty,
    movements: point.movements,
  }))

  return (
    <DashboardCard className="flex flex-col gap-5">
      <DetailHeader title="Stok hareketi" subtitle="Aylık giriş, çıkış ve kayıt sayısı">
        <DetailTag color="var(--chart-4)">Son 6 ay</DetailTag>
      </DetailHeader>

      <div className="dashboard-dot-grid h-80 min-w-0 overflow-hidden rounded-md md:h-96">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="analytics-movement-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-4)" stopOpacity="0.42" />
                <stop offset="100%" stopColor="var(--chart-4)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <XAxis allowDuplicatedCategory axisLine={false} dataKey="label" tick={false} tickLine={false} />
            <YAxis
              axisLine={false}
              tick={{ fill: 'var(--muted-foreground)', fontSize: '0.75rem' }}
              tickLine={false}
              width={48}
            />
            <RechartsTooltip
              cursor={false}
              content={
                <DashboardChartTooltip
                  colors={seriesColors(MOVEMENT_SERIES)}
                  names={seriesNames(MOVEMENT_SERIES)}
                  valueFormatter={value => nf(Number(value))}
                />
              }
            />
            <Area
              dataKey="in_qty"
              dot={false}
              fill="url(#analytics-movement-fill)"
              isAnimationActive
              stroke="var(--chart-4)"
              strokeWidth={3}
              type="monotone"
            />
            <Area
              dataKey="out_qty"
              dot={false}
              fill="transparent"
              isAnimationActive
              stroke="var(--chart-1)"
              strokeDasharray="8 8"
              strokeWidth={2}
              type="monotone"
            />
            <Area
              dataKey="movements"
              dot={false}
              fill="transparent"
              isAnimationActive
              stroke="var(--chart-2)"
              strokeDasharray="4 6"
              strokeWidth={2}
              type="monotone"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid min-w-0 grid-cols-6 pl-12 text-center text-xs text-muted-foreground">
        {overview.monthly_volume.map(point => (
          <span key={point.month} className="truncate">{point.label}</span>
        ))}
      </div>

      <AnalyticsLegend series={MOVEMENT_SERIES} />
    </DashboardCard>
  )
}

/** Küçük metrik kartı: KPI değeri + bu dönem/önceki dönem karşılaştırma grafiği. */
function MetricCard({ kpi, type, color }: { kpi: Kpi; type: 'bars' | 'area'; color: string }) {
  const chartData = [
    { label: 'Önceki', value: kpi.previous ?? 0 },
    { label: 'Şimdi', value: kpi.current ?? 0 },
  ]
  const value = kpi.current == null
    ? '—'
    : kpi.unit === '%' ? `%${nf(kpi.current, 1)}` : `${nf(kpi.current, 2)}${kpi.unit}`

  return (
    <DashboardCard className="flex min-h-40 flex-col gap-5">
      <div>
        <h2 className="truncate text-base font-medium leading-6">{kpi.label}</h2>
        <div className="mt-4 text-3xl font-semibold leading-none">{value}</div>
        <div className="mt-1 truncate text-xs text-muted-foreground" title={kpi.comment}>
          {kpi.comment || 'Önceki dönemle karşılaştırma'}
        </div>
      </div>
      <div className="min-h-16 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          {type === 'bars' ? (
            <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <XAxis dataKey="label" hide />
              <YAxis hide />
              <RechartsTooltip
                cursor={false}
                content={
                  <DashboardChartTooltip
                    colors={{ value: color }}
                    names={{ value: kpi.label }}
                    valueFormatter={v => (kpi.unit === '%' ? `%${nf(Number(v), 1)}` : `${nf(Number(v), 2)}${kpi.unit}`)}
                  />
                }
              />
              <Bar
                activeBar={{ fill: hoverFill(color) }}
                dataKey="value"
                fill={color}
                isAnimationActive
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          ) : (
            <AreaChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`analytics-${kpi.key}-fill`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity="0.42" />
                  <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" hide />
              <YAxis hide />
              <RechartsTooltip
                cursor={false}
                content={
                  <DashboardChartTooltip
                    colors={{ value: color }}
                    names={{ value: kpi.label }}
                    valueFormatter={v => `${nf(Number(v), 2)}${kpi.unit}`}
                  />
                }
              />
              <Area
                dataKey="value"
                dot={false}
                fill={`url(#analytics-${kpi.key}-fill)`}
                isAnimationActive
                stroke={color}
                strokeWidth={2}
                type="monotone"
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </DashboardCard>
  )
}

function AnalyticsPanel({
  title,
  subtitle,
  status,
  series,
  children,
}: {
  title: string
  subtitle: string
  status: string
  series: readonly { label: string; color: string }[]
  children: React.ReactNode
}) {
  return (
    <DashboardCard className="flex min-h-80 flex-col gap-5">
      <DetailHeader title={title} subtitle={subtitle}>
        <DetailTag color="var(--chart-4)">{status}</DetailTag>
      </DetailHeader>
      <AnalyticsLegend series={series} />
      <div className="min-h-56 flex-1">{children}</div>
    </DashboardCard>
  )
}

/** Depo bazında stok: kova başına ayrı sütun. */
function WarehouseChart({ rows }: { rows: Overview['warehouse_stock'] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          axisLine={false}
          dataKey="warehouse"
          tick={{ fill: 'var(--muted-foreground)', fontSize: '0.75rem' }}
          tickLine={false}
        />
        <YAxis
          axisLine={false}
          tick={{ fill: 'var(--muted-foreground)', fontSize: '0.75rem' }}
          tickLine={false}
          width={48}
        />
        <RechartsTooltip
          cursor={false}
          content={
            <DashboardChartTooltip
              colors={Object.fromEntries(BUCKETS.map(b => [b.key, b.color]))}
              names={Object.fromEntries(BUCKETS.map(b => [b.key, b.label]))}
              valueFormatter={value => nf(Number(value))}
            />
          }
        />
        {BUCKETS.map(bucket => (
          <Bar
            activeBar={{ fill: hoverFill(bucket.color) }}
            key={bucket.key}
            dataKey={bucket.key}
            fill={bucket.color}
            isAnimationActive
            radius={[4, 4, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Aylık giriş/çıkış: üst üste yığılmış sütun. */
function VolumeChart({ rows }: { rows: Overview['monthly_volume'] }) {
  const series = [
    { dataKey: 'in_qty', label: 'Giriş', color: 'var(--chart-4)' },
    { dataKey: 'out_qty', label: 'Çıkış', color: 'var(--chart-1)' },
  ]

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          axisLine={false}
          dataKey="label"
          tick={{ fill: 'var(--muted-foreground)', fontSize: '0.75rem' }}
          tickLine={false}
        />
        <YAxis
          axisLine={false}
          tick={{ fill: 'var(--muted-foreground)', fontSize: '0.75rem' }}
          tickLine={false}
          width={48}
        />
        <RechartsTooltip
          cursor={false}
          content={
            <DashboardChartTooltip
              colors={seriesColors(series)}
              names={seriesNames(series)}
              valueFormatter={value => nf(Number(value))}
            />
          }
        />
        {series.map((item, index) => (
          <Bar
            activeBar={{ fill: hoverFill(item.color) }}
            key={item.dataKey}
            dataKey={item.dataKey}
            fill={item.color}
            isAnimationActive
            radius={index === series.length - 1 ? [6, 6, 0, 0] : [0, 0, 6, 6]}
            stackId="volume"
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

export default function CompanyAnalyticsPage() {
  const [period, setPeriod] = useState<PeriodValue>(defaultDashboardPeriod)
  const [periodOpen, setPeriodOpen] = useState(false)

  const { data: overview, isLoading } = useQuery({
    queryKey: ['analytics', 'stock-overview'],
    queryFn: () => get<{ data: Overview }>('/modules/stock/reports/overview?months=6').then(r => r.data),
  })

  const { data: kpiReport } = useQuery({
    queryKey: ['analytics', 'kpis', period],
    queryFn: () =>
      get<{ data: { kpis: Kpi[] } }>(`/modules/stock/kpis?period=${period === 180 ? 90 : period}`).then(r => r.data),
  })

  if (isLoading || !overview) {
    return (
      <div className="py-20 text-center">
        <Loader2 className="inline h-5 w-5 animate-spin text-zinc-400" />
      </div>
    )
  }

  const kpis = kpiReport?.kpis ?? []
  const metrics = METRIC_KPIS
    .map(m => ({ ...m, kpi: kpis.find(k => k.key === m.key) }))
    .filter(m => m.kpi) as (typeof METRIC_KPIS[number] & { kpi: Kpi })[]
  const selectedPeriod = dashboardPeriods.find(p => p.value === period) ?? dashboardPeriods[0]
  const totalStock = overview.warehouse_stock.reduce(
    (sum, w) => sum + w.available + w.reserved + w.quarantine + w.damaged,
    0,
  )

  return (
    <div className="space-y-4">
      <PageHeader
        title="Analiz"
        description="Stok hareketi, depo dağılımı ve performans göstergeleri"
        actions={
          <div className="relative">
            <button
              onClick={() => setPeriodOpen(o => !o)}
              className="flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground hover:text-foreground"
            >
              {selectedPeriod.label}
              <ChevronDown className="size-3.5" />
            </button>
            {periodOpen && (
              <div className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-lg border border-border bg-popover shadow-custom">
                {dashboardPeriods.map(p => (
                  <button
                    key={p.value}
                    onClick={() => { setPeriod(p.value); setPeriodOpen(false) }}
                    className={cn(
                      'block w-full px-3 py-2 text-left text-sm hover:bg-foreground/5',
                      p.value === period && 'font-medium text-foreground',
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        }
      />

      <MovementChart overview={overview} />

      {metrics.length > 0 && (
        <div className="grid min-w-0 gap-3 lg:grid-cols-3">
          {metrics.map(metric => (
            <MetricCard key={metric.key} kpi={metric.kpi} type={metric.type} color={metric.color} />
          ))}
        </div>
      )}

      <div className="grid min-w-0 gap-3 xl:grid-cols-2">
        <AnalyticsPanel
          title="Depo bazında stok"
          subtitle="Kullanılabilir, rezerve, karantina ve hasarlı"
          status={`${nf(totalStock)} birim`}
          series={BUCKETS}
        >
          <WarehouseChart rows={overview.warehouse_stock} />
        </AnalyticsPanel>

        <AnalyticsPanel
          title="Aylık giriş / çıkış"
          subtitle="Deftere işlenmiş miktarlar"
          status="Son 6 ay"
          series={[
            { label: 'Giriş', color: 'var(--chart-4)' },
            { label: 'Çıkış', color: 'var(--chart-1)' },
          ]}
        >
          <VolumeChart rows={overview.monthly_volume} />
        </AnalyticsPanel>
      </div>
    </div>
  )
}
