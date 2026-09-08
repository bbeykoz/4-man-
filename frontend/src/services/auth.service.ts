import { get, post } from '@/lib/api'
import type { LoginResponse } from '@/types/auth.types'

export const authService = {
  login: (email: string, password: string, deviceName?: string) =>
    post<LoginResponse>('/auth/login', { email, password, device_name: deviceName }),

  logout: () => post('/auth/logout'),

  me: () => post<{ success: boolean; data: { user: any; permissions: string[]; role_level: number } }>('/auth/me'),

  forgotPassword: (email: string) =>
    post<{ success: boolean; message: string }>('/auth/forgot-password', { email }),

  resetPassword: (token: string, email: string, password: string, passwordConfirmation: string) =>
    post<{ success: boolean; message: string }>('/auth/reset-password', {
      token,
      email,
      password,
      password_confirmation: passwordConfirmation,
    }),

  sessions: () => post<{ success: boolean; data: any[] }>('/auth/sessions'),
  revokeSession: (id: string) => post(`/auth/sessions/${id}`),

  // 2FA
  setup2FA: () =>
    get<{ success: boolean; data: { secret: string; otpauth_url: string } }>('/auth/2fa/setup'),
  enable2FA: (otp: string) =>
    post<{ success: boolean; message: string }>('/auth/2fa/enable', { otp }),
  disable2FA: (password: string) =>
    post<{ success: boolean; message: string }>('/auth/2fa/disable', { password }),
}
