'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createColumnHelper } from '@tanstack/react-table'
import { Plus, Pencil, Trash2, Users, X } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable } from '@/components/common/DataTable'
import { FilterBar } from '@/components/common/FilterBar'
import { ConfirmModal } from '@/components/common/ConfirmModal'
import { get, del, post, patch } from '@/lib/api'
import { formatDate } from '@/lib/utils'

interface Department {
  id: string
  name: string
  slug: string
  description: string | null
  color: string | null
  manager: { id: string; name: string; email: string } | null
  users_count: number
  status: string
  system_active?: boolean
  created_at: string
}

const col = createColumnHelper<Department>()
const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500'

const COLORS = [
  { value: 'blue', label: 'Mavi', hex: '#3b82f6' },
  { value: 'green', label: 'Yeşil', hex: '#22c55e' },
  { value: 'purple', label: 'Mor', hex: '#a855f7' },
  { value: 'red', label: 'Kırmızı', hex: '#ef4444' },
  { value: 'orange', label: 'Turuncu', hex: '#f97316' },
  { value: 'yellow', label: 'Sarı', hex: '#eab308' },
  { value: 'pink', label: 'Pembe', hex: '#ec4899' },
  { value: 'gray', label: 'Gri', hex: '#6b7280' },
]

const emptyForm = { name: '', description: '', color: 'blue', manager_id: '' }

export default function DepartmentsPage() {
  const qc = useQueryClient()
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [editDept, setEditDept] = useState<Department | null>(null)
  const [editForm, setEditForm] = useState({ name: '', description: '', color: 'blue', manager_id: '', status: 'active' })

  const modalOpen = createOpen || !!editDept

  const { data, isLoading } = useQuery({
    queryKey: ['departments', page, search],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page + 1), per_page: '20', ...(search && { search }) })
      return get<any>(`/company/departments?${params}`)
    },
  })

  const { data: usersData } = useQuery({
    queryKey: ['company-users-managers'],
    queryFn: () => get<any>('/company/users?per_page=100'),
    enabled: modalOpen,
  })

  const createMutation = useMutation({
    mutationFn: (data: typeof emptyForm) => post('/company/departments', data),
    onSuccess: () => {
      toast.success('Departman oluşturuldu.')
      qc.invalidateQueries({ queryKey: ['departments'] })
      setCreateOpen(false)
      setForm(emptyForm)
    },
    onError: (e: any) => toast.error(e?.message ?? 'Oluşturma başarısız.'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: typeof editForm }) => patch(`/company/departments/${id}`, data),
    onSuccess: () => {
      toast.success('Departman güncellendi.')
      qc.invalidateQueries({ queryKey: ['departments'] })
      setEditDept(null)
    },
    onError: (e: any) => toast.error(e?.message ?? 'Güncelleme başarısız.'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => del(`/company/departments/${id}`),
    onSuccess: () => {
      toast.success('Departman silindi.')
      qc.invalidateQueries({ queryKey: ['departments'] })
      setDeleteId(null)
    },
    onError: (e: any) => toast.error(e?.message),
  })

  function openEdit(d: Department) {
    setEditDept(d)
    setEditForm({
      name: d.name,
      description: d.description ?? '',
      color: d.color ?? 'blue',
      manager_id: d.manager?.id ?? '',
      status: d.status ?? 'active',
    })
  }

  const columns = [
    col.accessor('name', {
      header: 'Departman',
      cell: (info) => {
        const d = info.row.original
        const colorHex = COLORS.find(c => c.value === d.color)?.hex ?? d.color ?? '#6b7280'
        return (
          <div className="flex items-center gap-2.5">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: colorHex }} />
            <div>
              <p className="font-medium text-zinc-900 dark:text-zinc-100">{info.getValue()}</p>
              {d.description && <p className="text-xs text-zinc-400 truncate max-w-xs">{d.description}</p>}
            </div>
          </div>
        )
      },
    }),
    col.accessor('manager', {
      header: 'Yönetici',
      cell: (info) => {
        const m = info.getValue()
        return m ? (
          <div>
            <p className="text-sm text-zinc-700 dark:text-zinc-300">{m.name}</p>
            <p className="text-xs text-zinc-400">{m.email}</p>
          </div>
        ) : (
          <span className="text-zinc-400 text-xs">Atanmamış</span>
        )
      },
    }),
    col.accessor('users_count', {
      header: 'Kullanıcı',
      cell: (info) => (
        <div className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 text-zinc-400" />
          <span className="text-sm text-zinc-600 dark:text-zinc-400">{info.getValue()}</span>
        </div>
      ),
    }),
    col.accessor('status', {
      header: 'Durum',
      cell: (info) => {
        const d = info.row.original
        if (d.system_active === false) {
          return (
            <span
              title="Sistem yöneticisi tarafından pasife alındı"
              className="text-xs font-medium px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500"
            >
              Sistem tarafından pasif
            </span>
          )
        }
        const active = info.getValue() === 'active'
        return (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            active
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500'
          }`}>
            {active ? 'Aktif' : 'Pasif'}
          </span>
        )
      },
    }),
    col.accessor('created_at', {
      header: 'Oluşturulma',
      cell: (info) => <span className="text-sm text-zinc-500">{formatDate(info.getValue())}</span>,
    }),
    col.display({
      id: 'actions',
      header: '',
      cell: (info) => (
        <div className="flex items-center gap-1">
          <button
            title="Düzenle"
            onClick={() => openEdit(info.row.original)}
            className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-blue-600 transition-colors"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            title="Sil"
            onClick={() => setDeleteId(info.row.original.id)}
            className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/50 text-zinc-400 hover:text-red-600 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    }),
  ]

  const formFields = (f: any, setF: any, showStatus = false) => (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Departman Adı <span className="text-red-500">*</span></label>
        <input type="text" value={f.name} onChange={(e) => setF((p: any) => ({ ...p, name: e.target.value }))} placeholder="Örn: Muhasebe" className={inputCls} />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Açıklama</label>
        <input type="text" value={f.description} onChange={(e) => setF((p: any) => ({ ...p, description: e.target.value }))} placeholder="Kısa açıklama..." className={inputCls} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Renk</label>
          <div className="flex gap-2 flex-wrap">
            {COLORS.map(c => (
              <button
                key={c.value}
                type="button"
                title={c.label}
                onClick={() => setF((p: any) => ({ ...p, color: c.value }))}
                className={`w-6 h-6 rounded-full transition-all ${f.color === c.value ? 'ring-2 ring-offset-2 ring-offset-white dark:ring-offset-zinc-900 ring-zinc-400' : ''}`}
                style={{ backgroundColor: c.hex }}
              />
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Yönetici (Müdür)</label>
          <select value={f.manager_id} onChange={(e) => setF((p: any) => ({ ...p, manager_id: e.target.value }))} className={inputCls}>
            <option value="">Atanmamış</option>
            {usersData?.data?.map((u: any) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
      </div>
      {showStatus && (
        <div>
          <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Durum</label>
          <select value={f.status} onChange={(e) => setF((p: any) => ({ ...p, status: e.target.value }))} className={inputCls}>
            <option value="active">Aktif</option>
            <option value="inactive">Pasif</option>
          </select>
        </div>
      )}
    </div>
  )

  return (
    <div className="space-y-5">
      <PageHeader
        title="Departmanlar"
        description="Şirket departmanlarını yönetin"
        breadcrumbs={[{ label: 'Şirket' }, { label: 'Departmanlar' }]}
        actions={
          <button onClick={() => setCreateOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
            <Plus className="h-4 w-4" />
            Yeni Departman
          </button>
        }
      />

      <FilterBar placeholder="Departman ara..." onSearch={setSearch} onFilterChange={() => {}} filters={[]} />

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        total={data?.meta?.total ?? 0}
        pageIndex={page}
        onPaginationChange={(s) => setPage(s.pageIndex)}
        isLoading={isLoading}
        emptyMessage="Henüz departman oluşturulmamış."
      />

      <ConfirmModal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        title="Departmanı sil?"
        description="Bu departman silinecek. İçindeki kullanıcılar departmansız kalacak."
        confirmLabel="Evet, Sil"
        loading={deleteMutation.isPending}
      />

      {/* Create Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setCreateOpen(false)} />
          <div className="relative z-10 w-full max-w-md mx-4 bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Yeni Departman Oluştur</h3>
              <button onClick={() => setCreateOpen(false)} className="text-zinc-400 hover:text-zinc-600 transition-colors"><X className="h-4 w-4" /></button>
            </div>
            {formFields(form, setForm)}
            <div className="flex gap-3 mt-6">
              <button onClick={() => setCreateOpen(false)} disabled={createMutation.isPending} className="flex-1 px-4 py-2 text-sm font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50">İptal</button>
              <button onClick={() => createMutation.mutate(form)} disabled={createMutation.isPending || !form.name.trim()} className="flex-1 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50">
                {createMutation.isPending ? 'Oluşturuluyor...' : 'Oluştur'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editDept && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setEditDept(null)} />
          <div className="relative z-10 w-full max-w-md mx-4 bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Departmanı Düzenle</h3>
              <button onClick={() => setEditDept(null)} className="text-zinc-400 hover:text-zinc-600 transition-colors"><X className="h-4 w-4" /></button>
            </div>
            {formFields(editForm, setEditForm, true)}
            <div className="flex gap-3 mt-6">
              <button onClick={() => setEditDept(null)} disabled={updateMutation.isPending} className="flex-1 px-4 py-2 text-sm font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50">İptal</button>
              <button onClick={() => updateMutation.mutate({ id: editDept.id, data: editForm })} disabled={updateMutation.isPending || !editForm.name.trim()} className="flex-1 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50">
                {updateMutation.isPending ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
