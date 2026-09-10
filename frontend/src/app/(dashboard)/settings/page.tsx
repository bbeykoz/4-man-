'use client'

import { useEffect, useRef, useState, KeyboardEvent, ClipboardEvent } from 'react'
import { toast } from 'sonner'
import { Sun, Moon, Monitor, Globe, Bell, Layout, Palette, Shield, ShieldCheck, ShieldOff, Eye, EyeOff, Loader2, Copy, CheckCheck } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { useUiStore } from '@/store/ui.store'
import { useT } from '@/lib/i18n'
import { useAuth } from '@/hooks/useAuth'
import { authService } from '@/services/auth.service'
import QRCode from 'qrcode'

// ── 2FA Section ────────────────────────────────────────────────────────────────

type SetupStep = 'idle' | 'loading' | 'qr' | 'verify' | 'disabling'

function TwoFactorSection() {
  const { user, refreshMe } = useAuth()
  const enabled = user?.two_factor_enabled ?? false

  const [step, setStep]           = useState<SetupStep>('idle')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [secret, setSecret]       = useState('')
  const [copied, setCopied]       = useState(false)
  const [digits, setDigits]       = useState<string[]>(Array(6).fill(''))
  const [password, setPassword]   = useState('')
  const [showPw, setShowPw]       = useState(false)
  const [verifying, setVerifying] = useState(false)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => { setStep('idle') }, [enabled])

  const startSetup = async () => {
    setStep('loading')
    try {
      const res = await authService.setup2FA()
      const { secret: s, otpauth_url } = res.data
      setSecret(s)
      const dataUrl = await QRCode.toDataURL(otpauth_url, { width: 200, margin: 1 })
      setQrDataUrl(dataUrl)
      setStep('qr')
    } catch {
      toast.error('Kurulum başlatılamadı.')
      setStep('idle')
    }
  }

  const handleDigitChange = (i: number, value: string) => {
    const char = value.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[i] = char
    setDigits(next)
    if (char && i < 5) inputRefs.current[i + 1]?.focus()
    if (char && i === 5) {
      const code = next.join('')
      if (code.length === 6) confirmEnable(code)
    }
  }

  const handleDigitKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) inputRefs.current[i - 1]?.focus()
  }

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted.length === 6) {
      setDigits(pasted.split(''))
      inputRefs.current[5]?.focus()
      confirmEnable(pasted)
    }
  }

  const confirmEnable = async (code: string) => {
    setVerifying(true)
    try {
      await authService.enable2FA(code)
      await refreshMe()
      toast.success('Google Authenticator etkinleştirildi!')
      setStep('idle')
      setDigits(Array(6).fill(''))
    } catch (err: any) {
      toast.error(err?.errors?.otp?.[0] ?? err?.message ?? 'Geçersiz kod.')
      setDigits(Array(6).fill(''))
      inputRefs.current[0]?.focus()
    } finally {
      setVerifying(false)
    }
  }

  const confirmDisable = async () => {
    if (!password) { toast.error('Şifrenizi girin.'); return }
    setVerifying(true)
    try {
      await authService.disable2FA(password)
      await refreshMe()
      toast.success('Google Authenticator devre dışı bırakıldı.')
      setStep('idle')
      setPassword('')
    } catch (err: any) {
      toast.error(err?.message ?? 'Şifre hatalı.')
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
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2 mb-5">
        <Shield className="h-4 w-4 text-zinc-400" /> İki Faktörlü Doğrulama (2FA)
      </h3>

      {/* Status banner */}
      <div className={`flex items-center gap-3 p-3 rounded-lg mb-5 ${enabled ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : 'bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700'}`}>
        {enabled
          ? <ShieldCheck className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" />
          : <ShieldOff className="h-5 w-5 text-zinc-400 flex-shrink-0" />
        }
        <div>
          <p className={`text-sm font-medium ${enabled ? 'text-green-700 dark:text-green-400' : 'text-zinc-700 dark:text-zinc-300'}`}>
            {enabled ? 'Etkin' : 'Devre Dışı'}
          </p>
          <p className="text-xs text-zinc-500">
            {enabled
              ? 'Hesabınız Google Authenticator ile korunuyor.'
              : 'Hesabınızı korumak için 2FA\'yı etkinleştirin.'}
          </p>
        </div>
      </div>

      {/* ── SETUP: QR step ─────────────────────────────────────── */}
      {step === 'qr' && (
        <div className="space-y-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            1. <strong className="text-zinc-900 dark:text-zinc-100">Google Authenticator</strong> uygulamasını açın.<br />
            2. <strong className="text-zinc-900 dark:text-zinc-100">+</strong> butonuna basın ve QR kodu tarayın.
          </p>
          <div className="flex justify-center">
            {qrDataUrl && (
              <img src={qrDataUrl} alt="2FA QR Kod" className="rounded-xl border border-zinc-200 dark:border-zinc-700" style={{ width: 200, height: 200 }} />
            )}
          </div>
          <div>
            <p className="text-xs text-zinc-500 mb-1">QR tarayamıyorsanız bu kodu elle girin:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono bg-zinc-100 dark:bg-zinc-800 px-3 py-2 rounded-lg text-zinc-800 dark:text-zinc-200 tracking-widest select-all">
                {secret}
              </code>
              <button onClick={copySecret} className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 transition-colors">
                {copied ? <CheckCheck className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setStep('idle'); setDigits(Array(6).fill('')) }}
              className="flex-1 py-2 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 border border-zinc-200 dark:border-zinc-700 rounded-lg transition-colors"
            >
              İptal
            </button>
            <button
              onClick={() => { setStep('verify'); setTimeout(() => inputRefs.current[0]?.focus(), 50) }}
              className="flex-1 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
            >
              Devam Et →
            </button>
          </div>
        </div>
      )}

      {/* ── SETUP: Verify step ──────────────────────────────────── */}
      {step === 'verify' && (
        <div className="space-y-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Uygulamada görünen <strong className="text-zinc-900 dark:text-zinc-100">6 haneli kodu</strong> girerek etkinleştirin.
          </p>
          <div className="flex gap-2 justify-center">
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => { inputRefs.current[i] = el }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={d}
                onChange={(e) => handleDigitChange(i, e.target.value)}
                onKeyDown={(e) => handleDigitKey(i, e)}
                onPaste={i === 0 ? handlePaste : undefined}
                disabled={verifying}
                className="w-10 text-center text-lg font-bold bg-zinc-50 dark:bg-zinc-800 border-2 border-zinc-300 dark:border-zinc-600 rounded-xl text-zinc-900 dark:text-white focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-40"
                style={{ height: '48px' }}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setStep('qr')}
              className="flex-1 py-2 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 border border-zinc-200 dark:border-zinc-700 rounded-lg transition-colors"
            >
              ← Geri
            </button>
            <button
              onClick={() => confirmEnable(digits.join(''))}
              disabled={verifying || digits.join('').length < 6}
              className="flex-1 py-2 text-sm font-medium bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white rounded-lg transition-colors flex items-center justify-center gap-1.5"
            >
              {verifying && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Etkinleştir
            </button>
          </div>
        </div>
      )}

      {/* ── Disable flow ────────────────────────────────────────── */}
      {step === 'disabling' && (
        <div className="space-y-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            2FA&apos;yı devre dışı bırakmak için şifrenizi onaylayın.
          </p>
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && confirmDisable()}
              placeholder="Şifreniz"
              className="w-full pr-10 pl-4 py-2.5 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setStep('idle'); setPassword('') }}
              className="flex-1 py-2 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 border border-zinc-200 dark:border-zinc-700 rounded-lg transition-colors"
            >
              İptal
            </button>
            <button
              onClick={confirmDisable}
              disabled={verifying || !password}
              className="flex-1 py-2 text-sm font-medium bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white rounded-lg transition-colors flex items-center justify-center gap-1.5"
            >
              {verifying && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Devre Dışı Bırak
            </button>
          </div>
        </div>
      )}

      {/* ── Action buttons (idle) ───────────────────────────────── */}
      {(step === 'idle' || step === 'loading') && (
        <>
          {!enabled ? (
            <button
              onClick={startSetup}
              disabled={step === 'loading'}
              className="w-full py-2.5 text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {step === 'loading' && <Loader2 className="h-4 w-4 animate-spin" />}
              {step === 'loading' ? 'Hazırlanıyor...' : 'Google Authenticator Kur'}
            </button>
          ) : (
            <button
              onClick={() => setStep('disabling')}
              className="w-full py-2.5 text-sm font-medium border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
            >
              2FA&apos;yı Devre Dışı Bırak
            </button>
          )}
        </>
      )}
    </div>
  )
}

// ── Main Settings Page ─────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { theme, setTheme, language, setLanguage } = useUiStore()
  const [density, setDensity] = useState<'compact' | 'comfortable' | 'spacious'>('comfortable')
  const t = useT()

  const themeOptions = [
    { key: 'light',  label: t('settings.theme.light'),  icon: Sun },
    { key: 'dark',   label: t('settings.theme.dark'),   icon: Moon },
    { key: 'system', label: t('settings.theme.system'), icon: Monitor },
  ] as const

  const densityOptions = [
    { key: 'compact',     label: t('settings.density.compact') },
    { key: 'comfortable', label: t('settings.density.comfortable') },
    { key: 'spacious',    label: t('settings.density.spacious') },
  ] as const

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('settings.title')}
        description={t('settings.description')}
        breadcrumbs={[{ label: t('settings.title') }]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-5">
          {/* 2FA */}
          <TwoFactorSection />

          {/* Appearance */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2 mb-5">
              <Palette className="h-4 w-4 text-zinc-400" /> {t('settings.appearance')}
            </h3>
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">{t('settings.theme')}</label>
                <div className="grid grid-cols-3 gap-3">
                  {themeOptions.map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => setTheme(opt.key)}
                      className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                        theme === opt.key
                          ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600'
                      }`}
                    >
                      <opt.icon className={`h-5 w-5 ${theme === opt.key ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-400'}`} />
                      <span className={`text-sm font-medium ${theme === opt.key ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-600 dark:text-zinc-400'}`}>
                        {opt.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">{t('settings.density')}</label>
                <div className="grid grid-cols-3 gap-3">
                  {densityOptions.map((d) => (
                    <button
                      key={d.key}
                      onClick={() => setDensity(d.key)}
                      className={`py-2.5 rounded-lg border-2 text-sm font-medium transition-all ${
                        density === d.key
                          ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                          : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Notifications */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2 mb-5">
              <Bell className="h-4 w-4 text-zinc-400" /> {t('settings.notifications')}
            </h3>
            <div className="space-y-3">
              {[
                { key: 'browser',      label: t('settings.notifications.browser'),   desc: t('settings.notifications.browser.desc') },
                { key: 'sound',        label: t('settings.notifications.sound'),      desc: t('settings.notifications.sound.desc') },
                { key: 'email_digest', label: t('settings.notifications.digest'),     desc: t('settings.notifications.digest.desc') },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between py-3 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{item.label}</p>
                    <p className="text-xs text-zinc-500">{item.desc}</p>
                  </div>
                  <label className="relative cursor-pointer">
                    <input type="checkbox" defaultChecked={item.key !== 'sound'} className="sr-only peer" />
                    <div className="w-10 h-5 bg-zinc-300 peer-checked:bg-blue-600 rounded-full transition-colors" />
                    <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5 shadow" />
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-5">
          {/* Language & Locale */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2 mb-5">
              <Globe className="h-4 w-4 text-zinc-400" /> {t('settings.language')}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">{t('settings.language.label')}</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as 'tr' | 'en' | 'bg')}
                  className="w-full px-3 py-2 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="tr">Türkçe</option>
                  <option value="en">English</option>
                  <option value="bg">Български</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">{t('settings.dateFormat')}</label>
                <select className="w-full px-3 py-2 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="dd.mm.yyyy">GG.AA.YYYY</option>
                  <option value="yyyy-mm-dd">YYYY-AA-GG</option>
                  <option value="mm/dd/yyyy">AA/GG/YYYY</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">{t('settings.timezone')}</label>
                <select className="w-full px-3 py-2 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="Europe/Istanbul">Europe/Istanbul (UTC+3)</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2 mb-4">
              <Layout className="h-4 w-4 text-zinc-400" /> {t('settings.sidebar')}
            </h3>
            <div className="space-y-3">
              {[
                { label: t('settings.sidebar.badges'),       defaultChecked: true },
                { label: t('settings.sidebar.animations'),   defaultChecked: true },
                { label: t('settings.sidebar.autoCollapse'), defaultChecked: false },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">{item.label}</span>
                  <label className="relative cursor-pointer">
                    <input type="checkbox" defaultChecked={item.defaultChecked} className="sr-only peer" />
                    <div className="w-9 h-4.5 bg-zinc-300 peer-checked:bg-blue-600 rounded-full transition-colors" />
                    <div className="absolute left-0.5 top-0.5 w-3.5 h-3.5 bg-white rounded-full transition-transform peer-checked:translate-x-4 shadow" />
                  </label>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => toast.success(t('settings.saved'))}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {t('settings.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
