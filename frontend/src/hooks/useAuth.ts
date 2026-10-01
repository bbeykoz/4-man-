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
      const res = await post<{
        success: boolean
        data?: {
          token: string
          user: any
          permissions: string[]
          role_level: number
          is_super?: boolean
          is_platform?: boolean
        }
        requires_2fa?: boolean
        requires_2fa_setup?: boolean
        user_id?: string
        message?: string
      }>('/auth/login', { email, password }).catch((error) => {
        throw error || new Error('Giriş başarısız.')
      })

      const payload = res ?? {}

      if (payload.requires_2fa) {
        return { requires2fa: true, requires2faSetup: false, userId: payload.user_id }
      }

      if (payload.requires_2fa_setup) {
        return { requires2fa: false, requires2faSetup: true, userId: payload.user_id }
      }

      if (!payload.data || !payload.data.token || !payload.data.user) {
        throw new Error(payload.message ?? 'Giriş yanıtı geçersiz.')
      }

      store.setAuth(payload.data)
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
    const res = await post<{
      success: boolean
      data: {
        user: any
        permissions: string[]
        role_level: number
        is_super?: boolean
        is_platform?: boolean
      }
    }>('/auth/me')

    // Şirkete bağlanıldığında jeton değişir; kullanıcı, izinler ve seviye yeniden alınır
    store.setAuth({
      token: useAuthStore.getState().token ?? '',
      user: res.data.user,
      permissions: res.data.permissions,
      role_level: res.data.role_level,
      is_super: res.data.is_super,
      is_platform: res.data.is_platform,
    })
    return res.data.user
  }, [store])

  /** Şirkete bağlan: kendi oturumumuzu saklayıp o şirketin sahibi olarak devam ederiz. */
  const impersonateCompany = useCallback(
    async (companyId: string) => {
      const state = useAuthStore.getState()
      const res = await post<{
        success: boolean
        message: string
        data: {
          token: string
          user: any
          company: { id: string; name: string }
          expires_at: string
        }
      }>(`/admin/companies/${companyId}/impersonate`)

      store.startImpersonation({
        companyId: res.data.company.id,
        companyName: res.data.company.name,
        asUserName: res.data.user?.name ?? '',
        originalToken: state.token ?? '',
        originalPermissions: state.permissions,
        originalRoleLevel: state.roleLevel,
        originalIsSuper: state.isSuper,
        originalIsPlatform: state.isPlatform,
        expiresAt: res.data.expires_at,
      })

      store.setAuth({
        token: res.data.token,
        user: res.data.user,
        permissions: [],
        role_level: 2,
        is_super: false,
        is_platform: false,
      })

      queryClient.clear()
      return res.data.company
    },
    [store, queryClient]
  )

  /** Kendi hesabımıza dön. */
  const stopImpersonation = useCallback(async () => {
    store.stopImpersonation()
    queryClient.clear()
    await refreshMe().catch(() => {})
    router.push('/super-admin/dashboard')
  }, [store, queryClient, refreshMe, router])

  return {
    user: store.user,
    company: store.company,
    token: store.token,
    isAuthenticated: !!store.token,
    isSuperAdmin: store.isSuperAdmin,
    isPlatformUser: store.isPlatformUser,
    impersonation: store.impersonation,
    isCompanyOwner: store.isCompanyOwner,
    isDepartmentManager: store.isDepartmentManager,
    hasPermission: store.hasPermission,
    hasAnyPermission: store.hasAnyPermission,
    login,
    logout,
    refreshMe,
    impersonateCompany,
    stopImpersonation,
  }
}
