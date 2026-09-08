'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createColumnHelper } from '@tanstack/react-table'
import { FileText } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable } from '@/components/common/DataTable'
import { FilterBar } from '@/components/common/FilterBar'
import { get } from '@/lib/api'
import { formatDateTime, timeAgo } from '@/lib/utils'
import type { ActivityLog } from '@/types/api.types'

const col = createColumnHelper<ActivityLog>()

const columns = [
  col.accessor('user', {
    header: 'Kullanıcı',
    cell: (info) => {
      const u = info.getValue()
      return u ? (
        <div className="flex items-center gap-2">
          <img src={u.avatar_url} alt={u.name} className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{u.name}</p>
            <p className="text-xs text-zinc-400">{u.email}</p>
          </div>
        </div>
      ) : <span className="text-zinc-400 text-sm">Sistem</span>
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

export default function ActivityLogsPage() {
  const [page, setPage]     = useState(0)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Record<string, string>>({})

  const { data, isLoading } = useQuery({
    queryKey: ['activity-logs', page, search, filters],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page + 1), per_page: '20', ...(search && { action: search }), ...filters })
      return get<any>(`/activity-logs?${params}`)
    },
  })

  return (
    <div className="space-y-5">
      <PageHeader
        title="Aktivite Logları"
        description="Sistem içi tüm kullanıcı işlemleri"
        breadcrumbs={[{ label: 'Aktivite Logları' }]}
      />

      <FilterBar
        placeholder="İşlem tipinde ara..."
        onSearch={setSearch}
        onFilterChange={setFilters}
        filters={[
          { key: 'date_from', label: 'Başlangıç', options: [] },
        ]}
      />

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        total={data?.meta?.total ?? 0}
        pageIndex={page}
        onPaginationChange={(s) => setPage(s.pageIndex)}
        isLoading={isLoading}
        emptyMessage="Aktivite kaydı bulunamadı."
      />
    </div>
  )
}
