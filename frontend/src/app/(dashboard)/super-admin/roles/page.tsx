'use client'

// Platform rolleri: ekip üyelerinin neye erişebileceğini tek tek belirler.
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Loader2, Plus, ShieldCheck, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/common/PageHeader'
import { ConfirmModal } from '@/components/common/ConfirmModal'
import { SaveButton } from '@/components/common/SaveButton'
import { del, get, patch, post } from '@/lib/api'
import { cn } from '@/lib/utils'

interface PlatformRole {
  id: string
  slug: string
  display_name: string
  description?: string | null
  color?: string | null
  is_super: boolean
  is_system: boolean
  users_count: number
  permissions: string[]
}

interface PermissionItem {
  id: string
  name: string
  display_name: string
  group: string
}

const GROUP_LABELS: Record<string, string> = {
  platform: 'Platform yönetimi',
  system: 'Sistem',
  company: 'Şirket',
  company_mgmt: 'Şirket yönetimi',
}

function apiMessage(e: unknown, fallback: string) {
  const err = e as { message?: string; errors?: Record<string, string[]> }
  const first = err?.errors ? Object.values(err.errors)[0]?.[0] : undefined
  return first ?? err?.message ?? fallback
}

export default function PlatformRolesPage() {
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<string[]>([])
  const [showNew, setShowNew] = useState(false)
  const [newRole, setNewRole] = useState({ display_name: '', description: '' })
  const [deleteTarget, setDeleteTarget] = useState<PlatformRole | null>(null)

  const { data: roles, isLoading } = useQuery({
    queryKey: ['platform-roles'],
    queryFn: () => get<{ data: PlatformRole[] }>('/admin/platform-roles').then(r => r.data),
  })

  const { data: permissionGroups } = useQuery({
    queryKey: ['platform-permissions'],
    queryFn: () => get<{ data: Record<string, PermissionItem[]> }>('/admin/platform-roles/permissions').then(r => r.data),
  })

  const selected = useMemo(
    () => (roles ?? []).find(r => r.id === selectedId) ?? (roles ?? [])[0] ?? null,
    [roles, selectedId],
  )

  // Seçili rol veya izinleri değişince taslak listeyi yenile
  const selectedKey = selected ? `${selected.id}:${selected.permissions.slice().sort().join(',')}` : ''
  const [loadedKey, setLoadedKey] = useState('')

  if (selected && selectedKey !== loadedKey) {
    setLoadedKey(selectedKey)
    setDraft(selected.permissions)
  }

  const saveMutation = useMutation({
    mutationFn: () => patch(`/admin/platform-roles/${selected!.id}`, { permissions: draft }),
    onSuccess: () => {
      toast.success('İzinler kaydedildi.')
      qc.invalidateQueries({ queryKey: ['platform-roles'] })
    },
    onError: (e) => toast.error(apiMessage(e, 'Kaydedilemedi.')),
  })

  const createMutation = useMutation({
    mutationFn: () => post('/admin/platform-roles', { ...newRole, permissions: [] }),
    onSuccess: () => {
      toast.success('Rol oluşturuldu.')
      setShowNew(false)
      setNewRole({ display_name: '', description: '' })
      qc.invalidateQueries({ queryKey: ['platform-roles'] })
    },
    onError: (e) => toast.error(apiMessage(e, 'Oluşturulamadı.')),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => del(`/admin/platform-roles/${id}`),
    onSuccess: () => {
      toast.success('Rol silindi.')
      setDeleteTarget(null)
      setSelectedId(null)
      qc.invalidateQueries({ queryKey: ['platform-roles'] })
    },
    onError: (e) => { toast.error(apiMessage(e, 'Silinemedi.')); setDeleteTarget(null) },
  })

  const toggle = (name: string) =>
    setDraft(d => (d.includes(name) ? d.filter(p => p !== name) : [...d, name]))

  const dirty = selected ? draft.slice().sort().join(',') !== selected.permissions.slice().sort().join(',') : false

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ekip rolleri"
        description="Hangi rolün neye erişeceğini buradan belirlersin"
        breadcrumbs={[{ label: 'Ekip rolleri' }]}
        actions={
          <button
            onClick={() => setShowNew(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" /> Yeni rol
          </button>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-zinc-400" /></div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          {/* Rol listesi */}
          <div className="space-y-2">
            {(roles ?? []).map(role => (
              <button
                key={role.id}
                onClick={() => setSelectedId(role.id)}
                className={cn(
                  'flex w-full items-start gap-2 rounded-xl border p-3 text-left transition-colors',
                  selected?.id === role.id
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40'
                    : 'border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/60',
                )}
              >
                <ShieldCheck className={cn('mt-0.5 h-4 w-4 shrink-0', role.is_super ? 'text-red-500' : 'text-blue-500')} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {role.display_name}
                  </span>
                  <span className="block text-xs text-zinc-500">
                    {role.is_super ? 'Sınırsız yetki' : `${role.permissions.length} izin`} · {role.users_count} kişi
                  </span>
                </span>
              </button>
            ))}
          </div>

          {/* İzin matrisi */}
          <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            {!selected ? (
              <p className="py-10 text-center text-sm text-zinc-500">Soldan bir rol seçin.</p>
            ) : selected.is_super ? (
              <div className="py-10 text-center">
                <ShieldCheck className="mx-auto h-8 w-8 text-red-500" />
                <p className="mt-3 text-sm font-medium text-zinc-900 dark:text-zinc-100">Süper admin rolü</p>
                <p className="mt-1 text-sm text-zinc-500">
                  Bu rol her şeye erişir ve değiştirilemez. Kısıtlı yetki için yeni bir rol oluşturun.
                </p>
              </div>
            ) : (
              <>
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{selected.display_name}</h2>
                    {selected.description && <p className="mt-1 text-sm text-zinc-500">{selected.description}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {!selected.is_system && (
                      <button
                        onClick={() => setDeleteTarget(selected)}
                        className="rounded-lg border border-zinc-200 p-2 text-zinc-400 hover:text-red-600 dark:border-zinc-700"
                        title="Rolü sil"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                    <SaveButton
                      size="sm"
                      idleText="Kaydet"
                      savedText="Kaydedildi"
                      disabled={!dirty}
                      onSave={() => saveMutation.mutateAsync()}
                    />
                  </div>
                </div>

                <div className="space-y-5">
                  {Object.entries(permissionGroups ?? {}).map(([group, items]) => (
                    <div key={group}>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                        {GROUP_LABELS[group] ?? group}
                      </p>
                      <div className="grid gap-1.5 sm:grid-cols-2">
                        {items.map(perm => {
                          const on = draft.includes(perm.name)
                          return (
                            <button
                              key={perm.id}
                              onClick={() => toggle(perm.name)}
                              className={cn(
                                'flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                                on
                                  ? 'border-blue-500 bg-blue-50 text-zinc-900 dark:bg-blue-950/40 dark:text-zinc-100'
                                  : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800/60',
                              )}
                            >
                              <span className="min-w-0">
                                <span className="block truncate">{perm.display_name}</span>
                                <span className="block truncate text-xs text-zinc-400">{perm.name}</span>
                              </span>
                              <span
                                className={cn(
                                  'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
                                  on ? 'border-blue-600 bg-blue-600' : 'border-zinc-300 dark:border-zinc-600',
                                )}
                              >
                                {on && <Check className="h-2.5 w-2.5 text-white" strokeWidth={4} />}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Yeni rol */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl dark:bg-zinc-900">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Yeni rol</h2>
              <button onClick={() => setShowNew(false)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Rol adı</label>
                <input
                  value={newRole.display_name}
                  onChange={e => setNewRole(r => ({ ...r, display_name: e.target.value }))}
                  placeholder="Örnek: Muhasebe Ekibi"
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Açıklama</label>
                <input
                  value={newRole.description}
                  onChange={e => setNewRole(r => ({ ...r, description: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                />
              </div>
              <p className="text-xs text-zinc-500">Rol boş izinle oluşur; ardından izinleri işaretleyip kaydedersin.</p>
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setShowNew(false)}
                className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
              >
                Vazgeç
              </button>
              <SaveButton size="sm" idleText="Oluştur" savedText="Oluşturuldu" onSave={() => createMutation.mutateAsync()} />
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title={`${deleteTarget?.display_name ?? ''} silinsin mi?`}
        description="Rolde ekip üyesi varsa silinmez; önce onları başka role taşıyın."
        confirmLabel="Sil"
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
