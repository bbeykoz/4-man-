'use client'

import { useState, Suspense } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Lock, ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { authService } from '@/services/auth.service'

const schema = z.object({
  password: z.string().min(8, 'Şifre en az 8 karakter olmalı.'),
  password_confirmation: z.string(),
}).refine((d) => d.password === d.password_confirmation, {
  message: 'Şifreler eşleşmiyor.',
  path: ['password_confirmation'],
})

type FormData = z.infer<typeof schema>

function ResetPasswordContent() {
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)
  const searchParams = useSearchParams()
  const router = useRouter()

  const token = searchParams.get('token') ?? ''
  const email = searchParams.get('email') ?? ''

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async ({ password, password_confirmation }: FormData) => {
    if (!token || !email) {
      toast.error('Geçersiz şifre sıfırlama bağlantısı.')
      return
    }
    setLoading(true)
    try {
      const res = await authService.resetPassword(token, email, password, password_confirmation)
      if (res.success) {
        setDone(true)
        setTimeout(() => router.push('/login'), 3000)
      } else {
        toast.error(res.message ?? 'Bir hata oluştu.')
      }
    } catch (err: any) {
      toast.error(err?.message ?? 'Bir hata oluştu.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-6">
      <div className="w-full max-w-md">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl">
          {done ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-green-950 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="h-8 w-8 text-green-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Şifre Güncellendi</h2>
              <p className="text-zinc-400 text-sm mb-6">
                Şifreniz başarıyla güncellendi. Giriş sayfasına yönlendiriliyorsunuz...
              </p>
              <Link href="/login" className="flex items-center justify-center gap-2 text-sm text-blue-400 hover:text-blue-300">
                <ArrowLeft className="h-4 w-4" /> Giriş sayfasına git
              </Link>
            </div>
          ) : (
            <>
              <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 mb-6 transition-colors">
                <ArrowLeft className="h-4 w-4" /> Geri
              </Link>
              <h2 className="text-2xl font-bold text-white mb-1">Yeni Şifre Belirle</h2>
              <p className="text-zinc-400 text-sm mb-6">
                {email ? (
                  <><span className="text-zinc-300">{email}</span> için yeni şifrenizi girin.</>
                ) : (
                  'Hesabınız için yeni bir şifre belirleyin.'
                )}
              </p>

              {!token && (
                <div className="p-3 bg-red-950/50 border border-red-800 rounded-lg mb-4">
                  <p className="text-sm text-red-400">Geçersiz veya süresi dolmuş sıfırlama bağlantısı.</p>
                </div>
              )}

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">Yeni Şifre</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                    <input
                      {...register('password')}
                      type="password"
                      placeholder="En az 8 karakter"
                      className="w-full pl-10 pr-4 py-2.5 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                  </div>
                  {errors.password && <p className="text-xs text-red-400 mt-1">{errors.password.message}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">Şifre Tekrar</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                    <input
                      {...register('password_confirmation')}
                      type="password"
                      placeholder="Şifrenizi tekrar girin"
                      className="w-full pl-10 pr-4 py-2.5 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                  </div>
                  {errors.password_confirmation && <p className="text-xs text-red-400 mt-1">{errors.password_confirmation.message}</p>}
                </div>

                <button
                  type="submit"
                  disabled={loading || !token}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors"
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {loading ? 'Güncelleniyor...' : 'Şifreyi Güncelle'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordContent />
    </Suspense>
  )
}
