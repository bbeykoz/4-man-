'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, Check, CheckCheck, Trash2, Send, X } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/common/PageHeader'
import { get, patch, post, del } from '@/lib/api'
import { timeAgo } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { ROLE_LEVELS } from '@/lib/constants'
import type { Notification } from '@/types/api.types'

const typeColors: Record<string, string> = {
  info:    'bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400',
  success: 'bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400',
  warning: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-950 dark:text-yellow-400',
  error:   'bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400',
}

const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500'

const emptyBroadcast = { target: 'all', company_id: '', user_id: '', title: '', message: '', type: 'info' }

export default function NotificationsPage() {
  const qc = useQueryClient()
  const { roleLevel } = useAuthStore()
  const isSuperAdmin = roleLevel === ROLE_LEVELS.SUPER_ADMIN

  const [broadcastOpen, setBroadcastOpen] = useState(false)
  const [form, setForm] = useState(emptyBroadcast)

  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => get<any>('/notifications').then((r) => r),
  })

  // Şirket listesi (sadece süper admin ve hedef=company ise)
  const { data: companiesData } = useQuery({
    queryKey: ['sa-companies-notify'],
    queryFn: () => get<any>('/admin/companies?per_page=100'),
    enabled: isSuperAdmin && broadcastOpen && form.target === 'company',
  })
  const companies: { id: string; name: string }[] = companiesData?.data ?? []

  // Kullanıcı listesi (sadece süper admin ve hedef=user ise)
  const { data: usersData } = useQuery({
    queryKey: ['sa-users-notify'],
    queryFn: () => get<any>('/admin/users?per_page=100'),
    enabled: isSuperAdmin && broadcastOpen && form.target === 'user',
  })
  const users: { id: string; name: string; email: string }[] = usersData?.data ?? []

  const markReadMutation = useMutation({
    mutationFn: (id: string) => patch(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const markAllMutation = useMutation({
    mutationFn: () => post('/notifications/mark-all-read'),
    onSuccess: () => {
      toast.success('Tüm bildirimler okundu.')
      qc.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => del(`/notifications/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const broadcastMutation = useMutation({
    mutationFn: (data: typeof emptyBroadcast) => post('/admin/notifications/broadcast', data),
    onSuccess: (res: any) => {
      toast.success(res?.message ?? 'Bildirimler gönderildi.')
      setBroadcastOpen(false)
      setForm(emptyBroadcast)
    },
    onError: (e: any) => toast.error(e?.message ?? 'Gönderim başarısız.'),
  })

  const notifications: Notification[] = data?.data ?? []
  const unreadCount = notifications.filter((n) => !n.read_at).length

  const canSend = form.title.trim() && form.message.trim() &&
    (form.target !== 'company' || form.company_id) &&
    (form.target !== 'user' || form.user_id)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Bildirimler"
        description={unreadCount > 0 ? `${unreadCount} okunmamış bildirim` : 'Tüm bildirimler okundu'}
        breadcrumbs={[{ label: 'Bildirimler' }]}
        actions={
          <div className="flex items-center gap-2">
            {isSuperAdmin && (
              <button
                onClick={() => setBroadcastOpen(true)}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                <Send className="h-4 w-4" />
                Bildirim Gönder
              </button>
            )}
            {unreadCount > 0 && (
              <button
                onClick={() => markAllMutation.mutate()}
                disabled={markAllMutation.isPending}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                <CheckCheck className="h-4 w-4" />
                Tümünü Oku
              </button>
            )}
          </div>
        }
      />

      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden">
        {isLoading ? (
          <div className="space-y-0">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-4 flex gap-3 animate-pulse">
                <div className="w-10 h-10 rounded-full bg-zinc-200 dark:bg-zinc-700 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-3/4 bg-zinc-200 dark:bg-zinc-700 rounded" />
                  <div className="h-3 w-1/2 bg-zinc-200 dark:bg-zinc-700 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="py-16 text-center">
            <Bell className="h-10 w-10 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
            <p className="text-zinc-500 text-sm">Henüz bildirim yok</p>
          </div>
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              className={cn(
                'flex items-start gap-3 p-4 transition-colors',
                !n.read_at ? 'bg-blue-50/50 dark:bg-blue-950/10' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
              )}
            >
              <div className={cn('w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm', typeColors[n.type] ?? typeColors.info)}>
                <Bell className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className={cn('text-sm font-medium', !n.read_at ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-700 dark:text-zinc-300')}>
                      {n.title}
                    </p>
                    {n.body && <p className="text-sm text-zinc-500 mt-0.5">{n.body}</p>}
                    <p className="text-xs text-zinc-400 mt-1">{timeAgo(n.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {!n.read_at && (
                      <button onClick={() => markReadMutation.mutate(n.id)} title="Okundu işaretle"
                        className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-400 hover:text-green-600 transition-colors">
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button onClick={() => deleteMutation.mutate(n.id)} title="Sil"
                      className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/50 text-zinc-400 hover:text-red-500 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
              {!n.read_at && <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-2" />}
            </div>
          ))
        )}
      </div>

      {/* Broadcast Modal */}
      {broadcastOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setBroadcastOpen(false)} />
          <div className="relative z-10 w-full max-w-md mx-4 bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Bildirim Gönder</h3>
              <button onClick={() => setBroadcastOpen(false)} className="text-zinc-400 hover:text-zinc-600 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Hedef */}
              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Hedef Kitle</label>
                <select
                  value={form.target}
                  onChange={(e) => setForm(f => ({ ...f, target: e.target.value, company_id: '', user_id: '' }))}
                  className={inputCls}
                >
                  <option value="all">Tüm Kullanıcılar</option>
                  <option value="owners">Şirket Sahipleri</option>
                  <option value="company">Belirli Şirket</option>
                  <option value="user">Belirli Kullanıcı</option>
                </select>
              </div>

              {/* Şirket seçimi */}
              {form.target === 'company' && (
                <div>
                  <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Şirket <span className="text-red-500">*</span></label>
                  <select
                    value={form.company_id}
                    onChange={(e) => setForm(f => ({ ...f, company_id: e.target.value }))}
                    className={inputCls}
                  >
                    <option value="">— Şirket Seçin —</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Kullanıcı seçimi */}
              {form.target === 'user' && (
                <div>
                  <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Kullanıcı <span className="text-red-500">*</span></label>
                  <select
                    value={form.user_id}
                    onChange={(e) => setForm(f => ({ ...f, user_id: e.target.value }))}
                    className={inputCls}
                  >
                    <option value="">— Kullanıcı Seçin —</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Tür */}
              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Bildirim Türü</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm(f => ({ ...f, type: e.target.value }))}
                  className={inputCls}
                >
                  <option value="info">Bilgi</option>
                  <option value="success">Başarı</option>
                  <option value="warning">Uyarı</option>
                  <option value="error">Hata</option>
                </select>
              </div>

              {/* Başlık */}
              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Başlık <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Bildirim başlığı"
                  className={inputCls}
                />
              </div>

              {/* Mesaj */}
              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Mesaj <span className="text-red-500">*</span></label>
                <textarea
                  value={form.message}
                  onChange={(e) => setForm(f => ({ ...f, message: e.target.value }))}
                  placeholder="Bildirim mesajı..."
                  rows={3}
                  className={`${inputCls} resize-none`}
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setBroadcastOpen(false)}
                disabled={broadcastMutation.isPending}
                className="flex-1 px-4 py-2 text-sm font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
              >
                İptal
              </button>
              <button
                onClick={() => broadcastMutation.mutate(form)}
                disabled={broadcastMutation.isPending || !canSend}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                {broadcastMutation.isPending ? 'Gönderiliyor...' : 'Gönder'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
