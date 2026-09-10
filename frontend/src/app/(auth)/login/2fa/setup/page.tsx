'use client'

import { useCallback, useEffect, useRef, useState, KeyboardEvent, ClipboardEvent, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { ShieldCheck, Copy, CheckCheck, Loader2 } from 'lucide-react'
import { post } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import { ROLE_LEVELS } from '@/lib/constants'
import QRCode from 'qrcode'

type Step = 'loading' | 'qr' | 'verify'

function TwoFactorSetupContent() {
  const router     = useRouter()
  const params     = useSearchParams()
  const userId     = params.get('userId') ?? ''

  const [step, setStep]           = useState<Step>('loading')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [secret, setSecret]       = useState('')
  const [copied, setCopied]       = useState(false)
  const [digits, setDigits]       = useState<string[]>(Array(6).fill(''))
  const [verifying, setVerifying] = useState(false)
  const inputs = useRef<(HTMLInputElement | null)[]>([])

  const fetchQR = useCallback(async () => {
    if (!userId) { router.push('/login'); return }
    try {
      const res = await post<{ success: boolean; data: { secret: string; otpauth_url: string } }>(
        '/auth/2fa/setup-pending',
        { user_id: userId }
      )
      setSecret(res.data.secret)
      const dataUrl = await QRCode.toDataURL(res.data.otpauth_url, { width: 220, margin: 1 })
      setQrDataUrl(dataUrl)
      setStep('qr')
    } catch (err: any) {
      toast.error(err?.message ?? 'Kurulum başlatılamadı.')
      router.push('/login')
    }
  }, [userId, router])

  useEffect(() => { fetchQR() }, [fetchQR])

  const handleChange = (i: number, value: string) => {
    const char = value.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[i] = char
    setDigits(next)
    if (char && i < 5) inputs.current[i + 1]?.focus()
    if (char && i === 5) {
      const code = next.join('')
      if (code.length === 6) submitCode(code)
    }
  }

  const handleKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) inputs.current[i - 1]?.focus()
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
    setVerifying(true)
    try {
      const res = await post<{ success: boolean; data: any }>(
        '/auth/2fa/setup-complete',
        { user_id: userId, otp: code }
      )
      useAuthStore.getState().setAuth(res.data)
      toast.success('Google Authenticator etkinleştirildi!')
      const level = useAuthStore.getState().roleLevel
      router.push(level === ROLE_LEVELS.SUPER_ADMIN ? '/super-admin/dashboard' : '/company/dashboard')
    } catch (err: any) {
      toast.error(err?.message ?? 'Geçersiz kod.')
      setDigits(Array(6).fill(''))
      inputs.current[0]?.focus()
    } finally {
      setVerifying(false)
    }
  }

  const copySecret = () => {
    navigator.clipboard.writeText(secret)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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
          <p className="text-blue-200 text-lg max-w-xs">Hesabınızı Google Authenticator ile güvence altına alın.</p>
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
            <div className="flex flex-col items-center mb-6">
              <div className="w-14 h-14 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center mb-4">
                <ShieldCheck className="h-7 w-7 text-blue-400" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-1">Güvenlik Kurulumu</h2>
              <p className="text-zinc-400 text-sm text-center">
                {step === 'loading'
                  ? 'QR kod oluşturuluyor...'
                  : step === 'qr'
                    ? 'Google Authenticator\'ı kurmak için QR kodu tarayın.'
                    : 'Uygulamadaki 6 haneli kodu girin.'}
              </p>
            </div>

            {/* Step indicator */}
            <div className="flex items-center gap-2 mb-6">
              {['QR Kod', 'Doğrulama'].map((label, i) => {
                const active = (i === 0 && step === 'qr') || (i === 1 && step === 'verify')
                const done   = (i === 0 && step === 'verify')
                return (
                  <div key={label} className="flex items-center gap-2 flex-1">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                      done   ? 'bg-green-500 text-white' :
                      active ? 'bg-blue-600 text-white' :
                               'bg-zinc-800 text-zinc-500'
                    }`}>{done ? '✓' : i + 1}</div>
                    <span className={`text-xs ${active ? 'text-zinc-300' : 'text-zinc-500'}`}>{label}</span>
                    {i < 1 && <div className="flex-1 h-px bg-zinc-800" />}
                  </div>
                )
              })}
            </div>

            {/* Loading */}
            {step === 'loading' && (
              <div className="flex justify-center py-10">
                <Loader2 className="h-8 w-8 text-blue-400 animate-spin" />
              </div>
            )}

            {/* QR step */}
            {step === 'qr' && (
              <div className="space-y-4">
                <ol className="text-sm text-zinc-400 space-y-1 list-decimal list-inside">
                  <li>Telefonunuzda <strong className="text-zinc-200">Google Authenticator</strong> uygulamasını açın.</li>
                  <li><strong className="text-zinc-200">+</strong> butonuna basın, QR kodu tarayın.</li>
                </ol>
                <div className="flex justify-center">
                  <img src={qrDataUrl} alt="2FA QR Kod" className="rounded-xl border border-zinc-700" style={{ width: 220, height: 220 }} />
                </div>
                <div>
                  <p className="text-xs text-zinc-500 mb-1.5">QR tarayamazsanız bu kodu elle girin:</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs font-mono bg-zinc-800 px-3 py-2 rounded-lg text-zinc-300 tracking-widest select-all break-all">
                      {secret}
                    </code>
                    <button onClick={copySecret} className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-500 transition-colors flex-shrink-0">
                      {copied ? <CheckCheck className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => { setStep('verify'); setTimeout(() => inputs.current[0]?.focus(), 50) }}
                  className="w-full py-2.5 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
                >
                  Taradım, Devam Et →
                </button>
              </div>
            )}

            {/* Verify step */}
            {step === 'verify' && (
              <div className="space-y-5">
                <p className="text-sm text-zinc-400">
                  Uygulamada görünen <strong className="text-zinc-200">6 haneli kodu</strong> girin.
                </p>
                <div className="flex gap-2 justify-center">
                  {digits.map((d, i) => (
                    <input
                      key={i}
                      ref={(el) => { inputs.current[i] = el }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={d}
                      onChange={(e) => handleChange(i, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(i, e)}
                      onPaste={i === 0 ? handlePaste : undefined}
                      disabled={verifying}
                      className="w-11 text-center text-xl font-bold bg-zinc-800 border-2 border-zinc-700 rounded-xl text-white focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-40"
                      style={{ height: '52px' }}
                      autoFocus={i === 0}
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setStep('qr'); setDigits(Array(6).fill('')) }}
                    className="flex-1 py-2.5 text-sm text-zinc-500 hover:text-zinc-300 border border-zinc-700 rounded-lg transition-colors"
                  >
                    ← Geri
                  </button>
                  <button
                    onClick={() => submitCode(digits.join(''))}
                    disabled={verifying || digits.join('').length < 6}
                    className="flex-1 py-2.5 text-sm font-semibold bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    {verifying && <Loader2 className="h-4 w-4 animate-spin" />}
                    {verifying ? 'Doğrulanıyor...' : 'Etkinleştir & Giriş Yap'}
                  </button>
                </div>
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-zinc-800 text-center">
              <p className="text-xs text-zinc-600">
                Bu adım hesabınızın güvenliği için zorunludur.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function TwoFactorSetupPage() {
  return (
    <Suspense>
      <TwoFactorSetupContent />
    </Suspense>
  )
}
