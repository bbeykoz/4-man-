'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Mail, ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { authService } from '@/services/auth.service'

const schema = z.object({ email: z.string().email('Geçerli bir e-posta girin.') })

export default function ForgotPasswordPage() {
  const [sent, setSent]       = useState(false)
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<{ email: string }>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async ({ email }: { email: string }) => {
    setLoading(true)
    try {
      const res = await authService.forgotPassword(email)
      if (res.success) {
        setSent(true)
      } else {
        toast.error(res.message)
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
          {sent ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-green-950 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="h-8 w-8 text-green-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">E-posta Gönderildi</h2>
              <p className="text-zinc-400 text-sm mb-6">Şifre sıfırlama bağlantısı e-posta adresinize gönderildi.</p>
              <Link href="/login" className="flex items-center justify-center gap-2 text-sm text-blue-400 hover:text-blue-300">
                <ArrowLeft className="h-4 w-4" /> Giriş sayfasına dön
              </Link>
            </div>
          ) : (
            <>
              <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 mb-6 transition-colors">
                <ArrowLeft className="h-4 w-4" /> Geri
              </Link>
              <h2 className="text-2xl font-bold text-white mb-1">Şifremi Unuttum</h2>
              <p className="text-zinc-400 text-sm mb-6">E-posta adresinizi girin, sıfırlama bağlantısı gönderelim.</p>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">E-posta</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                    <input
                      {...register('email')}
                      type="email"
                      placeholder="ornek@sirket.com"
                      className="w-full pl-10 pr-4 py-2.5 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                  </div>
                  {errors.email && <p className="text-xs text-red-400 mt-1">{errors.email.message}</p>}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors"
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {loading ? 'Gönderiliyor...' : 'Sıfırlama Bağlantısı Gönder'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
