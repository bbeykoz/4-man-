'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, Company, AuthState } from '@/types/auth.types'
import { ROLE_LEVELS } from '@/lib/constants'

/** Şirkete bağlanıldığında kendi oturumumuz burada saklanır, dönüşte geri yüklenir. */
export interface ImpersonationState {
  companyId: string
  companyName: string
  asUserName: string
  originalToken: string
  originalPermissions: string[]
  originalRoleLevel: number
  originalIsSuper: boolean
  originalIsPlatform: boolean
  expiresAt: string
}

interface AuthStore extends AuthState {
  _hasHydrated: boolean
  isSuper: boolean
  isPlatform: boolean
  impersonation: ImpersonationState | null
  setHasHydrated: (val: boolean) => void
  setAuth: (data: {
    token: string
    user: User
    permissions: string[]
    role_level: number
    is_super?: boolean
    is_platform?: boolean
  }) => void
  setUser: (user: User) => void
  startImpersonation: (data: ImpersonationState) => void
  stopImpersonation: () => void
  logout: () => void
  hasPermission: (permission: string) => boolean
  hasAnyPermission: (permissions: string[]) => boolean
  isSuperAdmin: () => boolean
  isPlatformUser: () => boolean
  isCompanyOwner: () => boolean
  isDepartmentManager: () => boolean
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      _hasHydrated: false,
      setHasHydrated: (val) => set({ _hasHydrated: val }),
      token: null,
      user: null,
      company: null,
      permissions: [],
      roleLevel: 5,
      isSuper: false,
      isPlatform: false,
      impersonation: null,

      setAuth: ({ token, user, permissions, role_level, is_super, is_platform }) =>
        set({
          token,
          user,
          company: user.company ?? null,
          permissions,
          roleLevel: role_level,
          isSuper: !!is_super,
          isPlatform: !!is_platform,
        }),

      setUser: (user) =>
        set((s) => ({
          user,
          company: user.company ?? s.company,
        })),

      startImpersonation: (data) => set({ impersonation: data }),

      /** Kendi oturumumuza dön: saklanan jeton ve yetkiler geri yüklenir. */
      stopImpersonation: () => {
        const { impersonation } = get()
        if (!impersonation) return
        set({
          token: impersonation.originalToken,
          permissions: impersonation.originalPermissions,
          roleLevel: impersonation.originalRoleLevel,
          isSuper: impersonation.originalIsSuper,
          isPlatform: impersonation.originalIsPlatform,
          user: null,
          company: null,
          impersonation: null,
        })
      },

      logout: () =>
        set({
          token: null, user: null, company: null, permissions: [], roleLevel: 5,
          isSuper: false, isPlatform: false, impersonation: null,
        }),

      // Sınırsız yetki yalnızca süper adminde; platform ekibi kendi izin listesiyle sınırlıdır
      hasPermission: (permission: string) => {
        const { roleLevel, permissions, isSuper, isPlatform } = get()
        if (isSuper) return true
        if (!isPlatform && roleLevel <= ROLE_LEVELS.COMPANY_OWNER) return true
        return permissions.includes(permission)
      },

      hasAnyPermission: (perms: string[]) => {
        const { roleLevel, permissions, isSuper, isPlatform } = get()
        if (isSuper) return true
        if (!isPlatform && roleLevel <= ROLE_LEVELS.COMPANY_OWNER) return true
        return perms.some((p) => permissions.includes(p))
      },

      isSuperAdmin: () => get().isSuper || (!get().isPlatform && get().roleLevel === ROLE_LEVELS.SUPER_ADMIN),
      isPlatformUser: () => get().isPlatform,
      isCompanyOwner: () => get().roleLevel <= ROLE_LEVELS.COMPANY_OWNER,
      isDepartmentManager: () => get().roleLevel <= ROLE_LEVELS.DEPARTMENT_MANAGER,
    }),
    {
      name: 'bytepanel-auth',
      partialize: (s) => ({
        token: s.token,
        permissions: s.permissions,
        roleLevel: s.roleLevel,
        isSuper: s.isSuper,
        isPlatform: s.isPlatform,
        impersonation: s.impersonation,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    }
  )
)
