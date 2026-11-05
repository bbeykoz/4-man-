'use client'

import { useState } from 'react'
import { BrandLoaderBlock } from '@/components/common/BrandLoader'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Loader2, MessageSquarePlus,
  Package, Plus, Trash2, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { get, post, put, del } from '@/lib/api'
import { cn, formatDateTime } from '@/lib/utils'
import { StatsCard } from '@/components/common/StatsCard'
import { ConfirmModal } from '@/components/common/ConfirmModal'
import { useAuthStore } from '@/store/auth.store'
import { apiErrorMessage } from './stock'

interface CheckItem {
  id: string
  title: string
  sku?: string | null
  description?: string | null
  is_checked: boolean
  note: string | null
  checked_by_name: string | null
  checked_at: string | null
}

interface DailyCheckData {
  date: string
  products: CheckItem[]
  tasks: CheckItem[]
  summary: { products_total: number; products_checked: number; tasks_total: number; tasks_checked: number }
}

const todayStr = () => new Date().toLocaleDateString('sv-SE') // YYYY-MM-DD, yerel saate göre

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString('sv-SE')
}

function formatDay(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })
}

/** Bir kontrol satırı: işaretle/kaldır, not ekle, (görevlerde) kaldır. */
function CheckRow({
  item, icon: Icon, saving, onToggle, onSaveNote, onDelete,
}: {
  item: CheckItem
  icon: typeof Package
  saving: boolean
  onToggle: () => void
  onSaveNote: (note: string) => void
  onDelete?: () => void
}) {
  const [editingNote, setEditingNote] = useState(false)
  const [noteDraft, setNoteDraft] = useState(item.note ?? '')

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggle}
          disabled={saving}
          title={item.is_checked ? 'Kontrol işaretini kaldır' : 'Kontrol edildi olarak işaretle'}
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
            item.is_checked
              ? 'border-green-600 bg-green-600 text-white'
              : 'border-zinc-300 dark:border-zinc-600 text-transparent hover:border-green-500'
          )}
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
        </button>

        <Icon className="h-4 w-4 text-zinc-400 shrink-0" />

        <div className="min-w-0 flex-1">
          <p className={cn('text-sm font-medium truncate', item.is_checked ? 'text-zinc-500 dark:text-zinc-400 line-through decoration-zinc-300' : 'text-zinc-900 dark:text-zinc-100')}>
            {item.title}
          </p>
          <div className="flex flex-wrap items-center gap-x-2 text-xs text-zinc-400">
            {item.sku && <span>SKU: {item.sku}</span>}
            {item.description && <span>{item.description}</span>}
            {item.is_checked && item.checked_by_name && (
              <span>{item.checked_by_name} · {item.checked_at ? formatDateTime(item.checked_at) : ''}</span>
            )}
          </div>
        </div>

        <button type="button" onClick={() => setEditingNote(v => !v)} title="Not ekle/düzenle" className="p-1.5 rounded-lg text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 shrink-0">
          <MessageSquarePlus className="h-4 w-4" />
        </button>
        {onDelete && (
          <button type="button" onClick={onDelete} title="Görevi kaldır" className="p-1.5 rounded-lg text-zinc-300 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 shrink-0">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {!editingNote && item.note && (
        <p className="mt-1.5 ml-10 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg px-2.5 py-1.5">
          {item.note}
        </p>
      )}

      {editingNote && (
        <div className="mt-2 ml-10 flex gap-2">
          <input
            autoFocus
            value={noteDraft}
            onChange={e => setNoteDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { onSaveNote(noteDraft); setEditingNote(false) } }}
            placeholder="Not ekle (ör. bir sorun gördüyseniz)..."
            className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button onClick={() => { onSaveNote(noteDraft); setEditingNote(false) }} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white">Kaydet</button>
          <button onClick={() => { setNoteDraft(item.note ?? ''); setEditingNote(false) }} className="px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300">Vazgeç</button>
        </div>
      )}
    </div>
  )
}

function AddTaskModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  const createMutation = useMutation({
    mutationFn: () => post<{ message: string }>('/modules/daily-check/tasks', { title, description: description || null }),
    onSuccess: (r) => { toast.success(r.message); onCreated(); onClose() },
    onError: (e) => toast.error(apiErrorMessage(e, 'Görev eklenemedi.')),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Yeni Günlük Görev</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Görev Başlığı <span className="text-red-500">*</span></label>
            <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Örn. Depo temizliği, soğuk zincir sıcaklığı..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Açıklama</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="İsteğe bağlı"
              className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
          <p className="text-xs text-zinc-400">Bu görev her gün listede görünür; her gün ayrı ayrı işaretlenir.</p>
        </div>
        <div className="flex justify-end gap-3 px-5 pb-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300">İptal</button>
          <button
            onClick={() => { if (!title.trim()) { toast.error('Görev başlığı zorunludur.'); return }; createMutation.mutate() }}
            disabled={createMutation.isPending}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60"
          >
            {createMutation.isPending ? 'Ekleniyor...' : 'Ekle'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Depo/üretim alanında günlük yapılan kontrollerin kaydı: ürün bazında + şirketin tanımladığı genel görevler. */
export function DailyCheckPanel() {
  const qc = useQueryClient()
  const { isCompanyOwner } = useAuthStore()
  const canManageTasks = isCompanyOwner()
  const today = todayStr()
  const [date, setDate] = useState(today)
  const [showAddTask, setShowAddTask] = useState(false)
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['daily-check', date],
    queryFn: () => get<{ data: DailyCheckData }>(`/modules/daily-check?date=${date}`).then(r => r.data),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['daily-check', date] })

  const checkProductMutation = useMutation({
    mutationFn: ({ id, checked, note }: { id: string; checked: boolean; note?: string | null }) =>
      post<{ message: string }>(`/modules/daily-check/products/${id}`, { date, checked, note }),
    onSuccess: (r) => { toast.success(r.message); invalidate() },
    onError: (e) => toast.error(apiErrorMessage(e, 'Kaydedilemedi.')),
    onSettled: () => setSavingId(null),
  })

  const checkTaskMutation = useMutation({
    mutationFn: ({ id, checked, note }: { id: string; checked: boolean; note?: string | null }) =>
      post<{ message: string }>(`/modules/daily-check/tasks/${id}/check`, { date, checked, note }),
    onSuccess: (r) => { toast.success(r.message); invalidate() },
    onError: (e) => toast.error(apiErrorMessage(e, 'Kaydedilemedi.')),
    onSettled: () => setSavingId(null),
  })

  const deleteTaskMutation = useMutation({
    mutationFn: (id: string) => del<{ message: string }>(`/modules/daily-check/tasks/${id}`),
    onSuccess: (r) => { toast.success(r.message); setDeleteTaskId(null); invalidate() },
    onError: (e) => { setDeleteTaskId(null); toast.error(apiErrorMessage(e, 'Görev kaldırılamadı.')) },
  })

  const summary = data?.summary

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-1.5">
          <button onClick={() => setDate(d => addDays(d, -1))} className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input
            type="date" value={date} max={today}
            onChange={e => e.target.value && setDate(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900"
          />
          <button onClick={() => setDate(d => addDays(d, 1))} disabled={date >= today} className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40">
            <ChevronRight className="h-4 w-4" />
          </button>
          {date !== today && (
            <button onClick={() => setDate(today)} className="text-xs text-blue-600 hover:underline ml-1">Bugüne dön</button>
          )}
          <span className="text-sm text-zinc-500 ml-2 capitalize">{formatDay(date)}</span>
        </div>
      </div>

      {isLoading || !data ? (
        <BrandLoaderBlock size={64} />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <StatsCard
              title="Ürün Kontrolleri" icon={Package} color="blue"
              value={`${summary!.products_checked}/${summary!.products_total}`}
              subtitle={summary!.products_total === 0 ? 'Aktif ürün yok' : summary!.products_checked === summary!.products_total ? 'Hepsi kontrol edildi ✓' : `${summary!.products_total - summary!.products_checked} ürün kaldı`}
            />
            <StatsCard
              title="Genel Görevler" icon={ClipboardList} color="purple"
              value={`${summary!.tasks_checked}/${summary!.tasks_total}`}
              subtitle={summary!.tasks_total === 0 ? 'Henüz görev eklenmedi' : summary!.tasks_checked === summary!.tasks_total ? 'Hepsi tamamlandı ✓' : `${summary!.tasks_total - summary!.tasks_checked} görev kaldı`}
            />
          </div>

          <section>
            <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-2">Ürün Kontrolleri</h3>
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
              {data.products.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-zinc-400">Aktif ürün yok. Önce Ürün Kataloğu&apos;na ürün ekleyin.</p>
              ) : data.products.map(p => (
                <CheckRow
                  key={p.id} item={p} icon={Package}
                  saving={savingId === p.id}
                  onToggle={() => { setSavingId(p.id); checkProductMutation.mutate({ id: p.id, checked: !p.is_checked, note: p.note }) }}
                  onSaveNote={note => { setSavingId(p.id); checkProductMutation.mutate({ id: p.id, checked: p.is_checked, note }) }}
                />
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Genel Görevler</h3>
              {canManageTasks && (
                <button onClick={() => setShowAddTask(true)} className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:underline">
                  <Plus className="h-3.5 w-3.5" /> Görev Ekle
                </button>
              )}
            </div>
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
              {data.tasks.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-zinc-400">
                  {canManageTasks ? <>Henüz genel görev tanımlanmadı. &quot;Görev Ekle&quot; ile başlayın.</> : 'Henüz genel görev tanımlanmadı. Görevler şirket sahibi tarafından eklenir.'}
                </p>
              ) : data.tasks.map(t => (
                <CheckRow
                  key={t.id} item={t} icon={ClipboardList}
                  saving={savingId === t.id}
                  onToggle={() => { setSavingId(t.id); checkTaskMutation.mutate({ id: t.id, checked: !t.is_checked, note: t.note }) }}
                  onSaveNote={note => { setSavingId(t.id); checkTaskMutation.mutate({ id: t.id, checked: t.is_checked, note }) }}
                  onDelete={canManageTasks ? () => setDeleteTaskId(t.id) : undefined}
                />
              ))}
            </div>
          </section>
        </>
      )}

      {showAddTask && <AddTaskModal onClose={() => setShowAddTask(false)} onCreated={invalidate} />}

      <ConfirmModal
        open={!!deleteTaskId}
        onClose={() => setDeleteTaskId(null)}
        onConfirm={() => deleteTaskId && deleteTaskMutation.mutate(deleteTaskId)}
        title="Görevi kaldır?"
        description="Bu görev ve geçmiş tüm günlerdeki kontrol kayıtları kalıcı olarak silinecek."
        confirmLabel="Evet, Kaldır"
        loading={deleteTaskMutation.isPending}
      />
    </div>
  )
}
