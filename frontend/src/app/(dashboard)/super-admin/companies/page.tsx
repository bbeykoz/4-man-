'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, MoreHorizontal, Building2, Eye, X } from 'lucide-react'
import { createColumnHelper } from '@tanstack/react-table'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable } from '@/components/common/DataTable'
import { FilterBar } from '@/components/common/FilterBar'
import { StatusBadge } from '@/components/common/StatusBadge'
import { ConfirmModal } from '@/components/common/ConfirmModal'
import { get, del, post } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import type { Company } from '@/types/auth.types'

const col = createColumnHelper<Company>()
const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500'

const emptyForm = {
  name: '', email: '', phone: '', plan_type: 'basic', max_users: '10',
  owner_name: '', owner_email: '', owner_password: '',
}

function CompanyActions({ company }: { company: Company }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const qc = useQueryClient()

  const deleteMutation = useMutation({
    mutationFn: () => del(`/admin/companies/${company.id}`),
    onSuccess: () => {
      toast.success('Şirket silindi.')
      qc.invalidateQueries({ queryKey: ['admin-companies'] })
    },
    onError: (e: any) => toast.error(e?.message),
  })

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => router.push(`/super-admin/companies/${company.id}`)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-950 transition-colors"
      >
        <Eye className="h-3.5 w-3.5" />
        Detaylar
      </button>
      <div className="relative">
        <button onClick={() => setOpen(!open)} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
          <MoreHorizontal className="h-4 w-4 text-zinc-500" />
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-8 z-20 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-lg py-1 w-40">
              <button className="w-full px-3 py-1.5 text-sm text-left hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300" onClick={() => { setOpen(false) }}>Düzenle</button>
              <button className="w-full px-3 py-1.5 text-sm text-left hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300" onClick={() => { setOpen(false) }}>
                {company.status === 'active' ? 'Askıya Al' : 'Aktifleştir'}
              </button>
              <button className="w-full px-3 py-1.5 text-sm text-left hover:bg-red-50 dark:hover:bg-red-950/50 text-red-600" onClick={() => { setOpen(false); setConfirmOpen(true) }}>Sil</button>
            </div>
          </>
        )}
        <ConfirmModal
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          onConfirm={() => deleteMutation.mutate()}
          title="Şirketi sil?"
          description={`"${company.name}" şirketi ve tüm verileri kalıcı olarak silinecek.`}
          confirmLabel="Evet, Sil"
          loading={deleteMutation.isPending}
        />
      </div>
    </div>
  )
}

export default function CompaniesPage() {
  const qc = useQueryClient()
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-companies', page, search, filters],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page + 1), per_page: '15', ...(search && { search }), ...filters })
      return get<any>(`/admin/companies?${params}`)
    },
  })

  const createMutation = useMutation({
    mutationFn: (data: typeof emptyForm) => post('/admin/companies', { ...data, max_users: Number(data.max_users) }),
    onSuccess: (res: any) => {
      toast.success('Şirket oluşturuldu.')
      qc.invalidateQueries({ queryKey: ['admin-companies'] })
      setCreateOpen(false)
      setForm(emptyForm)
    },
    onError: (e: any) => toast.error(e?.message ?? 'Oluşturma başarısız.'),
  })

  const columns = [
    col.accessor('name', {
      header: 'Şirket',
      cell: (info) => (
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center flex-shrink-0">
            <Building2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="font-medium text-zinc-900 dark:text-zinc-100">{info.getValue()}</p>
            <p className="text-xs text-zinc-400">{info.row.original.email}</p>
          </div>
        </div>
      ),
    }),
    col.accessor('plan_type', {
      header: 'Plan',
      cell: (info) => (
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
          {info.row.original.plan_label}
        </span>
      ),
    }),
    col.accessor('status', {
      header: 'Durum',
      cell: (info) => <StatusBadge status={info.getValue()} label={info.row.original.status_label} />,
    }),
    col.accessor('users_count', {
      header: 'Kullanıcı',
      cell: (info) => <span className="text-sm font-medium">{info.getValue() ?? 0}</span>,
    }),
    col.accessor('created_at', {
      header: 'Oluşturulma',
      cell: (info) => <span className="text-sm text-zinc-500">{formatDate(info.getValue())}</span>,
    }),
    col.display({
      id: 'actions',
      header: '',
      cell: (info) => <CompanyActions company={info.row.original} />,
    }),
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Şirket Yönetimi"
        description={`Sistemde kayıtlı ${data?.meta?.total ?? 0} şirket`}
        breadcrumbs={[{ label: 'Süper Admin' }, { label: 'Şirketler' }]}
        actions={
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="h-4 w-4" />
            Yeni Şirket
          </button>
        }
      />

      <FilterBar
        placeholder="Şirket ara..."
        onSearch={setSearch}
        onFilterChange={setFilters}
        filters={[
          { key: 'status', label: 'Durum', options: [{ value: 'active', label: 'Aktif' }, { value: 'inactive', label: 'Pasif' }, { value: 'suspended', label: 'Askıda' }] },
          { key: 'plan_type', label: 'Plan', options: [{ value: 'basic', label: 'Temel' }, { value: 'pro', label: 'Pro' }, { value: 'enterprise', label: 'Kurumsal' }] },
        ]}
      />

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        total={data?.meta?.total ?? 0}
        pageIndex={page}
        onPaginationChange={(s) => setPage(s.pageIndex)}
        isLoading={isLoading}
        emptyMessage="Henüz şirket eklenmemiş."
      />

      {/* Create Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setCreateOpen(false)} />
          <div className="relative z-10 w-full max-w-lg mx-4 bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Yeni Şirket Oluştur</h3>
              <button onClick={() => setCreateOpen(false)} className="text-zinc-400 hover:text-zinc-600 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Şirket Adı <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Örn: Acme A.Ş."
                  className={inputCls}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">E-posta</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="info@sirket.com"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Telefon</label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="+90 212 000 00 00"
                    className={inputCls}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Plan</label>
                  <select
                    value={form.plan_type}
                    onChange={(e) => setForm(f => ({ ...f, plan_type: e.target.value }))}
                    className={inputCls}
                  >
                    <option value="basic">Temel</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Kurumsal</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Maks. Kullanıcı</label>
                  <input
                    type="number"
                    min="1"
                    max="9999"
                    value={form.max_users}
                    onChange={(e) => setForm(f => ({ ...f, max_users: e.target.value }))}
                    className={inputCls}
                  />
                </div>
              </div>

              <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4">
                <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-3">Şirket Sahibi</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Ad Soyad <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={form.owner_name}
                      onChange={(e) => setForm(f => ({ ...f, owner_name: e.target.value }))}
                      placeholder="Örn: Ahmet Yılmaz"
                      className={inputCls}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">E-posta <span className="text-red-500">*</span></label>
                      <input
                        type="email"
                        value={form.owner_email}
                        onChange={(e) => setForm(f => ({ ...f, owner_email: e.target.value }))}
                        placeholder="ahmet@sirket.com"
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Şifre <span className="text-red-500">*</span></label>
                      <input
                        type="password"
                        value={form.owner_password}
                        onChange={(e) => setForm(f => ({ ...f, owner_password: e.target.value }))}
                        placeholder="Min. 8 karakter"
                        className={inputCls}
                      />
                    </div>
                  </div>
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
                onClick={() => createMutation.mutate(form)}
                disabled={createMutation.isPending || !form.name.trim() || !form.owner_name.trim() || !form.owner_email.trim() || !form.owner_password}
                className="flex-1 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50"
              >
                {createMutation.isPending ? 'Oluşturuluyor...' : 'Şirket Oluştur'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
