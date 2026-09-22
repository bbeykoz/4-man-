'use client'

// Düzen: capitalio dashboard şablonu (summary kartları → detay → alt bölüm).
// Veriler sahte data dosyasından değil, panelin kendi uçlarından geliyor:
// /modules/stock/reports/overview, /modules/stock/kpis, /modules/stock/risk, /dashboard/company.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  AlertTriangle, ArrowUpRight, Boxes, CalendarClock, ChevronDown, Download,
  Activity, History, Layers, Loader2, ShieldAlert, ShoppingCart, TrendingUp, Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/common/PageHeader'
import { ActivitiesCard } from '@/components/common/ActivitiesCard'
import {
  ChartMarker,
  DashboardCard,
  DashboardChartTooltip,
  DetailHeader,
  DetailTag,
  dashboardPeriods,
  defaultDashboardPeriod,
  toneColor,
  type PeriodValue,
} from '@/components/dashboard/shared'
import { api, get } from '@/lib/api'
import { cn, formatDateTime } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import type { ActivityLog } from '@/types/api.types'

// ─── Tipler ───────────────────────────────────────────────────────────────────

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
  change: number | null
  change_pct: number | null
  change_is_points: boolean
  trend: 'better' | 'worse' | 'neutral'
  comment: string
}

interface RiskRow {
  product_id: string
  name: string
  sku?: string | null
  unit: string
  available: number
  days_of_cover: number | null
  risk_score: number
  risk_level: 'critical' | 'high' | 'medium' | 'low'
  suggested_order_qty: number
  recommendation: string
}

// ─── Biçimlendirme ────────────────────────────────────────────────────────────

const nf = (v: number, digits = 0) =>
  v.toLocaleString('tr-TR', { maximumFractionDigits: digits })

function money(v: number) {
  if (v >= 1_000_000) return `₺${nf(v / 1_000_000, 1)}M`
  if (v >= 1_000) return `₺${nf(v / 1_000, 1)}K`
  return `₺${nf(v)}`
}

const BUCKET_COLOR: Record<Bucket, string> = {
  available: 'var(--chart-1)',
  reserved: 'var(--chart-2)',
  quarantine: 'var(--chart-3)',
  damaged: 'var(--chart-5)',
}

const KPI_CARDS = ['availability', 'count_accuracy', 'po_fill_rate', 'turnover'] as const

// ─── Özet kartları ────────────────────────────────────────────────────────────

function IconBadge({ icon: Icon }: { icon: React.ElementType }) {
  return (
    <div className="dashboard-icon-badge flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg p-2 text-white">
      <Icon className="size-5 shrink-0" />
    </div>
  )
}

function SummaryCard({
  title,
  value,
  suffix,
  change,
  icon,
  children,
}: {
  title: string
  value: string
  suffix?: string
  change?: { value: string; label: string; tone: 'positive' | 'negative' | 'neutral' }
  icon: React.ElementType
  children?: React.ReactNode
}) {
  return (
    <DashboardCard className="flex min-h-48 flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="truncate text-base font-normal leading-6">{title}</h2>
        <IconBadge icon={icon} />
      </div>

      <div className="flex items-end gap-2">
        <div className="text-3xl font-bold leading-none tracking-normal">
          {value}
          {suffix && <span className="ml-1 text-base font-semibold text-foreground/70">{suffix}</span>}
        </div>
        {change && (
          <div className="flex min-w-0 items-center gap-1 pb-0.5 text-xs leading-tight text-muted-foreground">
            <span className="shrink-0 font-medium" style={{ color: toneColor(change.tone) }}>
              {change.value}
            </span>
            <span className="truncate">{change.label}</span>
          </div>
        )}
      </div>

      {children}
    </DashboardCard>
  )
}

function MiniArea({ data, dataKey, color, name }: {
  data: Record<string, string | number>[]
  dataKey: string
  color: string
  name: string
}) {
  const gradientId = `mini-${dataKey}-fill`

  return (
    <div className="h-16 w-full" style={{ color }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.32" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <XAxis dataKey="name" hide />
          <YAxis hide />
          <RechartsTooltip
            cursor={false}
            content={<DashboardChartTooltip colors={{ [dataKey]: color }} names={{ [dataKey]: name }} />}
          />
          <Area
            dataKey={dataKey}
            dot={false}
            fill={`url(#${gradientId})`}
            isAnimationActive
            stroke="currentColor"
            strokeWidth={2}
            type="monotone"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function AllocationBar({ status }: { status: Overview['status_distribution'] }) {
  const nonZero = status.filter(s => s.qty > 0)
  const chartData = [Object.fromEntries(nonZero.map(s => [s.label, s.qty]))]

  return (
    <div className="flex flex-1 flex-col justify-between gap-6">
      <div className="h-5 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <XAxis type="number" hide />
            <YAxis type="category" hide />
            {nonZero.map((s, index) => (
              <Bar
                key={s.bucket}
                dataKey={s.label}
                fill={BUCKET_COLOR[s.bucket]}
                isAnimationActive
                radius={index === 0 ? [6, 0, 0, 6] : [0, 6, 6, 0]}
                stackId="allocation"
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="space-y-3">
        {status.map(s => (
          <div key={s.bucket} className="flex items-center gap-3">
            <ChartMarker color={BUCKET_COLOR[s.bucket]} className="size-3.5" />
            <span className="min-w-0 flex-1 truncate text-sm text-foreground/80">{s.label}</span>
            <span className="text-sm font-semibold">{nf(s.qty)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Detay bölümü ─────────────────────────────────────────────────────────────

function PerformancePanel({ overview, kpis }: { overview: Overview; kpis: Kpi[] }) {
  const chartData = overview.monthly_volume.map(m => ({
    name: m.label,
    giris: m.in_qty,
    cikis: m.out_qty,
  }))
  const shown = KPI_CARDS.map(key => kpis.find(k => k.key === key)).filter(Boolean) as Kpi[]

  return (
    <DashboardCard className="flex flex-col gap-6 xl:col-span-2">
      <DetailHeader title="Stok hareketi" subtitle="Aylık giriş ve çıkış miktarı">
        <DetailTag color="var(--chart-4)">Son 6 ay</DetailTag>
      </DetailHeader>

      <div className="dashboard-dot-grid min-h-72 min-w-0 flex-1 overflow-hidden rounded-md">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="stock-in-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-4)" stopOpacity="0.42" />
                <stop offset="100%" stopColor="var(--chart-4)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <XAxis axisLine={false} dataKey="name" tick={false} tickLine={false} />
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
                  colors={{ giris: 'var(--chart-4)', cikis: 'var(--chart-1)' }}
                  names={{ giris: 'Giriş', cikis: 'Çıkış' }}
                />
              }
            />
            <Area
              dataKey="giris"
              dot={false}
              fill="url(#stock-in-fill)"
              isAnimationActive
              stroke="var(--chart-4)"
              strokeWidth={3}
              type="monotone"
            />
            <Area
              dataKey="cikis"
              dot={false}
              fill="transparent"
              isAnimationActive
              stroke="var(--chart-1)"
              strokeDasharray="8 8"
              strokeWidth={2}
              type="monotone"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid min-w-0 grid-cols-6 pl-12 text-center text-xs text-muted-foreground">
        {overview.monthly_volume.map(m => (
          <span key={m.month} className="truncate">{m.label}</span>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-4">
        {[
          { label: 'Giriş', color: 'var(--chart-4)' },
          { label: 'Çıkış', color: 'var(--chart-1)' },
        ].map(item => (
          <div key={item.label} className="flex items-center gap-2 text-sm text-foreground/80">
            <ChartMarker color={item.color} />
            <span>{item.label}</span>
          </div>
        ))}
      </div>

      {shown.length > 0 && (
        <div className="grid grid-cols-2 gap-5 xl:grid-cols-4">
          {shown.map(k => (
            <div key={k.key} className="space-y-2" title={k.comment}>
              <div className="truncate text-sm font-medium text-muted-foreground">{k.label}</div>
              <div className="text-2xl font-medium leading-none">
                {k.current == null ? '—' : k.unit === '%' ? `%${nf(k.current, 1)}` : `${nf(k.current, 2)}${k.unit}`}
              </div>
              <div
                className="flex items-center gap-1 text-xs font-medium"
                style={{ color: toneColor(k.trend === 'better' ? 'positive' : k.trend === 'worse' ? 'negative' : 'neutral') }}
              >
                {k.change == null
                  ? 'önceki dönem yok'
                  : `${k.change > 0 ? '+' : ''}${nf(k.change, 1)}${k.change_is_points ? ' puan' : k.unit}`}
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardCard>
  )
}

function WarehouseDonut({ warehouses }: { warehouses: Overview['warehouse_stock'] }) {
  const palette = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)']
  const rows = warehouses.map((w, i) => ({
    name: w.warehouse,
    value: w.available + w.reserved + w.quarantine + w.damaged,
    fill: palette[i % palette.length],
  }))
  const total = rows.reduce((sum, r) => sum + r.value, 0)

  return (
    <DashboardCard className="flex flex-col gap-6">
      <DetailHeader title="Depo dağılımı" subtitle="Depo başına toplam stok">
        <DetailTag>{rows.length} depo</DetailTag>
      </DetailHeader>

      <div className="flex flex-1 flex-col justify-between gap-6">
        <div className="relative mx-auto aspect-square w-full max-w-56">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                cornerRadius={4}
                data={rows}
                dataKey="value"
                endAngle={-270}
                innerRadius="68%"
                isAnimationActive
                outerRadius="88%"
                paddingAngle={6}
                startAngle={90}
                stroke="none"
              />
              <RechartsTooltip
                wrapperStyle={{ zIndex: 20 }}
                cursor={false}
                content={<DashboardChartTooltip valueFormatter={(value) => nf(Number(value))} />}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 z-0 flex flex-col items-center justify-center">
            <div className="text-3xl font-semibold leading-none">{nf(total)}</div>
            <div className="mt-2 text-base text-muted-foreground">toplam</div>
          </div>
        </div>

        <div className="space-y-4">
          {rows.map(row => (
            <div key={row.name} className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <ChartMarker color={row.fill} className="size-4" />
                <span className="truncate text-base font-medium text-foreground/80">{row.name}</span>
              </div>
              <div className="flex shrink-0 items-center gap-4">
                <span className="text-base font-medium text-foreground/80">{nf(row.value)}</span>
                <span className="min-w-10 text-right text-base text-muted-foreground">
                  {total > 0 ? `%${nf((row.value / total) * 100, 1)}` : '—'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </DashboardCard>
  )
}

// ─── Alt bölüm ────────────────────────────────────────────────────────────────

const RISK_TONE: Record<RiskRow['risk_level'], 'positive' | 'negative' | 'neutral'> = {
  critical: 'negative',
  high: 'negative',
  medium: 'neutral',
  low: 'positive',
}

const RISK_LABEL: Record<RiskRow['risk_level'], string> = {
  critical: 'Kritik',
  high: 'Yüksek',
  medium: 'Orta',
  low: 'Düşük',
}

function RiskTable({ rows }: { rows: RiskRow[] }) {
  return (
    <DashboardCard className="flex flex-col gap-4 lg:col-span-2">
      <DetailHeader title="Riskli ürünler" subtitle="Stok bitişine en yakın ürünler">
        <a
          href="/modules/warehouse?tab=stok-riski"
          className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          Tümü <ArrowUpRight className="size-4 shrink-0" />
        </a>
      </DetailHeader>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Riskli ürün yok.</p>
      ) : (
        <>
          <div className="hidden min-w-0 md:block">
            <div className="grid grid-cols-12 items-center rounded-lg border border-border bg-foreground/5 px-4 py-3 text-sm font-medium text-foreground/80">
              <div className="col-span-5">Ürün</div>
              <div className="col-span-2">Stok</div>
              <div className="col-span-2">Kalan gün</div>
              <div className="col-span-2">Önerilen sipariş</div>
              <div className="col-span-1 text-right">Risk</div>
            </div>
            <div>
              {rows.map(row => (
                <div
                  key={row.product_id}
                  className="grid grid-cols-12 items-center border-b border-border px-4 py-3 last:border-b-0"
                >
                  <div className="col-span-5 min-w-0">
                    <div className="truncate text-sm font-medium leading-none">{row.name}</div>
                    <div className="mt-1 text-xs leading-none text-muted-foreground">{row.sku ?? '—'}</div>
                  </div>
                  <div className="col-span-2 text-sm">{nf(row.available)} {row.unit}</div>
                  <div className="col-span-2 text-sm">
                    {row.days_of_cover == null ? '—' : `${nf(row.days_of_cover)} gün`}
                  </div>
                  <div className="col-span-2 text-sm">
                    {row.suggested_order_qty > 0 ? `${nf(row.suggested_order_qty)} ${row.unit}` : '—'}
                  </div>
                  <div
                    className="col-span-1 text-right text-sm font-medium"
                    style={{ color: toneColor(RISK_TONE[row.risk_level]) }}
                  >
                    {RISK_LABEL[row.risk_level]}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3 md:hidden">
            {rows.map(row => (
              <div key={row.product_id} className="rounded-lg border border-border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{row.name}</div>
                    <div className="text-xs text-muted-foreground">{row.sku ?? '—'}</div>
                  </div>
                  <span className="text-sm font-medium" style={{ color: toneColor(RISK_TONE[row.risk_level]) }}>
                    {RISK_LABEL[row.risk_level]}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">Stok</div>
                    <div>{nf(row.available)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Kalan gün</div>
                    <div>{row.days_of_cover == null ? '—' : nf(row.days_of_cover)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Sipariş</div>
                    <div>{row.suggested_order_qty > 0 ? nf(row.suggested_order_qty) : '—'}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </DashboardCard>
  )
}

function InsightsPanel({ rows, suppliers }: { rows: RiskRow[]; suppliers: Overview['supplier_delay'] }) {
  const worstSupplier = [...suppliers].sort((a, b) => b.avg_delay_days - a.avg_delay_days)[0]

  const items = [
    rows[0] && {
      icon: ShoppingCart,
      title: 'Sipariş önerisi',
      description: rows[0].recommendation || `${rows[0].name} için ${nf(rows[0].suggested_order_qty)} ${rows[0].unit} sipariş önerildi.`,
      href: '/modules/warehouse?tab=satin-alma',
      action: 'Satın almaya git',
    },
    worstSupplier && worstSupplier.avg_delay_days > 0 && {
      icon: CalendarClock,
      title: 'Tedarikçi gecikmesi',
      description: `${worstSupplier.name} siparişleri ortalama ${nf(worstSupplier.avg_delay_days, 1)} gün geç geliyor. Tedarik süresini güncellemek stok riskini düşürür.`,
      href: '/modules/warehouse?tab=satin-alma',
      action: 'Performansa bak',
    },
    {
      icon: Layers,
      title: 'Raporlar hazır',
      description: 'Aylık hacim, risk trendi ve depo bazında stok raporları tek tıkla Excel olarak iner.',
      href: '/modules/warehouse?tab=raporlar',
      action: 'Raporlara git',
    },
  ].filter(Boolean) as { icon: React.ElementType; title: string; description: string; href: string; action: string }[]

  return (
    <DashboardCard className="flex flex-col gap-6">
      <DetailHeader title="Öneriler" subtitle="Panelin çıkardığı aksiyonlar">
        <DetailTag>{items.length}</DetailTag>
      </DetailHeader>

      <div className="flex flex-col gap-6">
        {items.map((item, index) => {
          const Icon = item.icon
          return (
            <div key={item.title} className={cn('flex gap-3', index > 0 && 'border-t border-border pt-6')}>
              <div className="dashboard-icon-badge flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg p-1.5 text-white">
                <Icon className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium leading-tight">{item.title}</div>
                <div className="mt-2 text-sm leading-snug text-muted-foreground">{item.description}</div>
                <div className="mt-3 flex justify-end">
                  <a
                    href={item.href}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <span className="truncate">{item.action}</span>
                    <ArrowUpRight className="size-4 shrink-0" />
                  </a>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </DashboardCard>
  )
}

// ─── Sayfa ────────────────────────────────────────────────────────────────────

export default function CompanyDashboardPage() {
  const { user } = useAuthStore()
  const [period, setPeriod] = useState<PeriodValue>(defaultDashboardPeriod)
  const [periodOpen, setPeriodOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['dashboard', 'stock-overview'],
    queryFn: () => get<{ data: Overview }>('/modules/stock/reports/overview?months=6').then(r => r.data),
  })

  const { data: kpiReport } = useQuery({
    queryKey: ['dashboard', 'kpis', period],
    queryFn: () =>
      get<{ data: { kpis: Kpi[] } }>(`/modules/stock/kpis?period=${period === 180 ? 90 : period}`).then(r => r.data),
  })

  const { data: risk } = useQuery({
    queryKey: ['dashboard', 'risk'],
    queryFn: () => get<{ data: RiskRow[]; summary: Record<string, number> }>('/modules/stock/risk'),
  })

  const { data: activity, isLoading: activityLoading } = useQuery({
    queryKey: ['dashboard', 'company', 'activity'],
    queryFn: () => get<{ data: ActivityLog[] }>('/dashboard/activity').then(r => r.data ?? []),
  })

  const { data: company } = useQuery({
    queryKey: ['dashboard', 'company'],
    queryFn: () => get<{ data: { users?: { total?: number; active?: number } } }>('/dashboard/company').then(r => r.data),
  })

  const exportBalances = async () => {
    setExporting(true)
    try {
      const res = await api.get<Blob>('/modules/stock/reports/export?type=balances', { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `stok-bakiyeleri-${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Rapor indirilemedi.')
    } finally {
      setExporting(false)
    }
  }

  if (overviewLoading || !overview) {
    return (
      <div className="py-20 text-center">
        <Loader2 className="inline h-5 w-5 animate-spin text-zinc-400" />
      </div>
    )
  }

  const monthly = overview.monthly_volume.map(m => ({ name: m.label, movements: m.movements, in_qty: m.in_qty }))
  const lastMonth = overview.monthly_volume[overview.monthly_volume.length - 1]
  const prevMonth = overview.monthly_volume[overview.monthly_volume.length - 2]
  const movementChange = prevMonth && prevMonth.movements > 0
    ? ((lastMonth.movements - prevMonth.movements) / prevMonth.movements) * 100
    : null

  const stockValue = overview.status_distribution.reduce((sum, s) => sum + s.value, 0)
  const available = overview.status_distribution.find(s => s.bucket === 'available')
  const riskRows = (risk?.data ?? []).slice(0, 6)
  const riskyCount = (risk?.summary?.critical ?? 0) + (risk?.summary?.high ?? 0)
  const riskTrend = overview.risk_trend.map(r => ({ name: r.date, risky_rate: r.risky_rate }))
  const selectedPeriod = dashboardPeriods.find(p => p.value === period) ?? dashboardPeriods[0]

  return (
    <div className="space-y-4">
      <PageHeader
        title={user?.company?.name ?? 'Panel'}
        description="Depo ve stok özeti"
        actions={
          <div className="flex flex-wrap items-center gap-2">
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
            <button
              onClick={exportBalances}
              disabled={exporting}
              className="flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
            >
              {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              Dışa aktar
            </button>
          </div>
        }
      />

      {/* Özet kartları */}
      <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Stok değeri"
          value={money(stockValue)}
          icon={Boxes}
          change={movementChange != null ? {
            value: `${movementChange > 0 ? '+' : ''}%${nf(movementChange, 1)}`,
            label: 'hareket, geçen aya göre',
            tone: movementChange >= 0 ? 'positive' : 'negative',
          } : undefined}
        >
          <MiniArea data={monthly} dataKey="in_qty" color="var(--chart-4)" name="Giriş" />
        </SummaryCard>

        <SummaryCard
          title="Aylık hareket"
          value={nf(lastMonth?.movements ?? 0)}
          suffix="kayıt"
          icon={TrendingUp}
        >
          <MiniArea data={monthly} dataKey="movements" color="var(--chart-1)" name="Hareket" />
        </SummaryCard>

        <SummaryCard
          title="Riskli ürün"
          value={nf(riskyCount)}
          suffix="ürün"
          icon={ShieldAlert}
          change={{
            value: `${nf(risk?.summary?.critical ?? 0)} kritik`,
            label: 'acil ilgi',
            tone: (risk?.summary?.critical ?? 0) > 0 ? 'negative' : 'positive',
          }}
        >
          {riskTrend.length >= 2 ? (
            <MiniArea data={riskTrend} dataKey="risky_rate" color="var(--chart-5)" name="Riskli oran" />
          ) : (
            <p className="text-xs text-muted-foreground">
              Trend için veri birikiyor; risk skorları her gece kaydediliyor.
            </p>
          )}
        </SummaryCard>

        <SummaryCard
          title="Kullanılabilir stok"
          value={nf(available?.qty ?? 0)}
          suffix={available ? `%${nf(available.share, 1)}` : undefined}
          icon={Layers}
        >
          <AllocationBar status={overview.status_distribution} />
        </SummaryCard>
      </div>

      {/* Detay */}
      <div className="grid min-w-0 gap-3 xl:grid-cols-3">
        <PerformancePanel overview={overview} kpis={kpiReport?.kpis ?? []} />
        <WarehouseDonut warehouses={overview.warehouse_stock} />
      </div>

      {/* Alt bölüm */}
      <div className="grid min-w-0 gap-3 lg:grid-cols-3">
        <RiskTable rows={riskRows} />
        <InsightsPanel rows={riskRows} suppliers={overview.supplier_delay} />
      </div>

      {/* Ekip ve hareketler */}
      <div className="grid min-w-0 gap-3 lg:grid-cols-3">
        <DashboardCard className="flex flex-col gap-4">
          <DetailHeader title="Ekip" subtitle="Şirket kullanıcıları">
            <IconBadge icon={Users} />
          </DetailHeader>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-bold leading-none">{nf(company?.users?.total ?? 0)}</span>
            <span className="pb-0.5 text-xs text-muted-foreground">
              {nf(company?.users?.active ?? 0)} aktif
            </span>
          </div>
          {(risk?.summary?.critical ?? 0) > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-border p-3 text-sm text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--destructive)' }} />
              {nf(risk?.summary?.critical ?? 0)} üründe stok kritik seviyede.
            </div>
          )}
        </DashboardCard>

        <div className="lg:col-span-2">
          {/* Animasyon: watermelon "activities card" — başlığa tıklayınca liste açılır */}
          <ActivitiesCard
            headerIcon={<History className="h-6 w-6" />}
            title="Son hareketler"
            subtitle={activityLoading ? 'Yükleniyor…' : `${(activity ?? []).length} kayıt`}
            emptyText="Henüz hareket yok."
            defaultOpen
            activities={(activity ?? []).slice(0, 8).map(log => ({
              icon: <Activity className="h-5 w-5" />,
              title: log.description || log.action,
              desc: log.user?.name ?? 'Sistem',
              time: formatDateTime(log.created_at),
            }))}
          />
        </div>
      </div>
    </div>
  )
}
