'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Save, Loader2, Settings, Shield, Mail, Database } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { get, put } from '@/lib/api'

export default function SuperAdminSettingsPage() {
  const [activeTab, setActiveTab] = useState<'general' | 'security' | 'email' | 'maintenance'>('general')
  const [securityToggles, setSecurityToggles] = useState<Record<string, boolean>>({
    force_2fa: true,
    brute_force_protection: true,
    session_logging: true,
    api_rate_limiting: true,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['sa-settings'],
    queryFn: () => get<any>('/settings'),
  })

  const updateMutation = useMutation({
    mutationFn: (values: Record<string, any>) => put('/settings', { settings: values }),
    onSuccess: () => toast.success('Sistem ayarları güncellendi.'),
    onError: (e: any) => toast.error(e?.message),
  })

  const settings = data?.data ?? {}

  // Sync security toggles from fetched settings (response is grouped by group)
  useEffect(() => {
    if (!data) return
    // Flatten grouped structure: { general: [{key, value}], security: [...] }
    const flat: Record<string, any> = {}
    Object.values(data.data ?? {}).flat().forEach((s: any) => {
      flat[s.key] = s.value
    })
    setSecurityToggles({
      force_2fa:              flat.force_2fa              !== false,
      brute_force_protection: flat.brute_force_protection !== false,
      session_logging:        flat.session_logging        !== false,
      api_rate_limiting:      flat.api_rate_limiting      !== false,
    })
  }, [data])

  const tabs = [
    { key: 'general', label: 'Genel', icon: Settings },
    { key: 'security', label: 'Güvenlik', icon: Shield },
    { key: 'email', label: 'E-posta', icon: Mail },
    { key: 'maintenance', label: 'Bakım', icon: Database },
  ] as const

  return (
    <div className="space-y-5">
      <PageHeader
        title="Sistem Ayarları"
        description="Global sistem konfigürasyonu"
        breadcrumbs={[{ label: 'Süper Admin' }, { label: 'Ayarlar' }]}
      />

      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
        <div className="border-b border-zinc-200 dark:border-zinc-800 px-5">
          <nav className="flex gap-1 -mb-px">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                }`}
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-zinc-100 dark:bg-zinc-800 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              {activeTab === 'general' && (
                <div className="space-y-5 max-w-lg">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                      Uygulama Adı
                    </label>
                    <input
                      defaultValue={settings.app_name ?? 'BytePanel'}
                      className="w-full px-4 py-2 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                      Destek E-postası
                    </label>
                    <input
                      type="email"
                      defaultValue={settings.support_email ?? 'support@bytepanel.com'}
                      className="w-full px-4 py-2 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                      Varsayılan Plan
                    </label>
                    <select
                      defaultValue={settings.default_plan ?? 'basic'}
                      className="w-full px-4 py-2 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="basic">Basic</option>
                      <option value="pro">Pro</option>
                      <option value="enterprise">Enterprise</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-3 p-4 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Kayıt İzni</p>
                      <p className="text-xs text-zinc-500">Yeni şirket kaydına izin ver</p>
                    </div>
                    <label className="relative ml-auto cursor-pointer">
                      <input type="checkbox" defaultChecked={settings.registration_enabled !== false} className="sr-only peer" />
                      <div className="w-10 h-5 bg-zinc-300 peer-checked:bg-blue-600 rounded-full transition-colors" />
                      <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5 shadow" />
                    </label>
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={() => updateMutation.mutate({})}
                      disabled={updateMutation.isPending}
                      className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Kaydet
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'security' && (
                <div className="space-y-4 max-w-lg">
                  {[
                    { key: 'force_2fa',              label: 'Global 2FA Zorunluluğu', desc: 'Tüm kullanıcılar için 2FA zorla' },
                    { key: 'brute_force_protection', label: 'Brute Force Koruması',   desc: '5 başarısız girişte hesap kilitleme' },
                    { key: 'session_logging',        label: 'Oturum Loglama',         desc: 'Tüm oturum aktivitelerini kaydet' },
                    { key: 'api_rate_limiting',      label: 'API Hız Sınırı',         desc: 'API isteklerini dakikada 60 ile sınırla' },
                  ].map((item) => (
                    <div key={item.key} className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{item.label}</p>
                        <p className="text-xs text-zinc-500">{item.desc}</p>
                      </div>
                      <label className="relative cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!securityToggles[item.key]}
                          onChange={(e) => setSecurityToggles(prev => ({ ...prev, [item.key]: e.target.checked }))}
                          className="sr-only peer"
                        />
                        <div className="w-10 h-5 bg-zinc-300 peer-checked:bg-blue-600 rounded-full transition-colors" />
                        <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5 shadow" />
                      </label>
                    </div>
                  ))}
                  <div className="flex justify-end">
                    <button
                      onClick={() => updateMutation.mutate(securityToggles)}
                      disabled={updateMutation.isPending}
                      className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Kaydet
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'email' && (
                <div className="space-y-5 max-w-lg">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">SMTP Host</label>
                      <input defaultValue={settings.mail_host ?? 'smtp.mailtrap.io'} className="w-full px-4 py-2 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-zinc-900 dark:text-zinc-100" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">Port</label>
                      <input defaultValue={settings.mail_port ?? '587'} className="w-full px-4 py-2 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-zinc-900 dark:text-zinc-100" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">Gönderen Adres</label>
                    <input type="email" defaultValue={settings.mail_from ?? 'noreply@bytepanel.com'} className="w-full px-4 py-2 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-zinc-900 dark:text-zinc-100" />
                  </div>
                </div>
              )}

              {activeTab === 'maintenance' && (
                <div className="space-y-4 max-w-lg">
                  <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-400">Bakım Modu</p>
                    <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5 mb-3">Aktifleştirildiğinde kullanıcılar sisteme erişemez.</p>
                    <button className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-sm rounded-lg transition-colors">
                      Bakım Modunu Etkinleştir
                    </button>
                  </div>
                  <div className="p-4 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Önbellek Temizle</p>
                    <p className="text-xs text-zinc-500 mt-0.5 mb-3">Redis ve uygulama önbelleğini temizle.</p>
                    <button
                      onClick={() => toast.success('Önbellek temizlendi.')}
                      className="px-4 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white text-sm rounded-lg transition-colors"
                    >
                      Temizle
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
