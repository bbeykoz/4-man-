'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, Company, AuthState } from '@/types/auth.types'
import { ROLE_LEVELS } from '@/lib/constants'

interface AuthStore extends AuthState {
  _hasHydrated: boolean
  setHasHydrated: (val: boolean) => void
  setAuth: (data: { token: string; user: User; permissions: string[]; role_level: number }) => void
  setUser: (user: User) => void
  logout: () => void
  hasPermission: (permission: string) => boolean
  hasAnyPermission: (permissions: string[]) => boolean
  isSuperAdmin: () => boolean
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

      setAuth: ({ token, user, permissions, role_level }) =>
        set({
          token,
          user,
          company: user.company ?? null,
          permissions,
          roleLevel: role_level,
        }),

      setUser: (user) =>
        set((s) => ({
          user,
          company: user.company ?? s.company,
        })),

      logout: () =>
        set({ token: null, user: null, company: null, permissions: [], roleLevel: 5 }),

      hasPermission: (permission: string) => {
        const { roleLevel, permissions } = get()
        if (roleLevel <= ROLE_LEVELS.COMPANY_OWNER) return true
        return permissions.includes(permission)
      },

      hasAnyPermission: (perms: string[]) => {
        const { roleLevel, permissions } = get()
        if (roleLevel <= ROLE_LEVELS.COMPANY_OWNER) return true
        return perms.some((p) => permissions.includes(p))
      },

      isSuperAdmin: () => get().roleLevel === ROLE_LEVELS.SUPER_ADMIN,
      isCompanyOwner: () => get().roleLevel <= ROLE_LEVELS.COMPANY_OWNER,
      isDepartmentManager: () => get().roleLevel <= ROLE_LEVELS.DEPARTMENT_MANAGER,
    }),
    {
      name: 'bytepanel-auth',
      partialize: (s) => ({ token: s.token, permissions: s.permissions, roleLevel: s.roleLevel }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    }
  )
)
