'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createColumnHelper } from '@tanstack/react-table'
import { Pencil, Trash2, Building2, X, Plus, ShieldOff, ShieldX, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable } from '@/components/common/DataTable'
import { FilterBar } from '@/components/common/FilterBar'
import { StatusBadge } from '@/components/common/StatusBadge'
import { ConfirmModal } from '@/components/common/ConfirmModal'
import { get, del, patch, post } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import type { User } from '@/types/auth.types'

const col = createColumnHelper<User & { company?: { name: string }; roles?: any[] }>()

const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500'

interface EditForm {
  name: string
  email: string
  phone: string
  department_id: string
  status: string
}

interface CreateForm {
  company_id: string
  name: string
  email: string
  password: string
  phone: string
  role_id: string
  department_id: string
}

const emptyCreate: CreateForm = { company_id: '', name: '', email: '', password: '', phone: '', role_id: '', department_id: '' }

export default function SuperAdminUsersPage() {
  const qc = useQueryClient()
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [deleteId, setDeleteId]         = useState<string | null>(null)
  const [enable2faId, setEnable2faId]   = useState<string | null>(null)
  const [disable2faId, setDisable2faId] = useState<string | null>(null)
  const [reset2faId, setReset2faId]     = useState<string | null>(null)
  const [editUser, setEditUser] = useState<(User & { company?: any; roles?: any[] }) | null>(null)
  const [editForm, setEditForm] = useState<EditForm>({ name: '', email: '', phone: '', department_id: '', status: 'active' })
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState<CreateForm>(emptyCreate)

  // Düzenle modalı için departman listesi
  const { data: deptData } = useQuery({
    queryKey: ['sa-company-departments', editUser?.company_id],
    queryFn: () => get<any>(`/admin/companies/${editUser!.company_id}/departments`),
    enabled: !!editUser?.company_id,
  })
  const editDepts: { id: string; name: string }[] = deptData?.data ?? []

  // Yeni kullanıcı modalı için şirket listesi
  const { data: companiesData } = useQuery({
    queryKey: ['sa-companies-list'],
    queryFn: () => get<any>('/admin/companies?per_page=100'),
    enabled: createOpen,
  })
  const companies: { id: string; name: string }[] = companiesData?.data ?? []

  // Seçili şirketin departmanları
  const { data: createDeptData } = useQuery({
    queryKey: ['sa-create-departments', createForm.company_id],
    queryFn: () => get<any>(`/admin/companies/${createForm.company_id}/departments`),
    enabled: !!createForm.company_id,
  })
  const createDepts: { id: string; name: string }[] = createDeptData?.data ?? []

  // Seçili şirketin rolleri
  const { data: createRolesData } = useQuery({
    queryKey: ['sa-create-roles', createForm.company_id],
    queryFn: () => get<any>(`/admin/companies/${createForm.company_id}/roles`),
    enabled: !!createForm.company_id,
  })
  const createRoles: { id: string; display_name: string; name: string }[] = createRolesData?.data ?? []

  const { data, isLoading } = useQuery({
    queryKey: ['sa-users', page, search, filters],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page + 1),
        per_page: '25',
        ...(search && { search }),
        ...filters,
      })
      return get<any>(`/admin/users?${params}`)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => del(`/admin/users/${id}`),
    onSuccess: () => {
      toast.success('Kullanıcı silindi.')
      qc.invalidateQueries({ queryKey: ['sa-users'] })
      setDeleteId(null)
    },
    onError: (e: any) => toast.error(e?.message ?? 'Silme işlemi başarısız.'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<EditForm> }) =>
      patch(`/admin/users/${id}`, data),
    onSuccess: () => {
      toast.success('Kullanıcı güncellendi.')
      qc.invalidateQueries({ queryKey: ['sa-users'] })
      setEditUser(null)
    },
    onError: (e: any) => toast.error(e?.message ?? 'Güncelleme başarısız.'),
  })

  const enable2faMutation = useMutation({
    mutationFn: (id: string) => post(`/admin/users/${id}/enable-2fa`, {}),
    onSuccess: () => {
      toast.success('2FA tekrar aktif edildi.')
      qc.invalidateQueries({ queryKey: ['sa-users'] })
      setEnable2faId(null)
    },
    onError: (e: any) => toast.error(e?.message ?? 'İşlem başarısız.'),
  })

  const disable2faMutation = useMutation({
    mutationFn: (id: string) => post(`/admin/users/${id}/disable-2fa`, {}),
    onSuccess: () => {
      toast.success('2FA pasife alındı.')
      qc.invalidateQueries({ queryKey: ['sa-users'] })
      setDisable2faId(null)
    },
    onError: (e: any) => toast.error(e?.message ?? 'İşlem başarısız.'),
  })

  const reset2faMutation = useMutation({
    mutationFn: (id: string) => post(`/admin/users/${id}/reset-2fa`, {}),
    onSuccess: () => {
      toast.success('2FA sıfırlandı. Kullanıcı yeniden kurulum yapacak.')
      qc.invalidateQueries({ queryKey: ['sa-users'] })
      setReset2faId(null)
    },
    onError: (e: any) => toast.error(e?.message ?? 'İşlem başarısız.'),
  })

  const createMutation = useMutation({
    mutationFn: (data: CreateForm) => post('/admin/users', data),
    onSuccess: () => {
      toast.success('Kullanıcı oluşturuldu.')
      qc.invalidateQueries({ queryKey: ['sa-users'] })
      setCreateOpen(false)
      setCreateForm(emptyCreate)
    },
    onError: (e: any) => toast.error(e?.message ?? 'Oluşturma başarısız.'),
  })

  function openEdit(user: User & { company?: any; roles?: any[] }) {
    setEditUser(user)
    setEditForm({
      name: user.name ?? '',
      email: user.email ?? '',
      phone: user.phone ?? '',
      department_id: user.department_id ?? '',
      status: (user as any).status ?? 'active',
    })
  }

  const isCreateValid = createForm.company_id && createForm.name && createForm.email && createForm.password.length >= 8

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
              <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                  {u.name?.charAt(0).toUpperCase()}
                </span>
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
    col.accessor('company' as any, {
      header: 'Şirket',
      cell: (info) => {
        const c = info.getValue() as any
        return c ? (
          <div className="flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 text-zinc-400" />
            <span className="text-sm text-zinc-600 dark:text-zinc-400">{c.name}</span>
          </div>
        ) : (
          <span className="text-xs text-blue-500 font-medium">Süper Admin</span>
        )
      },
    }),
    col.accessor('roles' as any, {
      header: 'Rol',
      cell: (info) => {
        const roles = info.getValue() as any[]
        if (!roles?.length) return <span className="text-zinc-400 text-xs">—</span>
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 text-xs font-medium">
            {roles[0]?.name}
          </span>
        )
      },
    }),
    col.accessor('status' as any, {
      header: 'Durum',
      cell: (info) => <StatusBadge status={info.getValue()} />,
    }),
    col.accessor('created_at' as any, {
      header: 'Kayıt',
      cell: (info) => <span className="text-sm text-zinc-500">{formatDate(info.getValue())}</span>,
    }),
    col.display({
      id: 'actions',
      header: '',
      cell: (info) => {
        const u = info.row.original as any
        return (
          <div className="flex items-center gap-1">
            <button
              onClick={() => openEdit(u)}
              className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-blue-600 transition-colors"
              title="Düzenle"
            >
              <Pencil className="h-4 w-4" />
            </button>
            {u.two_factor_secret_set && !u.two_factor_enabled && (
              <button
                onClick={() => setEnable2faId(u.id)}
                className="p-1.5 rounded-lg hover:bg-green-50 dark:hover:bg-green-950/50 text-zinc-400 hover:text-green-600 transition-colors"
                title="2FA Aktif Et"
              >
                <ShieldCheck className="h-4 w-4" />
              </button>
            )}
            {u.two_factor_enabled && (
              <button
                onClick={() => setDisable2faId(u.id)}
                className="p-1.5 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950/50 text-zinc-400 hover:text-amber-600 transition-colors"
                title="2FA Pasife Al"
              >
                <ShieldOff className="h-4 w-4" />
              </button>
            )}
            {(u.two_factor_enabled || u.two_factor_secret_set) && (
              <button
                onClick={() => setReset2faId(u.id)}
                className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/50 text-zinc-400 hover:text-red-500 transition-colors"
                title="2FA'yı Sıfırla (Sil)"
              >
                <ShieldX className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={() => setDeleteId(u.id)}
              className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/50 text-zinc-400 hover:text-red-600 transition-colors"
              title="Sil"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )
      },
    }),
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tüm Kullanıcılar"
        description="Sistemdeki tüm kullanıcıları yönetin"
        breadcrumbs={[{ label: 'Süper Admin' }, { label: 'Kullanıcılar' }]}
        actions={
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="h-4 w-4" />
            Kullanıcı Ekle
          </button>
        }
      />

      <FilterBar
        placeholder="İsim veya e-posta ara..."
        onSearch={setSearch}
        onFilterChange={setFilters}
        filters={[
          {
            key: 'status',
            label: 'Durum',
            options: [
              { value: 'active', label: 'Aktif' },
              { value: 'inactive', label: 'Pasif' },
              { value: 'suspended', label: 'Askıya Alındı' },
            ],
          },
        ]}
      />

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        total={data?.meta?.total ?? 0}
        pageIndex={page}
        onPaginationChange={(s) => setPage(s.pageIndex)}
        isLoading={isLoading}
        emptyMessage="Kullanıcı bulunamadı."
      />

      <ConfirmModal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        title="Kullanıcıyı sil?"
        description="Bu kullanıcı kalıcı olarak silinecek."
        confirmLabel="Evet, Sil"
        loading={deleteMutation.isPending}
      />

      <ConfirmModal
        open={!!enable2faId}
        onClose={() => setEnable2faId(null)}
        onConfirm={() => enable2faId && enable2faMutation.mutate(enable2faId)}
        title="2FA Aktif Et?"
        description="Kullanıcının mevcut 2FA ayarları tekrar zorunlu hale getirilecek. Bir sonraki girişinde kod girmesi gerekecek."
        confirmLabel="Aktif Et"
        loading={enable2faMutation.isPending}
      />

      <ConfirmModal
        open={!!disable2faId}
        onClose={() => setDisable2faId(null)}
        onConfirm={() => disable2faId && disable2faMutation.mutate(disable2faId)}
        title="2FA Pasife Al?"
        description="Kullanıcının 2FA zorunluluğu kaldırılacak. 2FA ayarları silinmez, kullanıcı 2FA olmadan giriş yapabilir."
        confirmLabel="Pasife Al"
        loading={disable2faMutation.isPending}
      />

      <ConfirmModal
        open={!!reset2faId}
        onClose={() => setReset2faId(null)}
        onConfirm={() => reset2faId && reset2faMutation.mutate(reset2faId)}
        title="2FA'yı Sıfırla?"
        description="Kullanıcının 2FA ayarları tamamen silinecek. Bir sonraki girişte yeniden kurulum yapması gerekecek."
        confirmLabel="Evet, Sıfırla"
        loading={reset2faMutation.isPending}
      />

      {/* Create Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setCreateOpen(false)} />
          <div className="relative z-10 w-full max-w-lg mx-4 bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Yeni Kullanıcı Ekle</h3>
              <button onClick={() => setCreateOpen(false)} className="text-zinc-400 hover:text-zinc-600 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Şirket */}
              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Şirket <span className="text-red-500">*</span></label>
                <select
                  value={createForm.company_id}
                  onChange={(e) => setCreateForm(f => ({ ...f, company_id: e.target.value, role_id: '', department_id: '' }))}
                  className={inputCls}
                >
                  <option value="">— Şirket Seçin —</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Ad Soyad + E-posta */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Ad Soyad <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={createForm.name}
                    onChange={(e) => setCreateForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Ahmet Yılmaz"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">E-posta <span className="text-red-500">*</span></label>
                  <input
                    type="email"
                    value={createForm.email}
                    onChange={(e) => setCreateForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="ahmet@sirket.com"
                    className={inputCls}
                  />
                </div>
              </div>

              {/* Şifre + Telefon */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Şifre <span className="text-red-500">*</span></label>
                  <input
                    type="password"
                    value={createForm.password}
                    onChange={(e) => setCreateForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="En az 8 karakter"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Telefon</label>
                  <input
                    type="text"
                    value={createForm.phone}
                    onChange={(e) => setCreateForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="+90 555 000 00 00"
                    className={inputCls}
                  />
                </div>
              </div>

              {/* Departman + Rol */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Departman</label>
                  <select
                    value={createForm.department_id}
                    onChange={(e) => setCreateForm(f => ({ ...f, department_id: e.target.value }))}
                    disabled={!createForm.company_id}
                    className={`${inputCls} disabled:opacity-50`}
                  >
                    <option value="">— Seçin —</option>
                    {createDepts.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Rol</label>
                  <select
                    value={createForm.role_id}
                    onChange={(e) => setCreateForm(f => ({ ...f, role_id: e.target.value }))}
                    disabled={!createForm.company_id}
                    className={`${inputCls} disabled:opacity-50`}
                  >
                    <option value="">— Seçin —</option>
                    {createRoles.map((r) => (
                      <option key={r.id} value={r.id}>{r.display_name || r.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setCreateOpen(false)}
                disabled={createMutation.isPending}
                className="flex-1 px-4 py-2 text-sm font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
              >
                İptal
              </button>
              <button
                onClick={() => createMutation.mutate(createForm)}
                disabled={createMutation.isPending || !isCreateValid}
                className="flex-1 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50"
              >
                {createMutation.isPending ? 'Oluşturuluyor...' : 'Kullanıcı Oluştur'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setEditUser(null)} />
          <div className="relative z-10 w-full max-w-md mx-4 bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Kullanıcıyı Düzenle</h3>
              <button onClick={() => setEditUser(null)} className="text-zinc-400 hover:text-zinc-600 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Ad Soyad</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">E-posta</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm(f => ({ ...f, email: e.target.value }))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Telefon</label>
                <input
                  type="text"
                  value={editForm.phone}
                  onChange={(e) => setEditForm(f => ({ ...f, phone: e.target.value }))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Departman</label>
                {!editUser?.company_id ? (
                  <p className="text-xs text-zinc-400 py-2">Bu kullanıcı herhangi bir şirkete bağlı değil.</p>
                ) : (
                  <select
                    value={editForm.department_id}
                    onChange={(e) => setEditForm(f => ({ ...f, department_id: e.target.value }))}
                    className={inputCls}
                  >
                    <option value="">— Departman Seçin —</option>
                    {editDepts.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Durum</label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm(f => ({ ...f, status: e.target.value }))}
                  className={inputCls}
                >
                  <option value="active">Aktif</option>
                  <option value="inactive">Pasif</option>
                  <option value="suspended">Askıya Alındı</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setEditUser(null)}
                disabled={updateMutation.isPending}
                className="flex-1 px-4 py-2 text-sm font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
              >
                İptal
              </button>
              <button
                onClick={() => updateMutation.mutate({ id: editUser.id, data: editForm })}
                disabled={updateMutation.isPending}
                className="flex-1 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50"
              >
                {updateMutation.isPending ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
