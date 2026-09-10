'use client'

import { useQuery } from '@tanstack/react-query'
import {
  Users, Building2, Activity, TrendingUp, TrendingDown,
  DollarSign, Megaphone, BarChart2, AlertCircle, Warehouse,
  ArrowDownToLine, ArrowUpFromLine, Truck, Globe, Package,
  RotateCcw, Clock, CheckCircle2, UserCheck,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, AreaChart, Area,
} from 'recharts'
import { PageHeader } from '@/components/common/PageHeader'
import { StatsCard } from '@/components/common/StatsCard'
import { ActivityTimeline } from '@/components/common/ActivityTimeline'
import { get } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M ₺`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K ₺`
  return `${n.toLocaleString('tr-TR')} ₺`
}
function fmtQty(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString('tr-TR')
}

const DEPT_COLORS = [
  '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b',
  '#ef4444', '#ec4899', '#06b6d4', '#84cc16',
]

const MODULE_META: Record<string, { label: string; color: string }> = {
  Muhasebe:   { label: 'Muhasebe',   color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400' },
  Depo:       { label: 'Depo',       color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400' },
  Nakliye:    { label: 'Nakliye',    color: 'text-sky-600 bg-sky-50 dark:bg-sky-900/20 dark:text-sky-400' },
  Marketing:  { label: 'Marketing',  color: 'text-pink-600 bg-pink-50 dark:bg-pink-900/20 dark:text-pink-400' },
  Paketleme:  { label: 'Paketleme',  color: 'text-teal-600 bg-teal-50 dark:bg-teal-900/20 dark:text-teal-400' },
  'İade':     { label: 'İade',       color: 'text-orange-600 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-400' },
  Gümrükleme: { label: 'Gümrükleme', color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 dark:text-indigo-400' },
}

// ─── Small helper components ──────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse ${className}`} />
}

function PnLRow({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className={`text-sm font-semibold ${
        positive === undefined
          ? 'text-zinc-700 dark:text-zinc-300'
          : positive
          ? 'text-emerald-600 dark:text-emerald-400'
          : 'text-red-600 dark:text-red-400'
      }`}>{value}</span>
    </div>
  )
}

function CardHeader({ icon: Icon, title, iconClass }: { icon: any; title: string; iconClass?: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon className={`h-4 w-4 ${iconClass ?? 'text-zinc-500'}`} />
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
    </div>
  )
}

// ─── Operations Card ──────────────────────────────────────────────────────────

interface OpCardProps {
  icon: any
  label: string
  iconCls: string
  rows: { label: string; value: number | string; badge?: string }[]
  loading?: boolean
}
function OpCard({ icon: Icon, label, iconCls, rows, loading }: OpCardProps) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className={`p-1.5 rounded-lg ${iconCls}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{label}</span>
      </div>
      {loading ? (
        <div className="space-y-2">{[1, 2].map(i => <Skeleton key={i} className="h-5" />)}</div>
      ) : (
        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="flex justify-between items-center">
              <span className="text-xs text-zinc-500">{row.label}</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                Number(row.value) > 0
                  ? row.badge ?? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                  : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800'
              }`}>
                {row.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CompanyDashboard() {
  const { company } = useAuthStore()

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'company'],
    queryFn: () => get<{ success: boolean; data: any }>('/dashboard/company').then((r) => r.data),
  })

  const { data: activityData, isLoading: activityLoading } = useQuery({
    queryKey: ['dashboard', 'company', 'activity'],
    queryFn: () => get<{ success: boolean; data: any[] }>('/dashboard/activity').then((r) => r.data ?? []),
    refetchInterval: 30_000,
  })

  const finance     = data?.finance ?? {}
  const marketing   = data?.marketing ?? {}
  const warehouse   = data?.warehouse ?? {}
  const shipping    = data?.shipping ?? {}
  const returns_    = data?.returns ?? {}
  const packaging   = data?.packaging ?? {}
  const customs     = data?.customs ?? {}
  const deptUsers: { name: string; color: string; count: number }[] = data?.dept_users ?? []
  const monthlyChart: { month: string; income: number; expense: number; profit: number }[] = finance.monthly_chart ?? []
  const pendingByModule: Record<string, number> = data?.pending_by_module ?? {}

  const monthlyProfitPos = (finance.monthly_profit ?? 0) >= 0
  const dailyProfitPos   = (finance.daily_profit ?? 0) >= 0

  return (
    <div className="space-y-6">
      <PageHeader
        title={company?.name ?? 'Dashboard'}
        description="Şirket genel durumu ve operasyonel istatistikler"
        breadcrumbs={[{ label: 'Şirket' }, { label: 'Dashboard' }]}
      />

      {/* ── KPI Row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatsCard
          title="Toplam Kullanıcı"
          value={data?.users?.total ?? 0}
          icon={Users}
          color="blue"
          subtitle={`${data?.users?.active ?? 0} aktif`}
          loading={isLoading}
        />
        <StatsCard
          title="Bugün Aktif"
          value={data?.users_online_today ?? 0}
          icon={UserCheck}
          color="green"
          subtitle="Giriş yaptı"
          loading={isLoading}
        />
        <StatsCard
          title="Departman"
          value={data?.departments ?? 0}
          icon={Building2}
          color="purple"
          loading={isLoading}
        />
        <StatsCard
          title="Bekleyen Görev"
          value={data?.pending_tasks ?? 0}
          icon={AlertCircle}
          color="orange"
          subtitle="Tüm modüller"
          loading={isLoading}
        />
        <StatsCard
          title="Aylık Net Kar"
          value={isLoading ? '—' : fmt(finance.monthly_profit ?? 0)}
          icon={monthlyProfitPos ? TrendingUp : TrendingDown}
          color={monthlyProfitPos ? 'green' : 'red'}
          subtitle="Bu ay"
          loading={isLoading}
        />
        <StatsCard
          title="Günlük Net"
          value={isLoading ? '—' : fmt(finance.daily_profit ?? 0)}
          icon={DollarSign}
          color={dailyProfitPos ? 'teal' : 'red'}
          subtitle="Bugün"
          loading={isLoading}
        />
      </div>

      {/* ── Finance Section ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* 6-Month Chart */}
        <div className="lg:col-span-2 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
          <CardHeader icon={BarChart2} title="Son 6 Ay Gelir / Gider / Kar" />
          {isLoading ? (
            <Skeleton className="h-64" />
          ) : (
            <ResponsiveContainer width="100%" height={256}>
              <AreaChart data={monthlyChart} barGap={4} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gIncome" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gExpense" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v} />
                <Tooltip
                  formatter={(value, name) => [fmt(Number(value)), name === 'income' ? 'Gelir' : name === 'expense' ? 'Gider' : 'Kar']}
                  contentStyle={{ fontSize: 12 }}
                />
                <Legend formatter={(v) => v === 'income' ? 'Gelir' : v === 'expense' ? 'Gider' : 'Kar'} wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="income" stroke="#10b981" strokeWidth={2} fill="url(#gIncome)" dot={{ r: 3 }} />
                <Area type="monotone" dataKey="expense" stroke="#ef4444" strokeWidth={2} fill="url(#gExpense)" dot={{ r: 3 }} />
                <Area type="monotone" dataKey="profit" stroke="#3b82f6" strokeWidth={2} fill="url(#gProfit)" dot={{ r: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* P&L Stack */}
        <div className="space-y-4">
          {/* Daily */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
            <CardHeader icon={DollarSign} title="Günlük Gelir / Gider" />
            {isLoading ? (
              <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-7" />)}</div>
            ) : (
              <div className="space-y-2">
                <PnLRow label="Gelir" value={fmt(finance.daily_income ?? 0)} positive={true} />
                <PnLRow label="Gider" value={fmt(finance.daily_expense ?? 0)} positive={false} />
                <div className="h-px bg-zinc-100 dark:bg-zinc-800" />
                <PnLRow label="Net" value={`${dailyProfitPos ? '+' : ''}${fmt(finance.daily_profit ?? 0)}`} positive={dailyProfitPos} />
              </div>
            )}
          </div>

          {/* Monthly */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
            <CardHeader icon={BarChart2} title="Aylık Kar / Zarar" />
            {isLoading ? (
              <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-7" />)}</div>
            ) : (
              <div className="space-y-2">
                <PnLRow label="Gelir" value={fmt(finance.monthly_income ?? 0)} positive={true} />
                <PnLRow label="Gider" value={fmt(finance.monthly_expense ?? 0)} positive={false} />
                <div className="h-px bg-zinc-100 dark:bg-zinc-800" />
                <PnLRow label="Net Kar" value={`${monthlyProfitPos ? '+' : ''}${fmt(finance.monthly_profit ?? 0)}`} positive={monthlyProfitPos} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Operations Row ── */}
      <div>
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Operasyonel Durum</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <OpCard
            icon={Truck}
            label="Nakliye"
            iconCls="bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400"
            loading={isLoading}
            rows={[
              { label: 'Bekliyor', value: shipping.pending ?? 0 },
              { label: 'Yolda', value: shipping.in_transit ?? 0, badge: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' },
              { label: 'Bugün Oluşan', value: shipping.today ?? 0, badge: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800' },
            ]}
          />
          <OpCard
            icon={Globe}
            label="Gümrükleme"
            iconCls="bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400"
            loading={isLoading}
            rows={[
              { label: 'İncelemede', value: customs.in_review ?? 0, badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
              { label: 'Aktif Beyan', value: customs.pending ?? 0 },
              { label: 'Toplam Beyan', value: customs.total ?? 0, badge: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800' },
            ]}
          />
          <OpCard
            icon={Package}
            label="Paketleme"
            iconCls="bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400"
            loading={isLoading}
            rows={[
              { label: 'Bekliyor / İşlemde', value: packaging.active ?? 0, badge: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400' },
              { label: 'Bu ay tamamlanan', value: packaging.completed_month ?? 0, badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
            ]}
          />
          <OpCard
            icon={RotateCcw}
            label="İade"
            iconCls="bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
            loading={isLoading}
            rows={[
              { label: 'Bekliyor', value: returns_.pending ?? 0 },
              { label: 'İnceleniyor', value: returns_.in_progress ?? 0, badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
              { label: 'Toplam', value: returns_.total ?? 0, badge: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800' },
            ]}
          />
        </div>
      </div>

      {/* ── Bottom Row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Pending by Module */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
          <CardHeader icon={AlertCircle} title="Bekleyen Kayıtlar" iconClass="text-orange-500" />
          {isLoading ? (
            <div className="space-y-2">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-8" />)}</div>
          ) : (
            <div className="space-y-1.5">
              {Object.entries(pendingByModule).map(([mod, count]) => {
                const meta = MODULE_META[mod]
                return (
                  <div key={mod} className="flex items-center justify-between py-1 px-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                    <span className="text-xs text-zinc-600 dark:text-zinc-400">{meta?.label ?? mod}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      Number(count) > 0
                        ? meta?.color ?? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                        : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800'
                    }`}>
                      {String(count)}
                    </span>
                  </div>
                )
              })}
              <div className="pt-2 mt-1 border-t border-zinc-100 dark:border-zinc-800 flex justify-between items-center">
                <span className="text-xs font-medium text-zinc-500">Toplam Bekleyen</span>
                <span className={`text-sm font-bold ${(data?.pending_tasks ?? 0) > 0 ? 'text-orange-600' : 'text-zinc-400'}`}>
                  {data?.pending_tasks ?? 0}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Marketing + Warehouse stacked */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
            <CardHeader icon={Megaphone} title="Marketing Bütçesi" iconClass="text-pink-500" />
            {isLoading ? (
              <div className="space-y-2"><Skeleton className="h-8" /><Skeleton className="h-5" /></div>
            ) : (
              <div>
                <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-1">{fmt(marketing.monthly_budget ?? 0)}</p>
                <p className="text-xs text-zinc-500">{marketing.campaign_count ?? 0} kampanya (bu ay)</p>
                <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex justify-between">
                  <span className="text-xs text-zinc-500">Bekleyen</span>
                  <span className={`text-xs font-semibold ${(pendingByModule['Marketing'] ?? 0) > 0 ? 'text-orange-500' : 'text-zinc-400'}`}>
                    {pendingByModule['Marketing'] ?? 0} kayıt
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
            <CardHeader icon={Warehouse} title="Depo Hareketleri" iconClass="text-blue-500" />
            {isLoading ? (
              <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-6" />)}</div>
            ) : (
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-1 text-xs text-zinc-500">
                    <ArrowDownToLine className="h-3 w-3 text-emerald-500" /> Giren stok
                  </span>
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{fmtQty(warehouse.stock_in_qty ?? 0)} adet</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-1 text-xs text-zinc-500">
                    <ArrowUpFromLine className="h-3 w-3 text-red-500" /> Çıkan stok
                  </span>
                  <span className="text-xs font-semibold text-red-600 dark:text-red-400">{fmtQty(warehouse.stock_out_qty ?? 0)} adet</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-zinc-500">Bekleyen</span>
                  <span className={`text-xs font-semibold ${(pendingByModule['Depo'] ?? 0) > 0 ? 'text-orange-500' : 'text-zinc-400'}`}>
                    {pendingByModule['Depo'] ?? 0} kayıt
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Department Distribution */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
          <CardHeader icon={Users} title="Departman Dağılımı" />
          {isLoading ? (
            <div className="space-y-3">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-8" />)}</div>
          ) : deptUsers.length === 0 ? (
            <p className="text-xs text-zinc-400 text-center py-4">Departman bulunamadı</p>
          ) : (
            <div className="space-y-3">
              {deptUsers.map((dept, idx) => {
                const max = Math.max(...deptUsers.map(d => d.count), 1)
                const pct = Math.round((dept.count / max) * 100)
                const color = dept.color ? `#${dept.color.replace('#', '')}` : DEPT_COLORS[idx % DEPT_COLORS.length]
                return (
                  <div key={dept.name}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-zinc-600 dark:text-zinc-400 truncate">{dept.name}</span>
                      <span className="text-zinc-900 dark:text-zinc-100 font-medium ml-2">{dept.count} kişi</span>
                    </div>
                    <div className="h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                    </div>
                  </div>
                )
              })}
              <div className="pt-2 mt-1 border-t border-zinc-100 dark:border-zinc-800 flex justify-between text-xs">
                <span className="text-zinc-500">Toplam kullanıcı</span>
                <span className="font-semibold text-zinc-700 dark:text-zinc-300">{data?.users?.total ?? 0}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Activity Feed ── */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-zinc-500" />
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Son Aktiviteler</h3>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-zinc-400">Canlı</span>
          </div>
        </div>
        <ActivityTimeline items={activityData ?? []} loading={activityLoading} />
      </div>
    </div>
  )
}
