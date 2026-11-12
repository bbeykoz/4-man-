'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createColumnHelper } from '@tanstack/react-table'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable } from '@/components/common/DataTable'
import { FilterBar } from '@/components/common/FilterBar'
import { get } from '@/lib/api'
import { cn, formatDateTime, timeAgo } from '@/lib/utils'
import { IncidentsPanel } from '@/components/platform/IncidentsPanel'
import type { ActivityLog } from '@/types/api.types'

type Sekme = 'olaylar' | 'aktivite'

const col = createColumnHelper<ActivityLog & { company?: { name: string } }>()

export default function SuperAdminLogsPage() {
  // Varsayilan sekme olaylar: sirketlerde takilan isi gormek icin aciliyor.
  const [sekme, setSekme] = useState<Sekme>('olaylar')
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Record<string, string>>({})

  const { data, isLoading } = useQuery({
    queryKey: ['sa-logs', page, search, filters],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page + 1),
        per_page: '25',
        ...(search && { action: search }),
        ...filters,
      })
      return get<any>(`/admin/logs?${params}`)
    },
    enabled: sekme === 'aktivite',
  })

  const columns = [
    col.accessor('user' as any, {
      header: 'Kullanıcı',
      cell: (info) => {
        const u = info.getValue() as any
        return u ? (
          <div className="flex items-center gap-2">
            <img src={u.avatar_url} alt={u.name} className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{u.name}</p>
              <p className="text-xs text-zinc-400">{u.email}</p>
            </div>
          </div>
        ) : (
          <span className="text-zinc-400 text-sm">Sistem</span>
        )
      },
    }),
    col.accessor('company' as any, {
      header: 'Şirket',
      cell: (info) => {
        const c = info.getValue() as any
        return c ? (
          <span className="text-sm text-zinc-600 dark:text-zinc-400">{c.name}</span>
        ) : (
          <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded font-medium">
            Sistem
          </span>
        )
      },
    }),
    col.accessor('description', {
      header: 'İşlem',
      cell: (info) => (
        <div>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">{info.getValue() ?? info.row.original.action}</p>
          {info.row.original.model_type && (
            <p className="text-xs text-zinc-400">{info.row.original.model_type}</p>
          )}
        </div>
      ),
    }),
    col.accessor('ip_address', {
      header: 'IP',
      cell: (info) => <span className="text-xs font-mono text-zinc-500">{info.getValue()}</span>,
    }),
    col.accessor('created_at', {
      header: 'Zaman',
      cell: (info) => (
        <div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{formatDateTime(info.getValue())}</p>
          <p className="text-xs text-zinc-400">{timeAgo(info.getValue())}</p>
        </div>
      ),
    }),
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Sistem Logları"
        description="Şirketlerde oluşan hatalar ve tüm şirketlere ait aktivite logları"
        breadcrumbs={[{ label: 'Süper Admin' }, { label: 'Loglar' }]}
      />

      <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
        {([['olaylar', 'Hatalar ve sorunlar'], ['aktivite', 'Aktivite logu']] as [Sekme, string][]).map(([id, etiket]) => (
          <button
            key={id}
            onClick={() => setSekme(id)}
            className={cn(
              '-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              sekme === id
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200',
            )}
          >
            {etiket}
          </button>
        ))}
      </div>

      {sekme === 'olaylar' && <IncidentsPanel />}

      {sekme === 'aktivite' && (
      <>
      <FilterBar
        placeholder="İşlem tipinde ara..."
        onSearch={setSearch}
        onFilterChange={setFilters}
        filters={[
          {
            key: 'company_id',
            label: 'Şirket',
            options: [],
          },
        ]}
      />

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        total={data?.meta?.total ?? 0}
        pageIndex={page}
        onPaginationChange={(s) => setPage(s.pageIndex)}
        isLoading={isLoading}
        emptyMessage="Log kaydı bulunamadı."
      />
      </>
      )}
    </div>
  )
}
