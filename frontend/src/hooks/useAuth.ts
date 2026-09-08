'use client'

import { useAuthStore } from '@/store/auth.store'
import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { post } from '@/lib/api'
import { useQueryClient } from '@tanstack/react-query'

export function useAuth() {
  const store = useAuthStore()
  const router = useRouter()
  const queryClient = useQueryClient()

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await post<{ success: boolean; data: any; requires_2fa?: boolean; requires_2fa_setup?: boolean; user_id?: string }>(
        '/auth/login',
        { email, password }
      )

      if (res.requires_2fa) {
        return { requires2fa: true, requires2faSetup: false, userId: res.user_id }
      }

      if (res.requires_2fa_setup) {
        return { requires2fa: false, requires2faSetup: true, userId: res.user_id }
      }

      store.setAuth(res.data)
      return { requires2fa: false, requires2faSetup: false }
    },
    [store]
  )

  const logout = useCallback(async () => {
    try {
      await post('/auth/logout')
    } catch {
      // ignore
    }
    store.logout()
    queryClient.clear()
    router.push('/login')
  }, [store, router, queryClient])

  const refreshMe = useCallback(async () => {
    const res = await post<{ success: boolean; data: { user: any; permissions: string[]; role_level: number } }>(
      '/auth/me'
    )
    store.setUser(res.data.user)
    return res.data.user
  }, [store])

  return {
    user: store.user,
    company: store.company,
    token: store.token,
    isAuthenticated: !!store.token,
    isSuperAdmin: store.isSuperAdmin,
    isCompanyOwner: store.isCompanyOwner,
    isDepartmentManager: store.isDepartmentManager,
    hasPermission: store.hasPermission,
    hasAnyPermission: store.hasAnyPermission,
    login,
    logout,
    refreshMe,
  }
}
