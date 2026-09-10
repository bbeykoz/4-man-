'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createColumnHelper } from '@tanstack/react-table'
import { Plus, Pencil, Trash2, UserX, UserCheck, X, MoreHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable } from '@/components/common/DataTable'
import { FilterBar } from '@/components/common/FilterBar'
import { StatusBadge } from '@/components/common/StatusBadge'
import { ConfirmModal } from '@/components/common/ConfirmModal'
import { get, del, patch, post } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import type { User } from '@/types/auth.types'

const col = createColumnHelper<User>()
const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500'

const emptyForm = {
  name: '', email: '', password: '', phone: '', department_id: '', role_id: '', status: 'active',
}

type EditForm = { name: string; email: string; phone: string; department_id: string; role_id: string; status: string }

export default function CompanyUsersPage() {
  const qc = useQueryClient()
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [editUser, setEditUser] = useState<any | null>(null)
  const [editForm, setEditForm] = useState<EditForm>({ name: '', email: '', phone: '', department_id: '', role_id: '', status: 'active' })
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  const modalOpen = createOpen || !!editUser

  const { data, isLoading } = useQuery({
    queryKey: ['company-users', page, search, filters],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page + 1), per_page: '20', ...(search && { search }), ...filters })
      return get<any>(`/company/users?${params}`)
    },
  })

  const { data: deptsData } = useQuery({
    queryKey: ['company-departments-list'],
    queryFn: () => get<any>('/company/departments'),
    enabled: modalOpen,
  })

  const { data: rolesData } = useQuery({
    queryKey: ['company-roles-list'],
    queryFn: () => get<any>('/company/roles'),
    enabled: modalOpen,
  })

  const createMutation = useMutation({
    mutationFn: (data: typeof emptyForm) => post('/company/users', data),
    onSuccess: () => {
      toast.success('Kullanıcı oluşturuldu.')
      qc.invalidateQueries({ queryKey: ['company-users'] })
      setCreateOpen(false)
      setForm(emptyForm)
    },
    onError: (e: any) => toast.error(e?.message ?? 'Oluşturma başarısız.'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: EditForm }) => patch(`/company/users/${id}`, data),
    onSuccess: () => {
      toast.success('Kullanıcı güncellendi.')
      qc.invalidateQueries({ queryKey: ['company-users'] })
      setEditUser(null)
    },
    onError: (e: any) => toast.error(e?.message ?? 'Güncelleme başarısız.'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => del(`/company/users/${id}`),
    onSuccess: () => {
      toast.success('Kullanıcı silindi.')
      qc.invalidateQueries({ queryKey: ['company-users'] })
      setDeleteId(null)
    },
    onError: (e: any) => toast.error(e?.message),
  })

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => patch(`/company/users/${id}/deactivate`, {}),
    onSuccess: () => {
      toast.success('Kullanıcı devre dışı bırakıldı.')
      qc.invalidateQueries({ queryKey: ['company-users'] })
    },
    onError: (e: any) => toast.error(e?.message),
  })

  const activateMutation = useMutation({
    mutationFn: (id: string) => patch(`/company/users/${id}/activate`, {}),
    onSuccess: () => {
      toast.success('Kullanıcı aktifleştirildi.')
      qc.invalidateQueries({ queryKey: ['company-users'] })
    },
    onError: (e: any) => toast.error(e?.message),
  })

  function openEdit(u: any) {
    setEditUser(u)
    setEditForm({
      name: u.name ?? '',
      email: u.email ?? '',
      phone: u.phone ?? '',
      department_id: u.department?.id ?? '',
      role_id: u.roles?.[0]?.id ?? '',
      status: u.status ?? 'active',
    })
  }

  const columns = [
    col.accessor('name', {
      header: 'Kullanıcı',
      cell: (info) => {
        const u = info.row.original
        return (
          <div className="flex items-center gap-3">
            {u.avatar_url ? (
              <img src={u.avatar_url} alt={u.name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">{u.name?.charAt(0).toUpperCase()}</span>
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{u.name}</p>
              <p className="text-xs text-zinc-400">{u.email}</p>
            </div>
          </div>
        )
      },
    }),
    col.accessor('department' as any, {
      header: 'Departman',
      cell: (info) => {
        const dept = info.getValue() as any
        return dept ? <span className="text-sm text-zinc-600 dark:text-zinc-400">{dept.name}</span> : <span className="text-zinc-400 text-xs">—</span>
      },
    }),
    col.accessor('roles' as any, {
      header: 'Rol',
      cell: (info) => {
        const roles = info.getValue() as any[]
        if (!roles?.length) return <span className="text-zinc-400 text-xs">—</span>
        return (
          <div className="flex flex-wrap gap-1">
            {roles.slice(0, 2).map((r: any) => (
              <span key={r.id} className="inline-flex items-center px-2 py-0.5 rounded-md bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 text-xs font-medium">
                {r.name}
              </span>
            ))}
            {roles.length > 2 && <span className="text-xs text-zinc-400">+{roles.length - 2}</span>}
          </div>
        )
      },
    }),
    col.accessor('status' as any, {
      header: 'Durum',
      cell: (info) => <StatusBadge status={info.getValue()} />,
    }),
    col.accessor('created_at' as any, {
      header: 'Kayıt Tarihi',
      cell: (info) => <span className="text-sm text-zinc-500">{formatDate(info.getValue())}</span>,
    }),
    col.display({
      id: 'actions',
      header: '',
      cell: (info) => {
        const u = info.row.original
        return (
          <div className="flex items-center gap-1">
            <button
              title="Düzenle"
              onClick={() => openEdit(u)}
              className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-blue-600 transition-colors"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <div className="relative">
              <button
                title="Diğer"
                onClick={() => setOpenMenuId(openMenuId === u.id ? null : u.id)}
                className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 transition-colors"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {openMenuId === u.id && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                  <div className="absolute right-0 top-8 z-20 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-lg py-1 w-44">
                    {u.status === 'active' || u.status === 'inactive' ? (
                      u.status === 'active' ? (
                        <button
                          className="w-full px-3 py-1.5 text-sm text-left flex items-center gap-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-amber-600"
                          onClick={() => { setOpenMenuId(null); deactivateMutation.mutate(u.id) }}
                        >
                          <UserX className="h-3.5 w-3.5" />
                          Devre Dışı Bırak
                        </button>
                      ) : (
                        <button
                          className="w-full px-3 py-1.5 text-sm text-left flex items-center gap-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-green-600"
                          onClick={() => { setOpenMenuId(null); activateMutation.mutate(u.id) }}
                        >
                          <UserCheck className="h-3.5 w-3.5" />
                          Aktifleştir
                        </button>
                      )
                    ) : null}
                    <button
                      className="w-full px-3 py-1.5 text-sm text-left flex items-center gap-2 hover:bg-red-50 dark:hover:bg-red-950/50 text-red-600"
                      onClick={() => { setOpenMenuId(null); setDeleteId(u.id) }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Sil
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )
      },
    }),
  ]

  const sharedFormFields = (f: any, setF: any) => (
    <div className="space-y-4">
      <div className="col-span-2">
        <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Ad Soyad <span className="text-red-500">*</span></label>
        <input type="text" value={f.name} onChange={(e) => setF((p: any) => ({ ...p, name: e.target.value }))} placeholder="Örn: Ali Veli" className={inputCls} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">E-posta <span className="text-red-500">*</span></label>
          <input type="email" value={f.email} onChange={(e) => setF((p: any) => ({ ...p, email: e.target.value }))} placeholder="ali@sirket.com" className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Telefon</label>
          <input type="text" value={f.phone} onChange={(e) => setF((p: any) => ({ ...p, phone: e.target.value }))} placeholder="+90 500 000 00 00" className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Departman</label>
          <select value={f.department_id} onChange={(e) => setF((p: any) => ({ ...p, department_id: e.target.value }))} className={inputCls}>
            <option value="">Seç...</option>
            {deptsData?.data?.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Rol</label>
          <select value={f.role_id} onChange={(e) => setF((p: any) => ({ ...p, role_id: e.target.value }))} className={inputCls}>
            <option value="">Seç...</option>
            {rolesData?.data
              ?.filter((r: any) => !r.is_system || r.slug === 'company-owner')
              .map((r: any) => <option key={r.id} value={r.id}>{r.display_name ?? r.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Durum</label>
          <select value={f.status} onChange={(e) => setF((p: any) => ({ ...p, status: e.target.value }))} className={inputCls}>
            <option value="active">Aktif</option>
            <option value="inactive">Pasif</option>
          </select>
        </div>
      </div>
    </div>
  )

  return (
    <div className="space-y-5">
      <PageHeader
        title="Kullanıcılar"
        description="Şirket kullanıcılarını yönetin"
        breadcrumbs={[{ label: 'Şirket' }, { label: 'Kullanıcılar' }]}
        actions={
          <button onClick={() => setCreateOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
            <Plus className="h-4 w-4" />
            Yeni Kullanıcı
          </button>
        }
      />

      <FilterBar
        placeholder="İsim veya e-posta ara..."
        onSearch={setSearch}
        onFilterChange={setFilters}
        filters={[{ key: 'status', label: 'Durum', options: [{ value: 'active', label: 'Aktif' }, { value: 'inactive', label: 'Pasif' }, { value: 'suspended', label: 'Askıya Alındı' }] }]}
      />

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        total={data?.meta?.total ?? 0}
        pageIndex={page}
        onPaginationChange={(s) => setPage(s.pageIndex)}
        isLoading={isLoading}
        emptyMessage="Henüz kullanıcı eklenmemiş."
      />

      <ConfirmModal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        title="Kullanıcıyı sil?"
        description="Bu kullanıcı ve tüm verisi kalıcı olarak silinecek."
        confirmLabel="Evet, Sil"
        loading={deleteMutation.isPending}
      />

      {/* Create Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setCreateOpen(false)} />
          <div className="relative z-10 w-full max-w-lg mx-4 bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Yeni Kullanıcı Ekle</h3>
              <button onClick={() => setCreateOpen(false)} className="text-zinc-400 hover:text-zinc-600 transition-colors"><X className="h-4 w-4" /></button>
            </div>
            {sharedFormFields(form, setForm)}
            <div className="mt-4">
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Şifre</label>
              <input type="password" value={form.password} onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Min. 8 karakter" className={inputCls} />
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setCreateOpen(false)} disabled={createMutation.isPending} className="flex-1 px-4 py-2 text-sm font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50">İptal</button>
              <button onClick={() => createMutation.mutate(form)} disabled={createMutation.isPending || !form.name.trim() || !form.email.trim()} className="flex-1 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50">
                {createMutation.isPending ? 'Oluşturuluyor...' : 'Kullanıcı Ekle'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setEditUser(null)} />
          <div className="relative z-10 w-full max-w-lg mx-4 bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Kullanıcıyı Düzenle</h3>
              <button onClick={() => setEditUser(null)} className="text-zinc-400 hover:text-zinc-600 transition-colors"><X className="h-4 w-4" /></button>
            </div>
            {sharedFormFields(editForm, setEditForm)}
            <div className="flex gap-3 mt-6">
              <button onClick={() => setEditUser(null)} disabled={updateMutation.isPending} className="flex-1 px-4 py-2 text-sm font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50">İptal</button>
              <button onClick={() => updateMutation.mutate({ id: editUser.id, data: editForm })} disabled={updateMutation.isPending || !editForm.name.trim() || !editForm.email.trim()} className="flex-1 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50">
                {updateMutation.isPending ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
