'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'
import { ROLE_LEVELS } from '@/lib/constants'

export default function HomePage() {
  const { token, roleLevel } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    if (!token) {
      router.replace('/login')
      return
    }
    if (roleLevel === ROLE_LEVELS.SUPER_ADMIN) {
      router.replace('/super-admin/dashboard')
    } else {
      router.replace('/company/dashboard')
    }
  }, [token, roleLevel, router])

  return (
    <div className="flex h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 animate-pulse" />
        <p className="text-sm text-zinc-500">Yükleniyor...</p>
      </div>
    </div>
  )
}
