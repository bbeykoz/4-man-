'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createColumnHelper } from '@tanstack/react-table'
import { Pencil, ToggleLeft, ToggleRight, X, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable } from '@/components/common/DataTable'
import { ConfirmModal } from '@/components/common/ConfirmModal'
import { get, patch, post } from '@/lib/api'

interface SystemModule {
  id: string
  name: string
  slug: string
  description: string
  icon: string
  color: string
  is_active: boolean
  companies_count: number
  total_records: number
}

const col = createColumnHelper<SystemModule>()

const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function SuperAdminModulesPage() {
  const qc = useQueryClient()
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [confirmModule, setConfirmModule] = useState<SystemModule | null>(null)
  const [editModule, setEditModule] = useState<SystemModule | null>(null)
  const [editForm, setEditForm] = useState({ name: '', description: '' })
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState({ name: '', description: '' })

  const { data, isLoading } = useQuery({
    queryKey: ['sa-modules'],
    queryFn: () => get<any>('/admin/modules'),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      patch(`/admin/modules/${id}`, { is_active: active }),
    onSuccess: (_, vars) => {
      toast.success(vars.active ? 'Departman aktifleştirildi.' : 'Departman pasifleştirildi.')
      qc.invalidateQueries({ queryKey: ['sa-modules'] })
      qc.invalidateQueries({ queryKey: ['module-status'] })
    },
    onError: (e: any) => toast.error(e?.message ?? 'İşlem başarısız.'),
    onSettled: () => setTogglingId(null),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name: string; description: string } }) =>
      patch(`/admin/modules/${id}`, data),
    onSuccess: () => {
      toast.success('Departman güncellendi.')
      qc.invalidateQueries({ queryKey: ['sa-modules'] })
      setEditModule(null)
    },
    onError: (e: any) => toast.error(e?.message ?? 'Güncelleme başarısız.'),
  })

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description: string }) =>
      post('/admin/modules', data),
    onSuccess: () => {
      toast.success('Departman oluşturuldu.')
      qc.invalidateQueries({ queryKey: ['sa-modules'] })
      setCreateOpen(false)
      setCreateForm({ name: '', description: '' })
    },
    onError: (e: any) => toast.error(e?.message ?? 'Oluşturma başarısız.'),
  })

  function handleToggle(module: SystemModule) {
    // Pasife alma tüm şirketleri etkiler; onay iste
    if (module.is_active) {
      setConfirmModule(module)
      return
    }
    setTogglingId(module.id)
    toggleMutation.mutate({ id: module.id, active: true })
  }

  function confirmDeactivate() {
    if (!confirmModule) return
    setTogglingId(confirmModule.id)
    toggleMutation.mutate(
      { id: confirmModule.id, active: false },
      { onSettled: () => setConfirmModule(null) },
    )
  }

  function openEdit(module: SystemModule) {
    setEditModule(module)
    setEditForm({ name: module.name, description: module.description ?? '' })
  }

  const columns = [
    col.accessor('name', {
      header: 'Departman',
      cell: (info) => (
        <div>
          <p className="font-medium text-zinc-900 dark:text-zinc-100">{info.getValue()}</p>
          <p className="text-xs text-zinc-400 font-mono">{info.row.original.slug}</p>
        </div>
      ),
    }),
    col.accessor('description', {
      header: 'Açıklama',
      cell: (info) => (
        <p className="text-sm text-zinc-500 truncate max-w-sm">{info.getValue()}</p>
      ),
    }),
    col.accessor('companies_count', {
      header: 'Aktif Şirket',
      cell: (info) => (
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{info.getValue()}</span>
      ),
    }),
    col.accessor('total_records', {
      header: 'Toplam Kayıt',
      cell: (info) => (
        <span className="text-sm text-zinc-600 dark:text-zinc-400">{info.getValue().toLocaleString('tr-TR')}</span>
      ),
    }),
    col.accessor('is_active', {
      header: 'Durum',
      cell: (info) => {
        const module = info.row.original
        const isPending = togglingId === module.id
        return (
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleToggle(module)}
              disabled={isPending}
              className="transition-opacity disabled:opacity-50"
              title={info.getValue() ? 'Pasifleştir' : 'Aktifleştir'}
            >
              {info.getValue() ? (
                <ToggleRight className="h-7 w-7 text-blue-500" />
              ) : (
                <ToggleLeft className="h-7 w-7 text-zinc-400" />
              )}
            </button>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              info.getValue()
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500'
            }`}>
              {info.getValue() ? 'Aktif' : 'Pasif'}
            </span>
          </div>
        )
      },
    }),
    col.display({
      id: 'actions',
      header: '',
      cell: (info) => (
        <button
          onClick={() => openEdit(info.row.original)}
          className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-blue-600 transition-colors"
        >
          <Pencil className="h-4 w-4" />
        </button>
      ),
    }),
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Departmanlar"
        description="Sistemdeki tüm departmanları yönetin. Pasife alınan departman tüm şirketlerde erişime kapanır."
        breadcrumbs={[{ label: 'Süper Admin' }, { label: 'Departmanlar' }]}
        actions={
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="h-4 w-4" />
            Departman Ekle
          </button>
        }
      />

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        total={data?.data?.length ?? 0}
        pageIndex={0}
        onPaginationChange={() => {}}
        isLoading={isLoading}
        emptyMessage="Departman bulunamadı."
      />

      <ConfirmModal
        open={!!confirmModule}
        onClose={() => setConfirmModule(null)}
        onConfirm={confirmDeactivate}
        title={`${confirmModule?.name ?? ''} pasife alınsın mı?`}
        description="Bu departman tüm şirketlerde pasif görünür. Şirket kullanıcıları departman paneline ve verilerine erişemez. Tekrar aktifleştirene kadar şirketler bu departmanı açamaz."
        confirmLabel="Pasife Al"
        variant="warning"
        loading={toggleMutation.isPending}
      />

      {/* Create Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setCreateOpen(false)} />
          <div className="relative z-10 w-full max-w-md mx-4 bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Yeni Departman</h3>
              <button onClick={() => setCreateOpen(false)} className="text-zinc-400 hover:text-zinc-600 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Departman Adı <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="ör. Satış, İnsan Kaynakları..."
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Açıklama</label>
                <textarea
                  value={createForm.description}
                  onChange={(e) => setCreateForm(f => ({ ...f, description: e.target.value }))}
                  rows={3}
                  placeholder="Departmanın kısa açıklaması..."
                  className={`${inputCls} resize-none`}
                />
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
                disabled={createMutation.isPending || !createForm.name.trim()}
                className="flex-1 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50"
              >
                {createMutation.isPending ? 'Oluşturuluyor...' : 'Oluştur'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editModule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setEditModule(null)} />
          <div className="relative z-10 w-full max-w-md mx-4 bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Departmanı Düzenle</h3>
              <button onClick={() => setEditModule(null)} className="text-zinc-400 hover:text-zinc-600 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Departman Adı</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Açıklama</label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm(f => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className={`${inputCls} resize-none`}
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setEditModule(null)}
                disabled={updateMutation.isPending}
                className="flex-1 px-4 py-2 text-sm font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
              >
                İptal
              </button>
              <button
                onClick={() => updateMutation.mutate({ id: editModule.id, data: editForm })}
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
