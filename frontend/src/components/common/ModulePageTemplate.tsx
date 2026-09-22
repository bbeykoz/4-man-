'use client'

import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Eye, Pencil, Trash2, X, Paperclip, Upload, FileText, FileImage, File, Download, Loader2 } from 'lucide-react'
import { RowMenu } from '@/components/common/RowMenu'
import { createColumnHelper } from '@tanstack/react-table'
import { toast } from 'sonner'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable } from '@/components/common/DataTable'
import { FilterBar } from '@/components/common/FilterBar'
import { StatusBadge } from '@/components/common/StatusBadge'
import { ConfirmModal } from '@/components/common/ConfirmModal'
import { createRecordService } from '@/services/record.service'
import { formatDate } from '@/lib/utils'
import { get } from '@/lib/api'
import type { BaseRecord } from '@/types/api.types'
import type { LucideIcon } from 'lucide-react'
import { STATUS_OPTIONS, PRIORITY_OPTIONS } from '@/lib/constants'

interface ExtraFieldProps {
  form: Record<string, any>
  onChange: (key: string, value: any) => void
}

interface ModulePageTemplateProps {
  moduleSlug: string
  title: string
  description: string
  icon: LucideIcon
  color: string
  breadcrumbParent?: string
  typeOptions?: { value: string; label: string }[]
  extraFormFields?: (props: ExtraFieldProps) => React.ReactNode
  extraColumns?: any[]
  extraActions?: React.ReactNode
}

const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelCls = 'block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1'

// ─── Dosya ikonu ──────────────────────────────────────────────────────────────

function FileIcon({ mime }: { mime: string }) {
  if (mime === 'application/pdf')
    return <FileText className="h-8 w-8 text-red-500 shrink-0" />
  if (mime.startsWith('image/'))
    return <FileImage className="h-8 w-8 text-blue-500 shrink-0" />
  return <File className="h-8 w-8 text-zinc-400 shrink-0" />
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

// ─── Attachments Modal ────────────────────────────────────────────────────────

interface AttachmentsModalProps {
  recordId: string
  recordTitle: string
  moduleSlug: string
  onClose: () => void
}

function AttachmentsModal({ recordId, recordTitle, moduleSlug, onClose }: AttachmentsModalProps) {
  const service  = createRecordService(moduleSlug)
  const qc       = useQueryClient()
  const fileRef  = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: [moduleSlug, 'attachments', recordId],
    queryFn: () => service.attachments(recordId).then((r: any) => r.data ?? []),
  })

  const uploadMutation = useMutation({
    mutationFn: (file: File) => service.addAttachment(recordId, file),
    onSuccess: () => {
      toast.success('Dosya yüklendi.')
      qc.invalidateQueries({ queryKey: [moduleSlug, 'attachments', recordId] })
      qc.invalidateQueries({ queryKey: [moduleSlug, 'records'] })
    },
    onError: (e: any) => toast.error(e?.message ?? 'Yükleme başarısız.'),
  })

  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return
    Array.from(files).forEach(file => uploadMutation.mutate(file))
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  const attachments: any[] = data ?? []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <div className="flex items-center gap-2">
            <Paperclip className="h-5 w-5 text-blue-600" />
            <div>
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Dosya ve Ekler</h2>
              <p className="text-xs text-zinc-400 truncate max-w-xs">{recordTitle}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Upload zone */}
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`cursor-pointer rounded-xl border-2 border-dashed p-5 text-center transition-colors ${
              dragging
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                : 'border-zinc-300 dark:border-zinc-700 hover:border-blue-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
            }`}
          >
            <input
              ref={fileRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.zip,.csv"
              className="hidden"
              onChange={e => handleFiles(e.target.files)}
            />
            {uploadMutation.isPending ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-7 w-7 text-blue-500 animate-spin" />
                <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">Yükleniyor...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-7 w-7 text-zinc-400" />
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Dosyayı buraya sürükle veya tıkla
                </p>
                <p className="text-xs text-zinc-400">
                  PDF, Word, Excel, Resim, ZIP — maks. 20 MB
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Attachments list */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 text-zinc-400 animate-spin" />
            </div>
          ) : attachments.length === 0 ? (
            <div className="text-center py-10">
              <Paperclip className="h-10 w-10 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
              <p className="text-sm text-zinc-400">Henüz dosya eklenmemiş.</p>
              <p className="text-xs text-zinc-300 dark:text-zinc-600 mt-1">Yukarıdan PDF veya belge yükleyebilirsiniz.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-medium text-zinc-500 mb-3">{attachments.length} dosya</p>
              {attachments.map((att: any) => (
                <div
                  key={att.id}
                  className="flex items-center gap-3 p-3 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors group"
                >
                  <FileIcon mime={att.mime_type ?? ''} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                      {att.original_name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-zinc-400">{formatBytes(att.size ?? 0)}</span>
                      <span className="text-zinc-300 dark:text-zinc-600">·</span>
                      <span className="text-xs text-zinc-400">{formatDate(att.created_at)}</span>
                      {att.user && (
                        <>
                          <span className="text-zinc-300 dark:text-zinc-600">·</span>
                          <span className="text-xs text-zinc-400">{att.user.name}</span>
                        </>
                      )}
                    </div>
                  </div>
                  {att.url && (
                    <a
                      href={att.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="İndir / Görüntüle"
                      className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-blue-50 dark:hover:bg-blue-950/30 text-zinc-400 hover:text-blue-600 transition-all"
                      onClick={e => e.stopPropagation()}
                    >
                      <Download className="h-4 w-4" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end px-4 pb-4 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── ModulePageTemplate ────────────────────────────────────────────────────────

export function ModulePageTemplate({
  moduleSlug, title, description, icon: Icon, color,
  breadcrumbParent = 'Modüller',
  typeOptions,
  extraFormFields,
  extraColumns,
  extraActions,
}: ModulePageTemplateProps) {
  const service = createRecordService(moduleSlug)
  const qc      = useQueryClient()

  const [page, setPage]     = useState(0)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [attachmentRecord, setAttachmentRecord] = useState<{ id: string; title: string } | null>(null)
  const [form, setForm] = useState<Record<string, any>>({
    title: '', description: '', type: '', status: 'pending',
    priority: 'medium', department_id: '', due_date: '',
  })

  const setField = (key: string, value: any) => setForm(prev => ({ ...prev, [key]: value }))

  const { data: statsData } = useQuery({
    queryKey: [moduleSlug, 'stats'],
    queryFn: () => service.dashboard().then((r) => r.data),
  })

  const { data, isLoading } = useQuery({
    queryKey: [moduleSlug, 'records', page, search, filters],
    queryFn: () => service.list({ page: page + 1, per_page: 15, search: search || undefined, ...filters }).then((r) => r),
  })

  const { data: deptData } = useQuery({
    queryKey: ['company-departments-list'],
    queryFn: () => get<any>('/company/departments').then((r) => r.data ?? []),
  })
  const departments: { id: string; name: string }[] = deptData ?? []

  const deleteMutation = useMutation({
    mutationFn: (id: string) => service.delete(id),
    onSuccess: () => {
      toast.success('Kayıt silindi.')
      qc.invalidateQueries({ queryKey: [moduleSlug, 'records'] })
      qc.invalidateQueries({ queryKey: [moduleSlug, 'stats'] })
      setDeleteId(null)
    },
    onError: (e: any) => toast.error(e?.message),
  })

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, any>) => service.create(payload),
    onSuccess: () => {
      toast.success('Kayıt oluşturuldu.')
      qc.invalidateQueries({ queryKey: [moduleSlug, 'records'] })
      qc.invalidateQueries({ queryKey: [moduleSlug, 'stats'] })
      setShowCreate(false)
      setForm({ title: '', description: '', type: '', status: 'pending', priority: 'medium', department_id: '', due_date: '' })
    },
    onError: (e: any) => toast.error(e?.message ?? 'Kayıt oluşturulamadı.'),
  })

  const handleCreate = () => {
    if (!form.title.trim()) { toast.error('Başlık zorunludur.'); return }
    const payload: Record<string, any> = {}
    Object.entries(form).forEach(([k, v]) => { if (v !== '' && v !== null && v !== undefined) payload[k] = v })
    createMutation.mutate(payload)
  }

  const col = createColumnHelper<BaseRecord>()

  const baseColumns = [
    col.accessor('record_number', {
      header: 'Kayıt No',
      cell: (info) => <span className="text-xs font-mono text-zinc-500">{info.getValue()}</span>,
    }),
    col.accessor('title', {
      header: 'Başlık',
      cell: (info) => (
        <div>
          <p className="font-medium text-zinc-900 dark:text-zinc-100 truncate max-w-xs">{info.getValue()}</p>
          {info.row.original.department && (
            <p className="text-xs text-zinc-400">{info.row.original.department.name}</p>
          )}
        </div>
      ),
    }),
    col.accessor('status', {
      header: 'Durum',
      cell: (info) => <StatusBadge status={info.getValue()} label={info.row.original.status_label} />,
    }),
    col.accessor('priority', {
      header: 'Öncelik',
      cell: (info) => <StatusBadge status={info.getValue()} label={info.row.original.priority_label} type="priority" />,
    }),
    col.accessor('created_at', {
      header: 'Tarih',
      cell: (info) => <span className="text-sm text-zinc-500">{formatDate(info.getValue())}</span>,
    }),
    ...(extraColumns ?? []),
    col.display({
      id: 'actions',
      header: '',
      cell: (info) => {
        const row = info.row.original
        const attachCount = row.attachments_count ?? 0
        return (
          <div className="flex items-center gap-1">
            {/* Ataşman butonu */}
            <button
              title={attachCount > 0 ? `${attachCount} dosya` : 'Dosya ekle'}
              onClick={() => setAttachmentRecord({ id: row.id, title: row.title })}
              className="relative p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-blue-600 transition-colors"
            >
              <Paperclip className="h-4 w-4" />
              {attachCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 flex items-center justify-center rounded-full bg-blue-600 text-white text-[10px] font-bold leading-none">
                  {attachCount > 9 ? '9+' : attachCount}
                </span>
              )}
            </button>
            {/* Satır menüsü: watermelon "inline disclosure" — Sil seçilince aynı şerit onaya dönüşür */}
            <RowMenu
              items={[
                { icon: <Eye className="h-4 w-4" />, label: 'Detay' },
                { icon: <Pencil className="h-4 w-4" />, label: 'Düzenle' },
                {
                  icon: <Paperclip className="h-4 w-4" />,
                  label: attachCount > 0 ? `Dosyalar (${attachCount})` : 'Dosya ekle',
                  onClick: () => setAttachmentRecord({ id: row.id, title: row.title }),
                },
              ]}
              deleteIcon={<Trash2 className="h-4 w-4" />}
              onDelete={() => setDeleteId(row.id)}
            />
          </div>
        )
      },
    }),
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={description}
        breadcrumbs={[{ label: breadcrumbParent }, { label: title }]}
        actions={
          <div className="flex items-center gap-2">
            {extraActions}
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus className="h-4 w-4" />
              Yeni Kayıt
            </button>
          </div>
        }
      />

      {/* Module stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        {[
          { key: 'total',       label: 'Toplam' },
          { key: 'pending',     label: 'Bekliyor' },
          { key: 'in_progress', label: 'İşlemde' },
          { key: 'completed',   label: 'Tamamlandı' },
          { key: 'cancelled',   label: 'İptal' },
          { key: 'this_month',  label: 'Bu Ay' },
        ].map(({ key, label }) => (
          <div key={key} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 text-center">
            <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{statsData?.[key] ?? 0}</p>
            <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <FilterBar
        placeholder={`${title} kayıtlarında ara...`}
        onSearch={setSearch}
        onFilterChange={setFilters}
        filters={[
          { key: 'status',   label: 'Durum',   options: STATUS_OPTIONS },
          { key: 'priority', label: 'Öncelik', options: PRIORITY_OPTIONS },
        ]}
      />

      <DataTable
        columns={baseColumns}
        data={data?.data ?? []}
        total={data?.meta?.total ?? 0}
        pageIndex={page}
        onPaginationChange={(s) => setPage(s.pageIndex)}
        isLoading={isLoading}
        emptyMessage={`Henüz ${title.toLowerCase()} kaydı yok.`}
      />

      <ConfirmModal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        title="Kaydı sil?"
        description="Bu kayıt ve ilişkili tüm veriler kalıcı olarak silinecek."
        confirmLabel="Evet, Sil"
        loading={deleteMutation.isPending}
      />

      {/* Attachments Modal */}
      {attachmentRecord && (
        <AttachmentsModal
          recordId={attachmentRecord.id}
          recordTitle={attachmentRecord.title}
          moduleSlug={moduleSlug}
          onClose={() => setAttachmentRecord(null)}
        />
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-zinc-200 dark:border-zinc-800">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Yeni {title} Kaydı</h2>
              <button onClick={() => setShowCreate(false)} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className={labelCls}>Başlık <span className="text-red-500">*</span></label>
                <input
                  className={inputCls}
                  placeholder="Kayıt başlığı"
                  value={form.title}
                  onChange={e => setField('title', e.target.value)}
                />
              </div>

              {typeOptions && typeOptions.length > 0 && (
                <div>
                  <label className={labelCls}>Tür</label>
                  <select className={inputCls} value={form.type} onChange={e => setField('type', e.target.value)}>
                    <option value="">Seçiniz</option>
                    {typeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className={labelCls}>Öncelik</label>
                <select className={inputCls} value={form.priority} onChange={e => setField('priority', e.target.value)}>
                  {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              {departments.length > 0 && (
                <div>
                  <label className={labelCls}>Departman</label>
                  <select className={inputCls} value={form.department_id} onChange={e => setField('department_id', e.target.value)}>
                    <option value="">Seçiniz</option>
                    {departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className={labelCls}>Bitiş Tarihi</label>
                <input
                  type="date"
                  className={inputCls}
                  value={form.due_date}
                  onChange={e => setField('due_date', e.target.value)}
                />
              </div>

              {extraFormFields && extraFormFields({ form, onChange: setField })}

              <div>
                <label className={labelCls}>Açıklama</label>
                <textarea
                  className={`${inputCls} resize-none`}
                  rows={3}
                  placeholder="İsteğe bağlı açıklama..."
                  value={form.description}
                  onChange={e => setField('description', e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 px-5 pb-5">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                İptal
              </button>
              <button
                onClick={handleCreate}
                disabled={createMutation.isPending}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-60"
              >
                {createMutation.isPending ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
