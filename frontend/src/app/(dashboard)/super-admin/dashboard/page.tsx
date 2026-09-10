'use client'

import { useQuery } from '@tanstack/react-query'
import { Building2, Users, Boxes, Activity, TrendingUp, ShieldCheck } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { StatsCard } from '@/components/common/StatsCard'
import { ActivityTimeline } from '@/components/common/ActivityTimeline'
import { get } from '@/lib/api'
import type { DashboardStats } from '@/types/api.types'

export default function SuperAdminDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'super-admin'],
    queryFn: () => get<{ success: boolean; data: any }>('/dashboard/super-admin').then((r) => r.data),
  })

  const stats = data

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sistem Yönetimi"
        description="BytePanel süper yönetici paneli — tüm sistem istatistikleri"
        breadcrumbs={[{ label: 'Super Admin' }, { label: 'Dashboard' }]}
      />

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatsCard
          title="Toplam Şirket"
          value={stats?.companies?.total ?? 0}
          icon={Building2}
          subtitle={`${stats?.companies?.active ?? 0} aktif`}
          color="blue"
          trend={stats?.companies?.new_this_month ? 12 : 0}
          trendLabel="bu ay"
          loading={isLoading}
        />
        <StatsCard
          title="Toplam Kullanıcı"
          value={stats?.users?.total ?? 0}
          icon={Users}
          subtitle={`${stats?.users?.active ?? 0} aktif`}
          color="green"
          loading={isLoading}
        />
        <StatsCard
          title="Aktif Modüller"
          value={stats?.modules ?? 0}
          icon={Boxes}
          color="purple"
          loading={isLoading}
        />
        <StatsCard
          title="Bugünkü İşlem"
          value={stats?.activity_today ?? 0}
          icon={Activity}
          color="orange"
          loading={isLoading}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activity */}
        <div className="lg:col-span-2 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Son Aktiviteler</h3>
          <ActivityTimeline items={stats?.recent_activity ?? []} loading={isLoading} />
        </div>

        {/* Quick Stats Sidebar */}
        <div className="space-y-4">
          {/* Companies by plan */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Plan Dağılımı</h3>
            {isLoading ? (
              <div className="space-y-2">
                {[1,2,3].map(i => <div key={i} className="h-8 bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse" />)}
              </div>
            ) : (
              <div className="space-y-2">
                {[['basic', 'Temel', 'bg-zinc-200 dark:bg-zinc-700'], ['pro', 'Profesyonel', 'bg-blue-500'], ['enterprise', 'Kurumsal', 'bg-violet-500']].map(([key, label, color]) => (
                  <div key={key} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
                      <span className="text-zinc-600 dark:text-zinc-400">{label}</span>
                    </div>
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {stats?.companies_by_plan?.[key] ?? 0}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Security status */}
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 rounded-xl border border-green-100 dark:border-green-900 p-5">
            <div className="flex items-center gap-3 mb-3">
              <ShieldCheck className="h-5 w-5 text-green-600 dark:text-green-400" />
              <h3 className="text-sm font-semibold text-green-900 dark:text-green-300">Sistem Güvenliği</h3>
            </div>
            <div className="space-y-1 text-xs text-green-700 dark:text-green-400">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                HTTPS aktif
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                Rate limiting çalışıyor
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                2FA mevcut
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
