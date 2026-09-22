'use client'

// Düzen: watermelon "auth 11" bloğu. Form mantığı projenin kendi girişi (react-hook-form + zod + 2FA).
// Google/Apple düğmeleri duruyor ama pasif: backend'de OAuth sağlayıcı bağlı değil.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { motion, type Variants } from 'motion/react'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { ROLE_LEVELS } from '@/lib/constants'
import { useAuthStore } from '@/store/auth.store'

const GoogleIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" {...props}>
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.16v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.16C1.43 8.55 1 10.22 1 12s.43 3.45 1.16 4.93l3.68-2.84z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.16 7.07l3.68 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </svg>
)

const AppleIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" {...props}>
    <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.56-1.702z" />
  </svg>
)

const loginSchema = z.object({
  email:    z.string().email('Geçerli bir e-posta girin.'),
  password: z.string().min(6, 'Şifre en az 6 karakter olmalı.'),
})

type LoginForm = z.infer<typeof loginSchema>

const DEMO_ACCOUNTS = [
  { label: 'Şirket sahibi', email: 'owner@demo.com' },
  { label: 'Müdür',         email: 'manager@demo.com' },
  { label: 'Personel',      email: 'staff@demo.com' },
]

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.1 },
  },
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 15 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 300, damping: 24 },
  },
}

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading]           = useState(false)
  const { login }  = useAuth()
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
    } catch (err) {
      toast.error((err as { message?: string })?.message ?? 'Giriş başarısız.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-[#050505] font-sans text-neutral-200 antialiased selection:bg-white/20 selection:text-white lg:flex-row">
      {/* Sol görsel panel */}
      <div className="relative hidden w-full flex-col justify-end p-4 lg:flex lg:min-h-screen lg:w-1/2">
        <div className="relative h-full w-full overflow-hidden rounded-[32px] border border-white/10 shadow-2xl">
          <div
            aria-hidden
            className="absolute inset-0 bg-[radial-gradient(70%_60%_at_25%_20%,rgba(37,99,235,0.45)_0%,transparent_60%),radial-gradient(60%_60%_at_80%_30%,rgba(124,58,237,0.35)_0%,transparent_65%),linear-gradient(180deg,#0b1020_0%,#050505_100%)]"
          />
          <div className="absolute inset-0 bg-linear-to-t from-[#050505] via-[#050505]/20 to-transparent" />

          <div className="absolute right-0 bottom-0 left-0 z-10 flex w-full flex-col items-center justify-center pb-12 text-center">
            <h1 className="text-3xl font-medium tracking-tight text-balance text-white md:text-4xl lg:text-5xl">
              Deponuz kayıt altında
            </h1>
            <p className="mt-4 max-w-sm text-sm text-white/60">
              Giriş, çıkış, transfer ve sayım tek deftere yazılır. Stok onayda işlenir.
            </p>
            <div className="mt-8 flex items-center justify-center gap-2">
              <div className="h-1 w-6 rounded-full bg-white"></div>
              <div className="h-1 w-1.5 rounded-full bg-white/40"></div>
              <div className="h-1 w-1.5 rounded-full bg-white/40"></div>
              <div className="h-1 w-1.5 rounded-full bg-white/40"></div>
            </div>
          </div>
        </div>
      </div>

      {/* Sağ form paneli */}
      <div className="flex w-full flex-col items-center justify-center p-6 sm:p-12 lg:w-1/2">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="w-full max-w-[400px]"
        >
          <motion.div variants={itemVariants} className="mb-10 text-center">
            <a href="/market" className="mb-8 inline-flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 text-sm font-bold text-white">
                BP
              </span>
              <span className="font-bold text-white">BytePanel</span>
            </a>
            <h2 className="text-3xl leading-tight font-medium tracking-tight text-balance text-white md:text-[40px]">
              Depo panelinize
              <br />
              <span className="font-serif font-light italic">giriş yapın.</span>
            </h2>
          </motion.div>

          {/* Sosyal giriş — sağlayıcı bağlanınca açılacak */}
          <motion.div variants={itemVariants} className="mb-8 grid grid-cols-2 gap-4">
            {[
              { label: 'Google', Icon: GoogleIcon },
              { label: 'Apple', Icon: AppleIcon },
            ].map(({ label, Icon }) => (
              <button
                key={label}
                type="button"
                onClick={() => toast.info(`${label} ile giriş henüz açık değil. E-posta ve şifreyle girebilirsiniz.`)}
                title={`${label} ile giriş — yakında`}
                className="flex cursor-not-allowed items-center justify-center gap-2 rounded-full border border-white/10 bg-[#141414] py-3 text-[13px] font-medium text-white/60 transition-transform hover:bg-[#1f1f1f] active:scale-[0.96]"
              >
                <Icon className="text-[16px]" />
                {label}
                <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] tracking-wide text-white/50">
                  yakında
                </span>
              </button>
            ))}
          </motion.div>

          <motion.div variants={itemVariants} className="relative mb-8 flex items-center">
            <div className="grow border-t border-white/10"></div>
            <span className="px-4 text-[11px] font-medium tracking-wider text-neutral-500 uppercase">
              veya
            </span>
            <div className="grow border-t border-white/10"></div>
          </motion.div>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
            <motion.div variants={itemVariants} className="flex flex-col gap-2">
              <label htmlFor="email" className="text-sm font-medium text-neutral-200">
                E-posta
              </label>
              <input
                {...register('email')}
                id="email"
                type="email"
                autoComplete="email"
                placeholder="ornek@sirket.com"
                className="w-full rounded-[14px] border border-white/10 bg-[#0A0A0A] px-4 py-3.5 text-sm text-white transition-colors placeholder:text-neutral-500 focus:border-neutral-500 focus:bg-[#111] focus:ring-1 focus:ring-neutral-500 focus:outline-none"
              />
              {errors.email && <p className="text-xs text-red-400">{errors.email.message}</p>}
            </motion.div>

            <motion.div variants={itemVariants} className="flex flex-col gap-2">
              <label htmlFor="password" className="text-sm font-medium text-neutral-200">
                Şifre
              </label>
              <div className="relative">
                <input
                  {...register('password')}
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Şifrenizi girin"
                  className="w-full rounded-[14px] border border-white/10 bg-[#0A0A0A] px-4 py-3.5 pr-11 text-sm text-white transition-colors placeholder:text-neutral-500 focus:border-neutral-500 focus:bg-[#111] focus:ring-1 focus:ring-neutral-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-red-400">{errors.password.message}</p>}
            </motion.div>

            <motion.div variants={itemVariants} className="flex justify-end">
              <a href="/forgot-password" className="text-[13px] text-neutral-400 hover:text-white">
                Şifremi unuttum
              </a>
            </motion.div>

            <motion.div variants={itemVariants} className="mt-2">
              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-[#EAEAEA] py-3.5 text-sm font-medium text-black shadow-[0_0_20px_rgba(255,255,255,0.05)] transition-transform hover:bg-white active:scale-[0.96] disabled:opacity-60"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {loading ? 'Giriş yapılıyor…' : 'Giriş yap'}
              </button>
            </motion.div>
          </form>

          {/* Demo hesaplar: tıklayınca form dolar. Canlıda da görünür (istenildi). */}
          <motion.div
            variants={itemVariants}
            className="mt-8 rounded-[14px] border border-white/10 bg-[#0A0A0A] p-3"
          >
            <p className="mb-2 text-[11px] font-medium tracking-wider text-neutral-500 uppercase">
              Demo hesaplar
            </p>
            <div className="space-y-1.5 text-xs">
              {DEMO_ACCOUNTS.map(acc => (
                <div key={acc.email} className="flex items-center justify-between gap-2">
                  <span className="text-neutral-500">{acc.label}</span>
                  <button
                    type="button"
                    onClick={() => fillDemoAccount(acc.email)}
                    className="truncate text-right text-neutral-300 transition-colors hover:text-white"
                  >
                    {acc.email}
                  </button>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div variants={itemVariants} className="mt-6 text-[13px] text-neutral-400">
            Hesabınız yok mu?{' '}
            <a href="/market#fiyatlandirma" className="font-bold text-white hover:underline">
              Paketlere göz atın
            </a>
          </motion.div>
        </motion.div>
      </div>
    </div>
  )
}
