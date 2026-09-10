'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { PageHeader } from '@/components/common/PageHeader'
import { get, patch } from '@/lib/api'
import {
  Calculator, Megaphone, Package, PackageCheck, PackageOpen,
  RotateCcw, Truck, FileCheck, ToggleLeft, ToggleRight
} from 'lucide-react'

const MODULE_ICONS: Record<string, any> = {
  accounting: Calculator,
  marketing: Megaphone,
  warehouse_manager: Package,
  warehouse_controller: PackageCheck,
  packaging: PackageOpen,
  returns: RotateCcw,
  customs: FileCheck,
  shipping: Truck,
}

const MODULE_COLORS: Record<string, string> = {
  accounting: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  marketing: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  warehouse_manager: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  warehouse_controller: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  packaging: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  returns: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  customs: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  shipping: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
}

interface CompanyModule {
  id: string
  name: string
  slug: string
  description: string
  is_active: boolean
  records_count: number
  activated_at: string | null
}

export default function CompanyModulesPage() {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['company-modules'],
    queryFn: () => get<any>('/company/modules'),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      patch(`/company/modules/${id}`, { is_active: active }),
    onSuccess: () => {
      toast.success('Modül güncellendi.')
      qc.invalidateQueries({ queryKey: ['company-modules'] })
    },
    onError: (e: any) => toast.error(e?.message),
  })

  const modules: CompanyModule[] = data?.data ?? []

  return (
    <div className="space-y-5">
      <PageHeader
        title="Modül Yönetimi"
        description="Şirketiniz için aktif modülleri yönetin"
        breadcrumbs={[{ label: 'Şirket' }, { label: 'Modüller' }]}
      />

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-40 bg-zinc-200 dark:bg-zinc-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {modules.map((mod) => {
            const Icon = MODULE_ICONS[mod.slug] ?? Package
            const colorClass = MODULE_COLORS[mod.slug] ?? 'bg-zinc-100 text-zinc-700'
            return (
              <div
                key={mod.id}
                className={`bg-white dark:bg-zinc-900 rounded-xl border transition-all ${
                  mod.is_active
                    ? 'border-zinc-200 dark:border-zinc-800'
                    : 'border-zinc-200 dark:border-zinc-800 opacity-60'
                }`}
              >
                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colorClass}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <button
                      onClick={() => toggleMutation.mutate({ id: mod.id, active: !mod.is_active })}
                      disabled={toggleMutation.isPending}
                      className="transition-colors"
                    >
                      {mod.is_active ? (
                        <ToggleRight className="h-7 w-7 text-blue-500" />
                      ) : (
                        <ToggleLeft className="h-7 w-7 text-zinc-400" />
                      )}
                    </button>
                  </div>
                  <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-1">{mod.name}</h3>
                  <p className="text-xs text-zinc-500 line-clamp-2 mb-3">{mod.description}</p>
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      mod.is_active
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500'
                    }`}>
                      {mod.is_active ? 'Aktif' : 'Pasif'}
                    </span>
                    <span className="text-xs text-zinc-400">{mod.records_count} kayıt</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
