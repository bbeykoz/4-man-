'use client'

// Platform ekibi: hizmeti veren tarafın kendi çalışanları ve yetkileri.
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Plus, ShieldCheck, Trash2, UserCog, X } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/common/PageHeader'
import { ConfirmModal } from '@/components/common/ConfirmModal'
import { SaveButton } from '@/components/common/SaveButton'
import { del, get, patch, post } from '@/lib/api'
import { cn, formatDate } from '@/lib/utils'

interface PlatformRole {
  id: string
  slug: string
  display_name: string
  description?: string | null
  color?: string | null
  is_super: boolean
  users_count: number
  permissions: string[]
}

interface TeamMember {
  id: string
  name: string
  email: string
  status: string
  status_label?: string
  created_at?: string
  roles?: { id: string; display_name: string; color?: string | null }[]
}

const emptyForm = { name: '', email: '', password: '', role_id: '' }

function apiMessage(e: unknown, fallback: string) {
  const err = e as { message?: string; errors?: Record<string, string[]> }
  const first = err?.errors ? Object.values(err.errors)[0]?.[0] : undefined
  return first ?? err?.message ?? fallback
}

export default function PlatformTeamPage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [deleteTarget, setDeleteTarget] = useState<TeamMember | null>(null)

  const { data: team, isLoading } = useQuery({
    queryKey: ['platform-team'],
    queryFn: () => get<{ data: TeamMember[] }>('/admin/team').then(r => r.data),
  })

  const { data: roles } = useQuery({
    queryKey: ['platform-roles'],
    queryFn: () => get<{ data: PlatformRole[] }>('/admin/platform-roles').then(r => r.data),
  })

  const assignableRoles = (roles ?? []).filter(r => !r.is_super)

  const createMutation = useMutation({
    mutationFn: () => post('/admin/team', form),
    onSuccess: () => {
      toast.success('Ekip üyesi eklendi.')
      setShowForm(false)
      setForm(emptyForm)
      qc.invalidateQueries({ queryKey: ['platform-team'] })
      qc.invalidateQueries({ queryKey: ['platform-roles'] })
    },
    onError: (e) => toast.error(apiMessage(e, 'Eklenemedi.')),
  })

  const roleMutation = useMutation({
    mutationFn: ({ id, roleId }: { id: string; roleId: string }) =>
      patch(`/admin/team/${id}`, { role_id: roleId }),
    onSuccess: () => {
      toast.success('Rol güncellendi.')
      qc.invalidateQueries({ queryKey: ['platform-team'] })
      qc.invalidateQueries({ queryKey: ['platform-roles'] })
    },
    onError: (e) => toast.error(apiMessage(e, 'Güncellenemedi.')),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      patch(`/admin/team/${id}`, { status }),
    onSuccess: () => {
      toast.success('Durum güncellendi.')
      qc.invalidateQueries({ queryKey: ['platform-team'] })
    },
    onError: (e) => toast.error(apiMessage(e, 'Güncellenemedi.')),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => del(`/admin/team/${id}`),
    onSuccess: () => {
      toast.success('Ekip üyesi silindi.')
      setDeleteTarget(null)
      qc.invalidateQueries({ queryKey: ['platform-team'] })
    },
    onError: (e) => { toast.error(apiMessage(e, 'Silinemedi.')); setDeleteTarget(null) },
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ekibim"
        description="Kendi çalışanların ve panel yetkileri"
        breadcrumbs={[{ label: 'Ekibim' }]}
        actions={
          <button
            onClick={() => { setShowForm(true); setForm({ ...emptyForm, role_id: assignableRoles[0]?.id ?? '' }) }}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" /> Ekip üyesi ekle
          </button>
        }
      />

      {/* Roller özeti */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(roles ?? []).map(role => (
          <div key={role.id} className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center gap-2">
              {role.is_super ? (
                <ShieldCheck className="h-4 w-4 text-red-500" />
              ) : (
                <UserCog className="h-4 w-4 text-blue-500" />
              )}
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{role.display_name}</p>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              {role.is_super ? 'Sınırsız yetki' : `${role.permissions.length} izin`} · {role.users_count} kişi
            </p>
          </div>
        ))}
      </div>

      {/* Ekip listesi */}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-zinc-400" /></div>
        ) : (team ?? []).length === 0 ? (
          <p className="py-12 text-center text-sm text-zinc-500">Henüz ekip üyesi yok.</p>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {(team ?? []).map(member => {
              const role = member.roles?.[0]
              const isSuper = (roles ?? []).some(r => r.is_super && r.id === role?.id)

              return (
                <div key={member.id} className={cn('flex flex-wrap items-center gap-3 px-5 py-3', member.status !== 'active' && 'opacity-60')}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{member.name}</p>
                      {/* Rozet rolün kendi adını gösterir: Destek Ekibi, Satış Ekibi, Teknik Ekip… */}
                      <span
                        className={cn(
                          'rounded px-1.5 py-0.5 text-[10px] font-semibold',
                          isSuper
                            ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400'
                            : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
                        )}
                      >
                        {role?.display_name ?? 'Rolsüz'}
                      </span>
                      {member.status !== 'active' && (
                        <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-800">Pasif</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {member.email}
                      {member.created_at && <> · {formatDate(member.created_at)}</>}
                    </p>
                  </div>

                  {isSuper ? (
                    <span className="text-xs text-zinc-400">Rolü değiştirilemez</span>
                  ) : (
                    <>
                      <select
                        value={role?.id ?? ''}
                        onChange={e => roleMutation.mutate({ id: member.id, roleId: e.target.value })}
                        className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                      >
                        {assignableRoles.map(r => (
                          <option key={r.id} value={r.id}>{r.display_name}</option>
                        ))}
                      </select>

                      <button
                        onClick={() => statusMutation.mutate({ id: member.id, status: member.status === 'active' ? 'inactive' : 'active' })}
                        className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        {member.status === 'active' ? 'Pasife al' : 'Aktifleştir'}
                      </button>

                      <button
                        onClick={() => setDeleteTarget(member)}
                        className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                        title="Sil"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Yeni üye */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl dark:bg-zinc-900">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Ekip üyesi ekle</h2>
              <button onClick={() => setShowForm(false)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              {([
                { key: 'name', label: 'Ad soyad', type: 'text' },
                { key: 'email', label: 'E-posta', type: 'email' },
                { key: 'password', label: 'Şifre (en az 8 karakter)', type: 'password' },
              ] as const).map(field => (
                <div key={field.key}>
                  <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">{field.label}</label>
                  <input
                    type={field.type}
                    value={form[field.key]}
                    onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
                    className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                  />
                </div>
              ))}

              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Rol</label>
                <select
                  value={form.role_id}
                  onChange={e => setForm(f => ({ ...f, role_id: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                >
                  {assignableRoles.map(r => (
                    <option key={r.id} value={r.id}>{r.display_name}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-zinc-500">
                  {assignableRoles.find(r => r.id === form.role_id)?.description}
                </p>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
              >
                Vazgeç
              </button>
              <SaveButton size="sm" idleText="Ekle" savedText="Eklendi" onSave={() => createMutation.mutateAsync()} />
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title={`${deleteTarget?.name ?? ''} silinsin mi?`}
        description="Ekip üyesinin oturumları kapatılır ve panele erişimi biter."
        confirmLabel="Sil"
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
