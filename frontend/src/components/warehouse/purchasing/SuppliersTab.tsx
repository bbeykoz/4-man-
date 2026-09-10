'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { del, post, put } from '@/lib/api'
import { cn } from '@/lib/utils'
import { ConfirmModal } from '@/components/common/ConfirmModal'
import { apiErrorMessage } from '../stock'
import { inputCls, labelCls, useSuppliers, type Supplier } from './api'

const emptyForm = { name: '', code: '', contact_name: '', phone: '', email: '', tax_number: '', address: '', default_lead_time_days: '', notes: '' }

export function SuppliersTab() {
  const qc = useQueryClient()
  const { data: suppliers = [], isLoading } = useSuppliers()
  const [editing, setEditing] = useState<Supplier | 'new' | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null)

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['purchasing-suppliers'] })
    qc.invalidateQueries({ queryKey: ['stock-risk'] })
    qc.invalidateQueries({ queryKey: ['purchasing-suggestions'] })
  }

  const saveMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editing && editing !== 'new' ? put(`/modules/purchasing/suppliers/${editing.id}`, payload) : post('/modules/purchasing/suppliers', payload),
    onSuccess: () => { toast.success(editing === 'new' ? 'Tedarikçi eklendi.' : 'Tedarikçi güncellendi.'); refresh(); setEditing(null) },
    onError: (e) => toast.error(apiErrorMessage(e, 'Kaydedilemedi.')),
  })

  const toggleMutation = useMutation({
    mutationFn: (s: Supplier) => put(`/modules/purchasing/suppliers/${s.id}`, { is_active: !s.is_active }),
    onSuccess: () => { toast.success('Güncellendi.'); refresh() },
    onError: (e) => toast.error(apiErrorMessage(e, 'Güncellenemedi.')),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => del(`/modules/purchasing/suppliers/${id}`),
    onSuccess: () => { toast.success('Tedarikçi silindi.'); refresh(); setDeleteTarget(null) },
    onError: (e) => { toast.error(apiErrorMessage(e, 'Silinemedi.')); setDeleteTarget(null) },
  })

  const openForm = (s: Supplier | 'new') => {
    setEditing(s)
    setForm(s === 'new' ? emptyForm : {
      name: s.name, code: s.code, contact_name: s.contact_name ?? '', phone: s.phone ?? '', email: s.email ?? '',
      tax_number: s.tax_number ?? '', address: s.address ?? '',
      default_lead_time_days: s.default_lead_time_days ? String(s.default_lead_time_days) : '', notes: s.notes ?? '',
    })
  }

  const submit = () => {
    if (!form.name.trim() || !form.code.trim()) { toast.error('Ad ve kod zorunludur.'); return }
    saveMutation.mutate({
      ...Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === '' ? null : v])),
      code: form.code.trim().toUpperCase(),
      default_lead_time_days: form.default_lead_time_days ? parseInt(form.default_lead_time_days) : null,
    })
  }

  const field = (key: keyof typeof emptyForm, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label className={labelCls}>{label}</label>
      <input className={`${inputCls} w-full`} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} {...props} />
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => openForm('new')} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white">
          <Plus className="h-4 w-4" /> Yeni Tedarikçi
        </button>
      </div>

      {editing && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 p-4">
          <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-3">{editing === 'new' ? 'Yeni Tedarikçi' : `${editing.name} düzenleniyor`}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {field('name', 'Ad *')}
            {field('code', 'Kod *', { maxLength: 30 })}
            {field('default_lead_time_days', 'Varsayılan tedarik süresi (gün)', { type: 'number', min: 1, max: 365 })}
            {field('contact_name', 'Yetkili')}
            {field('phone', 'Telefon')}
            {field('email', 'E-posta', { type: 'email' })}
            {field('tax_number', 'Vergi no')}
            <div className="sm:col-span-2">{field('address', 'Adres')}</div>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <button onClick={() => setEditing(null)} className="px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700">İptal</button>
            <button onClick={submit} disabled={saveMutation.isPending} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60">
              {saveMutation.isPending ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-xs text-zinc-500">
            <tr>
              <th className="text-left px-3 py-2.5">Tedarikçi</th>
              <th className="text-left px-3 py-2.5">İletişim</th>
              <th className="text-right px-3 py-2.5">Tedarik süresi</th>
              <th className="text-right px-3 py-2.5">Ürün</th>
              <th className="text-right px-3 py-2.5">Açık sipariş</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {isLoading ? (
              <tr><td colSpan={6} className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin text-zinc-400 inline" /></td></tr>
            ) : suppliers.length === 0 ? (
              <tr><td colSpan={6} className="py-12 text-center text-zinc-400">Tedarikçi yok.</td></tr>
            ) : suppliers.map(s => (
              <tr key={s.id} className={cn(!s.is_active && 'opacity-60')}>
                <td className="px-3 py-2.5">
                  <p className="font-medium">{s.name} <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">{s.code}</span></p>
                  {!s.is_active && <p className="text-[11px] text-zinc-400">Pasif</p>}
                </td>
                <td className="px-3 py-2.5 text-xs text-zinc-500">{[s.contact_name, s.phone, s.email].filter(Boolean).join(' · ') || '—'}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{s.default_lead_time_days ? `${s.default_lead_time_days} gün` : '—'}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{s.products_count ?? 0}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{s.open_orders_count ?? 0}</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => toggleMutation.mutate(s)} className="px-2 py-1 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-500">
                      {s.is_active ? 'Pasife al' : 'Aktifleştir'}
                    </button>
                    <button onClick={() => openForm(s)} className="p-1.5 rounded-lg text-zinc-400 hover:text-blue-600 hover:bg-zinc-100 dark:hover:bg-zinc-800"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => setDeleteTarget(s)} className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title={`${deleteTarget?.name ?? ''} silinsin mi?`}
        description="Siparişi olan tedarikçi silinemez; pasife alabilirsiniz."
        confirmLabel="Sil"
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
