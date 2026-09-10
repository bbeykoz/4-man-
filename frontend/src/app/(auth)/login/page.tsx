'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Eye, EyeOff, Lock, Mail, Loader2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { ROLE_LEVELS } from '@/lib/constants'
import { useAuthStore } from '@/store/auth.store'

const loginSchema = z.object({
  email:    z.string().email('Geçerli bir e-posta girin.'),
  password: z.string().min(6, 'Şifre en az 6 karakter olmalı.'),
})

type LoginForm = z.infer<typeof loginSchema>

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading]           = useState(false)
  const { login }  = useAuth()
  const { roleLevel } = useAuthStore()
  const router     = useRouter()

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  const fillDemoAccount = (email: string) => {
    setValue('email', email, { shouldDirty: true, shouldTouch: true, shouldValidate: true })
    setValue('password', 'Demo@2024!', { shouldDirty: true, shouldTouch: true, shouldValidate: true })
    toast.success(`${email} hesabı dolduruldu.`)
  }

  const onSubmit = async (data: LoginForm) => {
    setLoading(true)
    try {
      const result = await login(data.email, data.password)
      if (result.requires2fa) {
        router.push(`/login/2fa?userId=${result.userId}`)
        return
      }
      if (result.requires2faSetup) {
        router.push(`/login/2fa/setup?userId=${result.userId}`)
        return
      }
      toast.success('Giriş başarılı!')
      const level = useAuthStore.getState().roleLevel
      router.push(level === ROLE_LEVELS.SUPER_ADMIN ? '/super-admin/dashboard' : '/company/dashboard')
    } catch (err: any) {
      toast.error(err?.message ?? 'Giriş başarısız.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex bg-zinc-950">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-blue-900 via-blue-800 to-violet-900 items-center justify-center p-12">
        <div className="absolute inset-0 opacity-10" style={{backgroundImage:'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '32px 32px'}} />
        <div className="relative z-10 text-center">
          <div className="w-20 h-20 rounded-2xl bg-white/10 backdrop-blur border border-white/20 flex items-center justify-center mx-auto mb-8">
            <span className="text-white text-3xl font-bold">BP</span>
          </div>
          <h1 className="text-4xl font-bold text-white mb-4">BytePanel</h1>
          <p className="text-blue-200 text-lg max-w-xs">
            Kurumsal operasyonlarınızı tek bir güçlü platformda yönetin.
          </p>
          <div className="mt-12 grid grid-cols-2 gap-4 text-left">
            {['Çok Katmanlı Yetki', 'Güvenli Erişim', '8 Departman Modülü', 'Gerçek Zamanlı Log'].map((feat) => (
              <div key={feat} className="flex items-center gap-2 text-blue-100 text-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                {feat}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center">
              <span className="text-white text-sm font-bold">BP</span>
            </div>
            <span className="text-xl font-bold text-white">BytePanel</span>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white mb-1">Giriş Yap</h2>
              <p className="text-zinc-400 text-sm">Yönetim panelinize erişin.</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">E-posta</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <input
                    {...register('email')}
                    type="email"
                    placeholder="ornek@sirket.com"
                    className="w-full pl-10 pr-4 py-2.5 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>
                {errors.email && <p className="text-xs text-red-400 mt-1">{errors.email.message}</p>}
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">Şifre</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <input
                    {...register('password')}
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-10 py-2.5 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-red-400 mt-1">{errors.password.message}</p>}
              </div>

              <div className="flex justify-end">
                <a href="/forgot-password" className="text-sm text-blue-400 hover:text-blue-300 transition-colors">
                  Şifremi unuttum
                </a>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
              </button>
            </form>

            <div className="mt-6 p-3 bg-zinc-800/50 rounded-lg border border-zinc-700/50">
              <p className="text-xs text-zinc-500 font-medium mb-2">Demo Hesaplar</p>
              <div className="space-y-1.5 text-xs text-zinc-400">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-zinc-500">Şirket Sahibi</span>
                  <button
                    type="button"
                    onClick={() => fillDemoAccount('owner@demo.com')}
                    className="text-zinc-300 hover:text-blue-400 transition-colors truncate text-right"
                  >
                    owner@demo.com
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-zinc-500">Müdür</span>
                  <button
                    type="button"
                    onClick={() => fillDemoAccount('manager@demo.com')}
                    className="text-zinc-300 hover:text-blue-400 transition-colors truncate text-right"
                  >
                    manager@demo.com
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-zinc-500">Personel</span>
                  <button
                    type="button"
                    onClick={() => fillDemoAccount('staff@demo.com')}
                    className="text-zinc-300 hover:text-blue-400 transition-colors truncate text-right"
                  >
                    staff@demo.com
                  </button>
                </div>
                <p className="text-zinc-600 pt-0.5">↑ Tıklayarak otomatik doldur</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
