'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Ban, AlertTriangle } from 'lucide-react'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import { CopilotWidget } from '@/components/copilot/CopilotWidget'
import { useAuthStore } from '@/store/auth.store'
import { useModuleStatus } from '@/hooks/useModuleStatus'
import { getModuleSlugForPath, ROLE_LEVELS } from '@/lib/constants'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { token, _hasHydrated, roleLevel } = useAuthStore()
  const router = useRouter()
  const pathname = usePathname()
  const { isPassive, getName } = useModuleStatus()

  useEffect(() => {
    if (_hasHydrated && !token) {
      router.replace('/login')
    }
  }, [_hasHydrated, token, router])

  if (!_hasHydrated) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!token) return null

  const moduleSlug = getModuleSlugForPath(pathname)
  const passive    = isPassive(moduleSlug)
  const superAdmin = roleLevel === ROLE_LEVELS.SUPER_ADMIN

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-50 dark:bg-zinc-900">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Topbar />
        <main className="flex-1 overflow-y-auto">
          <div className="p-6">
            {passive && !superAdmin ? (
              <DepartmentPassive name={getName(moduleSlug!)} />
            ) : (
              <>
                {passive && (
                  <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                    Bu departman pasif. Şirket kullanıcıları erişemez; yalnızca süper admin görüntüleyebilir.
                  </div>
                )}
                {children}
              </>
            )}
          </div>
        </main>
      </div>
      <CopilotWidget />
    </div>
  )
}

function DepartmentPassive({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-24">
      <div className="w-14 h-14 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center mb-4">
        <Ban className="h-6 w-6 text-zinc-500" />
      </div>
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{name} departmanı pasif</h2>
      <p className="mt-1 max-w-md text-sm text-zinc-500">
        Bu departman sistem yöneticisi tarafından pasife alınmıştır. Tekrar aktifleştirilene kadar erişilemez.
      </p>
      <Link
        href="/company/dashboard"
        className="mt-6 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
      >
        Ana sayfaya dön
      </Link>
    </div>
  )
}
