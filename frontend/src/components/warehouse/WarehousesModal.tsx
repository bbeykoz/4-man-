'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Building2, Loader2, Pencil, Plus, Star, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { del, post, put } from '@/lib/api'
import { cn } from '@/lib/utils'
import { ConfirmModal } from '@/components/common/ConfirmModal'
import { apiErrorMessage, formatQty, useWarehouses, type Warehouse } from './stock'

const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelCls = 'block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1'

const emptyForm = { name: '', code: '', city: '', address: '', capacity: '' }

export function WarehousesModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const { data: warehouses = [], isLoading } = useWarehouses()
  const [editing, setEditing] = useState<Warehouse | 'new' | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [deleteTarget, setDeleteTarget] = useState<Warehouse | null>(null)

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['stock-warehouses'] })
    qc.invalidateQueries({ queryKey: ['stock-balances'] })
  }

  const saveMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editing && editing !== 'new'
        ? put(`/modules/stock/warehouses/${editing.id}`, payload)
        : post('/modules/stock/warehouses', payload),
    onSuccess: () => {
      toast.success(editing === 'new' ? 'Depo oluşturuldu.' : 'Depo güncellendi.')
      refresh()
      setEditing(null)
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Kaydedilemedi.')),
  })

  const patchMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      put(`/modules/stock/warehouses/${id}`, payload),
    onSuccess: () => { toast.success('Depo güncellendi.'); refresh() },
    onError: (e) => toast.error(apiErrorMessage(e, 'Güncellenemedi.')),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => del(`/modules/stock/warehouses/${id}`),
    onSuccess: () => { toast.success('Depo silindi.'); refresh(); setDeleteTarget(null) },
    onError: (e) => { toast.error(apiErrorMessage(e, 'Silinemedi.')); setDeleteTarget(null) },
  })

  const openForm = (w: Warehouse | 'new') => {
    setEditing(w)
    setForm(w === 'new' ? emptyForm : {
      name: w.name, code: w.code, city: w.city ?? '', address: w.address ?? '', capacity: w.capacity ? String(w.capacity) : '',
    })
  }

  const submit = () => {
    if (!form.name.trim() || !form.code.trim()) { toast.error('Depo adı ve kodu zorunludur.'); return }
    saveMutation.mutate({
      name: form.name.trim(),
      code: form.code.trim().toUpperCase(),
      city: form.city || null,
      address: form.address || null,
      capacity: form.capacity ? parseInt(form.capacity) : null,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-blue-600" />
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Depolar</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => openForm('new')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Yeni Depo
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {editing && (
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 shrink-0">
            <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-3">
              {editing === 'new' ? 'Yeni Depo' : `${editing.name} düzenleniyor`}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Depo Adı <span className="text-red-500">*</span></label>
                <input className={inputCls} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="İstanbul Deposu" />
              </div>
              <div>
                <label className={labelCls}>Kod <span className="text-red-500">*</span></label>
                <input className={inputCls} value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="IST" maxLength={20} />
              </div>
              <div>
                <label className={labelCls}>Şehir</label>
                <input className={inputCls} value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls}>Kapasite (stok birimi)</label>
                <input type="number" min="1" className={inputCls} value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))} placeholder="Doluluk oranı için" />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Adres</label>
                <input className={inputCls} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setEditing(null)} className="px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400">İptal</button>
              <button onClick={submit} disabled={saveMutation.isPending} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60">
                {saveMutation.isPending ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-zinc-400" /></div>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {warehouses.map(w => (
                <div key={w.id} className={cn('flex items-center gap-3 px-5 py-3', !w.is_active && 'opacity-60')}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{w.name}</p>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">{w.code}</span>
                      {w.is_default && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">Varsayılan</span>}
                      {!w.is_active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-200 text-zinc-600 dark:bg-zinc-800">Pasif</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs text-zinc-400">
                      {w.city && <span>{w.city}</span>}
                      <span>{w.product_count} ürün</span>
                      <span>Kullanılabilir: <strong className="text-zinc-600 dark:text-zinc-300">{formatQty(w.available)}</strong></span>
                      {w.quarantine > 0 && <span className="text-amber-600">Karantina: {formatQty(w.quarantine)}</span>}
                      {w.damaged > 0 && <span className="text-red-500">Hasarlı: {formatQty(w.damaged)}</span>}
                      {w.fill_rate != null && <span>Doluluk: %{w.fill_rate}</span>}
                    </div>
                  </div>
                  {!w.is_default && w.is_active && (
                    <button title="Varsayılan yap" onClick={() => patchMutation.mutate({ id: w.id, payload: { is_default: true } })}
                      className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 text-zinc-400 hover:text-blue-600">
                      <Star className="h-4 w-4" />
                    </button>
                  )}
                  {!w.is_default && (
                    <button
                      title={w.is_active ? 'Pasife al' : 'Aktifleştir'}
                      onClick={() => patchMutation.mutate({ id: w.id, payload: { is_active: !w.is_active } })}
                      className="px-2 py-1 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    >
                      {w.is_active ? 'Pasife al' : 'Aktifleştir'}
                    </button>
                  )}
                  <button title="Düzenle" onClick={() => openForm(w)} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-blue-600">
                    <Pencil className="h-4 w-4" />
                  </button>
                  {!w.is_default && (
                    <button title="Sil" onClick={() => setDeleteTarget(w)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-zinc-400 hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end px-5 py-4 border-t border-zinc-200 dark:border-zinc-800 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800">Kapat</button>
        </div>
      </div>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title={`${deleteTarget?.name ?? ''} silinsin mi?`}
        description="Sadece stoğu olmayan depolar silinebilir. Stoğu varsa önce transfer edin veya pasife alın."
        confirmLabel="Sil"
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
