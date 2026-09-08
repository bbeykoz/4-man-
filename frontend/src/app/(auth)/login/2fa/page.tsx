'use client'

import { useRef, useState, KeyboardEvent, ClipboardEvent, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { ShieldCheck, Loader2 } from 'lucide-react'
import { post } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import { ROLE_LEVELS } from '@/lib/constants'

function TwoFactorLoginContent() {
  const [digits, setDigits]   = useState<string[]>(Array(6).fill(''))
  const [loading, setLoading] = useState(false)
  const inputs                = useRef<(HTMLInputElement | null)[]>([])
  const router                = useRouter()
  const params                = useSearchParams()
  const userId                = params.get('userId') ?? ''

  const getCode = () => digits.join('')

  const handleChange = (index: number, value: string) => {
    // Allow only digits
    const char = value.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[index] = char
    setDigits(next)
    if (char && index < 5) {
      inputs.current[index + 1]?.focus()
    }
    // Auto-submit when all digits filled
    if (char && index === 5) {
      const code = next.join('')
      if (code.length === 6) submitCode(code)
    }
  }

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputs.current[index - 1]?.focus()
    }
  }

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted.length === 6) {
      setDigits(pasted.split(''))
      inputs.current[5]?.focus()
      submitCode(pasted)
    }
  }

  const submitCode = async (code: string) => {
    if (!userId) {
      toast.error('Geçersiz oturum. Lütfen tekrar giriş yapın.')
      router.push('/login')
      return
    }
    setLoading(true)
    try {
      const res = await post<{ success: boolean; data: any }>('/auth/2fa/verify', {
        user_id: userId,
        otp: code,
      })
      useAuthStore.getState().setAuth(res.data)
      toast.success('Giriş başarılı!')
      const level = useAuthStore.getState().roleLevel
      router.push(level === ROLE_LEVELS.SUPER_ADMIN ? '/super-admin/dashboard' : '/company/dashboard')
    } catch (err: any) {
      toast.error(err?.errors?.otp?.[0] ?? err?.message ?? 'Geçersiz kod.')
      setDigits(Array(6).fill(''))
      inputs.current[0]?.focus()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex bg-zinc-950">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-blue-900 via-blue-800 to-violet-900 items-center justify-center p-12">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '32px 32px' }} />
        <div className="relative z-10 text-center">
          <div className="w-20 h-20 rounded-2xl bg-white/10 backdrop-blur border border-white/20 flex items-center justify-center mx-auto mb-8">
            <span className="text-white text-3xl font-bold">BP</span>
          </div>
          <h1 className="text-4xl font-bold text-white mb-4">BytePanel</h1>
          <p className="text-blue-200 text-lg max-w-xs">Kurumsal operasyonlarınızı tek bir güçlü platformda yönetin.</p>
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
            <div className="flex flex-col items-center mb-8">
              <div className="w-14 h-14 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center mb-4">
                <ShieldCheck className="h-7 w-7 text-blue-400" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-1">İki Faktörlü Doğrulama</h2>
              <p className="text-zinc-400 text-sm text-center">
                Google Authenticator uygulamasındaki<br />6 haneli kodu girin.
              </p>
            </div>

            <div className="flex gap-2 justify-center mb-8">
              {digits.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { inputs.current[i] = el }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  onPaste={i === 0 ? handlePaste : undefined}
                  disabled={loading}
                  className="w-11 h-13 text-center text-xl font-bold bg-zinc-800 border-2 border-zinc-700 rounded-xl text-white focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-40"
                  style={{ height: '52px' }}
                  autoFocus={i === 0}
                />
              ))}
            </div>

            <button
              onClick={() => submitCode(getCode())}
              disabled={loading || getCode().length < 6}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold rounded-lg transition-colors"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? 'Doğrulanıyor...' : 'Doğrula'}
            </button>

            <button
              onClick={() => router.push('/login')}
              className="mt-3 w-full py-2.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Geri dön
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function TwoFactorLoginPage() {
  return (
    <Suspense>
      <TwoFactorLoginContent />
    </Suspense>
  )
}
