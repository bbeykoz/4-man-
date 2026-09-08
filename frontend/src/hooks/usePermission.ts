'use client'

import { useAuthStore } from '@/store/auth.store'

export function usePermission(permission: string): boolean {
  return useAuthStore((s) => s.hasPermission(permission))
}

export function useAnyPermission(permissions: string[]): boolean {
  return useAuthStore((s) => s.hasAnyPermission(permissions))
}
