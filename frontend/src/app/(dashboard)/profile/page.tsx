'use client'

import { useState, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Camera, Save, Loader2, Lock, Shield, LogOut, Monitor } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { post, put, patch } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import { formatDateTime } from '@/lib/utils'

const profileSchema = z.object({
  name: z.string().min(2, 'Ad en az 2 karakter olmalı.'),
  email: z.string().email('Geçerli bir e-posta girin.'),
  phone: z.string().optional(),
})

const passwordSchema = z.object({
  current_password: z.string().min(1, 'Mevcut şifrenizi girin.'),
  password: z.string().min(8, 'Şifre en az 8 karakter olmalı.'),
  password_confirmation: z.string(),
}).refine((d) => d.password === d.password_confirmation, {
  message: 'Şifreler eşleşmiyor.',
  path: ['password_confirmation'],
})

type ProfileData = z.infer<typeof profileSchema>
type PasswordData = z.infer<typeof passwordSchema>

export default function ProfilePage() {
  const { user, setUser } = useAuthStore()
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'sessions'>('profile')
  const fileRef = useRef<HTMLInputElement>(null)

  const { register: profileReg, handleSubmit: handleProfile, watch: watchProfile, formState: { errors: profileErrors, isDirty: profileDirty } } = useForm<ProfileData>({
    resolver: zodResolver(profileSchema),
    values: { name: user?.name ?? '', email: user?.email ?? '', phone: '' },
  })

  const { register: passReg, handleSubmit: handlePass, reset: resetPass, formState: { errors: passErrors } } = useForm<PasswordData>({
    resolver: zodResolver(passwordSchema),
  })

  // Önizleme kartı formu canlı izler
  const preview = watchProfile()

  const profileMutation = useMutation({
    mutationFn: (d: ProfileData) => put('/profile', d),
    onSuccess: (res: any) => {
      toast.success('Profil güncellendi.')
      if (res?.data) setUser(res.data)
    },
    onError: (e: any) => toast.error(e?.message),
  })

  const passwordMutation = useMutation({
    mutationFn: (d: PasswordData) => put('/profile/password', d),
    onSuccess: () => {
      toast.success('Şifre başarıyla değiştirildi.')
      resetPass()
    },
    onError: (e: any) => toast.error(e?.message),
  })

  const avatarMutation = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData()
      fd.append('avatar', file)
      return post('/profile/avatar', fd)
    },
    onSuccess: (res: any) => {
      toast.success('Profil fotoğrafı güncellendi.')
      if (res?.data) setUser(res.data)
    },
    onError: (e: any) => toast.error(e?.message),
  })

  const tabs = [
    { key: 'profile', label: 'Profil' },
    { key: 'security', label: 'Güvenlik' },
    { key: 'sessions', label: 'Oturumlar' },
  ] as const

  return (
    <div className="space-y-5">
      <PageHeader
        title="Profilim"
        description="Hesap bilgilerinizi ve güvenlik ayarlarınızı yönetin"
        breadcrumbs={[{ label: 'Profil' }]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* Avatar Card */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 flex flex-col items-center text-center">
            <div className="relative mb-4">
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt={user.name} className="w-24 h-24 rounded-full object-cover" />
              ) : (
                <div className="w-24 h-24 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <span className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                    {user?.name?.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <button
                onClick={() => fileRef.current?.click()}
                className="absolute bottom-0 right-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white hover:bg-blue-700 transition-colors shadow-lg"
              >
                <Camera className="h-4 w-4" />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) avatarMutation.mutate(file)
                }}
              />
            </div>
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">{user?.name}</h3>
            <p className="text-sm text-zinc-400 mt-0.5">{user?.email}</p>
            {user?.roles?.[0] && (
              <span className="mt-3 inline-flex items-center px-3 py-1 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 text-xs font-medium">
                {user.roles[0].name}
              </span>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-3">
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
            <div className="border-b border-zinc-200 dark:border-zinc-800 px-5">
              <nav className="flex gap-1 -mb-px">
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === tab.key
                        ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                        : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>

            <div className="p-6">
              {activeTab === 'profile' && (
                /* Düzen: watermelon "edit profile" bloğu — solda form, sağda canlı önizleme.
                   Yazdıkça sağdaki kart güncellenir; kaydetmeden nasıl görüneceği belli olur. */
                <form
                  onSubmit={handleProfile((d) => profileMutation.mutate(d))}
                  className="flex flex-col gap-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 md:flex-row"
                >
                  <div className="flex-1 space-y-4 p-5">
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400">Ad Soyad</label>
                      <input
                        {...profileReg('name')}
                        className="w-full rounded-xl border-[1.5px] border-zinc-200 bg-white px-4 py-2.5 text-[15px] font-semibold text-zinc-900 outline-none transition-all focus:border-blue-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-blue-500"
                      />
                      {profileErrors.name && <p className="text-xs text-red-500">{profileErrors.name.message}</p>}
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400">E-posta</label>
                      <input
                        {...profileReg('email')}
                        type="email"
                        className="w-full rounded-xl border-[1.5px] border-zinc-200 bg-white px-4 py-2.5 text-[15px] font-semibold text-zinc-900 outline-none transition-all focus:border-blue-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-blue-500"
                      />
                      {profileErrors.email && <p className="text-xs text-red-500">{profileErrors.email.message}</p>}
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400">Telefon</label>
                      <input
                        {...profileReg('phone')}
                        className="w-full rounded-xl border-[1.5px] border-zinc-200 bg-white px-4 py-2.5 text-[15px] font-semibold text-zinc-900 outline-none transition-all focus:border-blue-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-blue-500"
                      />
                    </div>

                    <div className="flex items-center justify-between gap-3 pt-2">
                      <span className="text-[13px] text-zinc-500">
                        {user?.roles?.[0]?.name ? <>Rol: <span className="font-medium">{user.roles[0].name}</span></> : null}
                      </span>
                      <button
                        type="submit"
                        disabled={!profileDirty || profileMutation.isPending}
                        className="flex items-center gap-2 rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                      >
                        {profileMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Kaydet
                      </button>
                    </div>
                  </div>

                  <div className="w-full border-t border-dashed border-zinc-200 md:h-auto md:w-px md:border-l md:border-t-0 dark:border-zinc-700" />

                  <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
                    <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Önizleme</span>
                    {user?.avatar_url ? (
                      <img
                        src={user.avatar_url}
                        alt={preview.name || 'Profil'}
                        className="h-28 w-28 rounded-full object-cover ring-1 ring-zinc-200 dark:ring-zinc-700"
                      />
                    ) : (
                      <div className="flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-violet-600 text-3xl font-bold text-white">
                        {(preview.name || '?').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <h3 className="text-center text-lg font-bold text-zinc-900 dark:text-zinc-100">
                      {preview.name || 'Ad Soyad'}
                    </h3>
                    <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
                      {preview.email || 'e-posta yok'}
                    </p>
                    {preview.phone && (
                      <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                        {preview.phone}
                      </span>
                    )}
                  </div>
                </form>
              )}

              {activeTab === 'security' && (
                <div className="space-y-6 max-w-md">
                  <form onSubmit={handlePass((d) => passwordMutation.mutate(d))} className="space-y-4">
                    <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                      <Lock className="h-4 w-4 text-zinc-400" /> Şifre Değiştir
                    </h4>
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">Mevcut Şifre</label>
                      <input
                        {...passReg('current_password')}
                        type="password"
                        className="w-full px-4 py-2 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      {passErrors.current_password && <p className="text-xs text-red-500 mt-1">{passErrors.current_password.message}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">Yeni Şifre</label>
                      <input
                        {...passReg('password')}
                        type="password"
                        className="w-full px-4 py-2 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      {passErrors.password && <p className="text-xs text-red-500 mt-1">{passErrors.password.message}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">Şifre Tekrar</label>
                      <input
                        {...passReg('password_confirmation')}
                        type="password"
                        className="w-full px-4 py-2 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      {passErrors.password_confirmation && <p className="text-xs text-red-500 mt-1">{passErrors.password_confirmation.message}</p>}
                    </div>
                    <button
                      type="submit"
                      disabled={passwordMutation.isPending}
                      className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      {passwordMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                      Şifreyi Güncelle
                    </button>
                  </form>

                  <div className="border-t border-zinc-200 dark:border-zinc-800 pt-5">
                    <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2 mb-3">
                      <Shield className="h-4 w-4 text-zinc-400" /> İki Faktörlü Doğrulama
                    </h4>
                    <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                      <div>
                        <p className="text-sm text-zinc-700 dark:text-zinc-300">2FA Durumu</p>
                        <p className="text-xs text-zinc-400">Hesabınızı ekstra güvenlik katmanı ile koruyun.</p>
                      </div>
                      <span className="text-xs text-zinc-400 bg-zinc-200 dark:bg-zinc-700 px-3 py-1 rounded-full">
                        Pasif
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'sessions' && (
                <div className="space-y-3 max-w-lg">
                  <p className="text-sm text-zinc-500 mb-4">Aktif oturumlarınızı görüntüleyin ve yönetin.</p>
                  {[
                    { device: 'Chrome — macOS', ip: '192.168.1.1', current: true, last_active: new Date().toISOString() },
                    { device: 'Safari — iPhone', ip: '10.0.0.5', current: false, last_active: new Date(Date.now() - 86400000).toISOString() },
                  ].map((session, i) => (
                    <div key={i} className="flex items-center gap-3 p-4 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                      <Monitor className="h-5 w-5 text-zinc-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{session.device}</p>
                          {session.current && (
                            <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 px-2 py-0.5 rounded-full font-medium">
                              Bu Oturum
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-400">{session.ip} · {formatDateTime(session.last_active)}</p>
                      </div>
                      {!session.current && (
                        <button className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/50 text-zinc-400 hover:text-red-600 transition-colors">
                          <LogOut className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
