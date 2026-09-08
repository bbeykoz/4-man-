'use client'

import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Building2, Mail, Phone, Globe, Save, Loader2 } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { get, put } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'

const schema = z.object({
  name: z.string().min(2, 'Şirket adı en az 2 karakter olmalı.'),
  email: z.string().email('Geçerli bir e-posta girin.'),
  phone: z.string().optional(),
  website: z.string().url('Geçerli bir URL girin.').optional().or(z.literal('')),
  address: z.string().optional(),
  tax_number: z.string().optional(),
})

type FormData = z.infer<typeof schema>

export default function CompanySettingsPage() {
  const { company } = useAuthStore()
  const [activeTab, setActiveTab] = useState<'general' | 'security' | 'notifications'>('general')

  const { data, isLoading } = useQuery({
    queryKey: ['company-settings'],
    queryFn: () => get<any>('/company/settings'),
  })

  const { register, handleSubmit, formState: { errors, isDirty } } = useForm<FormData>({
    resolver: zodResolver(schema),
    values: data?.data ?? {},
  })

  const updateMutation = useMutation({
    mutationFn: (values: FormData) => put('/company/settings', values),
    onSuccess: () => toast.success('Ayarlar kaydedildi.'),
    onError: (e: any) => toast.error(e?.message),
  })

  const tabs = [
    { key: 'general', label: 'Genel' },
    { key: 'security', label: 'Güvenlik' },
    { key: 'notifications', label: 'Bildirimler' },
  ] as const

  return (
    <div className="space-y-5">
      <PageHeader
        title="Şirket Ayarları"
        description="Şirket bilgilerini ve tercihlerini düzenleyin"
        breadcrumbs={[{ label: 'Şirket' }, { label: 'Ayarlar' }]}
      />

      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
        {/* Tabs */}
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
          {activeTab === 'general' && (
            <form onSubmit={handleSubmit((d) => updateMutation.mutate(d))} className="space-y-5 max-w-lg">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Şirket Adı
                </label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                  <input
                    {...register('name')}
                    className="w-full pl-10 pr-4 py-2 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                  E-posta
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                  <input
                    {...register('email')}
                    type="email"
                    className="w-full pl-10 pr-4 py-2 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email.message}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Telefon
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                    <input
                      {...register('phone')}
                      className="w-full pl-10 pr-4 py-2 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Vergi No
                  </label>
                  <input
                    {...register('tax_number')}
                    className="w-full px-4 py-2 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Web Sitesi
                </label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                  <input
                    {...register('website')}
                    placeholder="https://"
                    className="w-full pl-10 pr-4 py-2 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {errors.website && <p className="text-xs text-red-500 mt-1">{errors.website.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Adres
                </label>
                <textarea
                  {...register('address')}
                  rows={3}
                  className="w-full px-4 py-2 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={!isDirty || updateMutation.isPending}
                  className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {updateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Kaydet
                </button>
              </div>
            </form>
          )}

          {activeTab === 'security' && (
            <div className="max-w-lg space-y-6">
              <div className="p-4 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1">İki Faktörlü Doğrulama</h4>
                <p className="text-xs text-zinc-500 mb-3">Şirket geneli 2FA zorunluluğu ayarı.</p>
                <label className="flex items-center gap-3 cursor-pointer">
                  <div className="relative">
                    <input type="checkbox" className="sr-only peer" />
                    <div className="w-11 h-6 bg-zinc-300 peer-checked:bg-blue-600 rounded-full transition-colors" />
                    <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full transition-transform peer-checked:translate-x-5 shadow" />
                  </div>
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">Tüm kullanıcılar için 2FA zorunlu</span>
                </label>
              </div>

              <div className="p-4 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Oturum Süresi</h4>
                <p className="text-xs text-zinc-500 mb-3">Kullanıcı oturumlarının sona erme süresi.</p>
                <select defaultValue="30" className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="1">1 gün</option>
                  <option value="7">7 gün</option>
                  <option value="30">30 gün</option>
                  <option value="90">90 gün</option>
                </select>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="max-w-lg space-y-4">
              {[
                { key: 'new_record', label: 'Yeni kayıt oluşturulduğunda', desc: 'Yeni kayıt bildirim e-postası' },
                { key: 'record_updated', label: 'Kayıt güncellendiğinde', desc: 'Kayıt güncelleme bildirimi' },
                { key: 'weekly_report', label: 'Haftalık rapor', desc: 'Haftalık özet raporu e-postası' },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{item.label}</p>
                    <p className="text-xs text-zinc-500">{item.desc}</p>
                  </div>
                  <label className="relative cursor-pointer">
                    <input type="checkbox" className="sr-only peer" defaultChecked />
                    <div className="w-10 h-5 bg-zinc-300 peer-checked:bg-blue-600 rounded-full transition-colors" />
                    <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5 shadow" />
                  </label>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
