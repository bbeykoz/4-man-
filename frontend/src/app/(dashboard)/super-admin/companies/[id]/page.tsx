'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { createColumnHelper } from '@tanstack/react-table'
import {
  Building2, Users, Layers, Shield, ChevronLeft,
  Globe, Phone, Mail, MapPin, Calendar, Crown,
} from 'lucide-react'
import { get } from '@/lib/api'
import { DataTable } from '@/components/common/DataTable'
import { StatusBadge } from '@/components/common/StatusBadge'
import { formatDate } from '@/lib/utils'
import type { User, Role, Department } from '@/types/auth.types'

// ── Column helpers ──────────────────────────────────────────
const userCol = createColumnHelper<User & { roles?: any[] }>()
const deptCol = createColumnHelper<Department>()
const roleCol = createColumnHelper<Role>()

type Tab = 'users' | 'departments' | 'roles'

export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('users')
  const [usersPage, setUsersPage] = useState(0)

  // Company info
  const { data: companyData, isLoading: companyLoading } = useQuery({
    queryKey: ['sa-company', id],
    queryFn: () => get<any>(`/admin/companies/${id}`),
  })
  const company = companyData?.data

  // Users tab
  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['sa-company-users', id, usersPage],
    queryFn: () => get<any>(`/admin/users?company_id=${id}&page=${usersPage + 1}&per_page=20`),
    enabled: tab === 'users',
  })

  // Departments tab
  const { data: deptsData, isLoading: deptsLoading } = useQuery({
    queryKey: ['sa-company-depts', id],
    queryFn: () => get<any>(`/admin/companies/${id}/departments`),
    enabled: tab === 'departments',
  })

  // Roles tab
  const { data: rolesData, isLoading: rolesLoading } = useQuery({
    queryKey: ['sa-company-roles', id],
    queryFn: () => get<any>(`/admin/companies/${id}/roles`),
    enabled: tab === 'roles',
  })

  // ── Columns ──────────────────────────────────────────────
  const userColumns = [
    userCol.accessor('name', {
      header: 'Kullanıcı',
      cell: (info) => {
        const u = info.row.original
        return (
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">{u.name?.charAt(0).toUpperCase()}</span>
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{u.name}</p>
              <p className="text-xs text-zinc-400">{u.email}</p>
            </div>
          </div>
        )
      },
    }),
    userCol.accessor('roles' as any, {
      header: 'Rol',
      cell: (info) => {
        const roles = info.getValue() as any[]
        if (!roles?.length) return <span className="text-zinc-400 text-xs">—</span>
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 text-xs font-medium">
            {roles[0]?.name}
          </span>
        )
      },
    }),
    userCol.accessor('status' as any, {
      header: 'Durum',
      cell: (info) => <StatusBadge status={info.getValue()} />,
    }),
    userCol.accessor('created_at' as any, {
      header: 'Kayıt',
      cell: (info) => <span className="text-sm text-zinc-500">{formatDate(info.getValue())}</span>,
    }),
  ]

  const deptColumns = [
    deptCol.accessor('name', {
      header: 'Departman',
      cell: (info) => {
        const d = info.row.original
        return (
          <div className="flex items-center gap-2.5">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{info.getValue()}</span>
          </div>
        )
      },
    }),
    deptCol.accessor('slug', {
      header: 'Slug',
      cell: (info) => <span className="text-xs font-mono text-zinc-400">{info.getValue()}</span>,
    }),
    deptCol.accessor('users_count' as any, {
      header: 'Üye',
      cell: (info) => <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{info.getValue() ?? 0}</span>,
    }),
    deptCol.accessor('status', {
      header: 'Durum',
      cell: (info) => <StatusBadge status={info.getValue()} />,
    }),
  ]

  const roleColumns = [
    roleCol.accessor('display_name', {
      header: 'Rol',
      cell: (info) => {
        const r = info.row.original
        return (
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
            <div>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{info.getValue()}</p>
              <p className="text-xs font-mono text-zinc-400">{r.name}</p>
            </div>
          </div>
        )
      },
    }),
    roleCol.accessor('level_label', {
      header: 'Seviye',
      cell: (info) => <span className="text-sm text-zinc-600 dark:text-zinc-400">{info.getValue()}</span>,
    }),
    roleCol.accessor('users_count' as any, {
      header: 'Kullanıcı',
      cell: (info) => <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{info.getValue() ?? 0}</span>,
    }),
    roleCol.accessor('is_system', {
      header: 'Tür',
      cell: (info) => (
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${info.getValue() ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'}`}>
          {info.getValue() ? 'Sistem' : 'Özel'}
        </span>
      ),
    }),
  ]

  if (companyLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!company) return null

  const tabs: { key: Tab; label: string; icon: React.ElementType; count?: number }[] = [
    { key: 'users', label: 'Kullanıcılar', icon: Users, count: usersData?.meta?.total },
    { key: 'departments', label: 'Departmanlar', icon: Layers, count: deptsData?.data?.length },
    { key: 'roles', label: 'Roller', icon: Shield, count: rolesData?.data?.length },
  ]

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button
        onClick={() => router.push('/super-admin/companies')}
        className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        Şirketler
      </button>

      {/* Company Header Card */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-xl bg-blue-50 dark:bg-blue-950 flex items-center justify-center flex-shrink-0">
            <Building2 className="h-7 w-7 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">{company.name}</h1>
              <StatusBadge status={company.status} label={company.status_label} />
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                {company.plan_label}
              </span>
            </div>
            {company.domain && (
              <p className="text-sm text-zinc-400 mt-0.5">{company.domain}</p>
            )}

            <div className="flex flex-wrap gap-4 mt-3">
              {company.email && (
                <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                  <Mail className="h-3.5 w-3.5" />
                  {company.email}
                </div>
              )}
              {company.phone && (
                <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                  <Phone className="h-3.5 w-3.5" />
                  {company.phone}
                </div>
              )}
              {company.address && (
                <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                  <MapPin className="h-3.5 w-3.5" />
                  {company.address}
                </div>
              )}
              <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                <Calendar className="h-3.5 w-3.5" />
                {formatDate(company.created_at)}
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="flex gap-6 flex-shrink-0">
            <div className="text-center">
              <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{company.max_users}</p>
              <p className="text-xs text-zinc-400 mt-0.5">Max Kullanıcı</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{company.max_departments}</p>
              <p className="text-xs text-zinc-400 mt-0.5">Max Departman</p>
            </div>
          </div>
        </div>

        {/* Owner */}
        {company.owner && (
          <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center gap-2">
            <Crown className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-xs text-zinc-500">Şirket Sahibi:</span>
            <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{company.owner.name}</span>
            <span className="text-xs text-zinc-400">({company.owner.email})</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <div className="flex border-b border-zinc-200 dark:border-zinc-800">
          {tabs.map(({ key, label, icon: Icon, count }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium border-b-2 transition-colors ${
                tab === key
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
              {count !== undefined && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab === key ? 'bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'}`}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="p-4">
          {tab === 'users' && (
            <DataTable
              columns={userColumns}
              data={usersData?.data ?? []}
              total={usersData?.meta?.total ?? 0}
              pageIndex={usersPage}
              onPaginationChange={(s) => setUsersPage(s.pageIndex)}
              isLoading={usersLoading}
              emptyMessage="Bu şirkete ait kullanıcı yok."
            />
          )}

          {tab === 'departments' && (
            <DataTable
              columns={deptColumns}
              data={deptsData?.data ?? []}
              total={deptsData?.data?.length ?? 0}
              pageIndex={0}
              onPaginationChange={() => {}}
              isLoading={deptsLoading}
              emptyMessage="Bu şirkete ait departman yok."
            />
          )}

          {tab === 'roles' && (
            <DataTable
              columns={roleColumns}
              data={rolesData?.data ?? []}
              total={rolesData?.data?.length ?? 0}
              pageIndex={0}
              onPaginationChange={() => {}}
              isLoading={rolesLoading}
              emptyMessage="Bu şirkete ait rol yok."
            />
          )}
        </div>
      </div>
    </div>
  )
}
