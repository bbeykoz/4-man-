'use client'

import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { get } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'

interface ModuleStatus {
  slug: string
  name: string
  is_active: boolean
}

/**
 * Departmanların sistem genelindeki aktif/pasif durumu.
 * Süper admin bir departmanı pasife aldığında açık paneller 30 sn içinde güncellenir.
 */
export function useModuleStatus() {
  const token = useAuthStore((s) => s.token)

  const { data, isLoading } = useQuery({
    queryKey: ['module-status'],
    queryFn: () => get<{ success: boolean; data: ModuleStatus[] }>('/modules/status').then((r) => r.data ?? []),
    enabled: !!token,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })

  const modules = useMemo(() => data ?? [], [data])

  const isPassive = useCallback(
    (slug: string | null | undefined) => !!slug && modules.some((m) => m.slug === slug && !m.is_active),
    [modules],
  )

  const getName = useCallback(
    (slug: string) => modules.find((m) => m.slug === slug)?.name ?? slug,
    [modules],
  )

  return { modules, isLoading, isPassive, getName }
}
