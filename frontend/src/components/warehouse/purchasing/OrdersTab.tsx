'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, FileText, Loader2, PackageCheck, Plus, Search, Send, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { api, get, post, put } from '@/lib/api'
import { cn, formatDate, formatDateTime } from '@/lib/utils'
import { ConfirmModal } from '@/components/common/ConfirmModal'
import type { WarehouseProduct } from '@/types/api.types'
import { apiErrorMessage, formatQty, useWarehouses } from '../stock'
import { PO_STATUS, PURCHASING_QUERY_KEYS, formatMoney, inputCls, labelCls, useSuppliers, type PoStatus, type PurchaseOrder } from './api'

const FILTERS: { value: PoStatus | ''; label: string }[] = [
  { value: '', label: 'Tümü' },
  { value: 'draft', label: 'Taslak' },
  { value: 'sent', label: 'Gönderildi' },
  { value: 'partially_received', label: 'Kısmi Teslim' },
  { value: 'received', label: 'Teslim Alındı' },
  { value: 'cancelled', label: 'İptal' },
]

function useInvalidatePurchasing() {
  const qc = useQueryClient()
  return () => PURCHASING_QUERY_KEYS.forEach(key => qc.invalidateQueries({ queryKey: [...key] }))
}

export function StatusPill({ po }: { po: Pick<PurchaseOrder, 'status' | 'is_late'> }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap', PO_STATUS[po.status].cls)}>{PO_STATUS[po.status].label}</span>
      {po.is_late && <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">Gecikmiş</span>}
    </span>
  )
}

/**
 * Sunucuda anlık üretilen gerçek fatura PDF'ini (tüm kalemler + toplam) yeni sekmede açar.
 * Pop-up engelleyiciler await sonrası açılan pencereleri sessizce bloklar; bu yüzden
 * sekme tıklama anında hemen (senkron) açılır, PDF blob olarak gelince içine yönlendirilir.
 */
function useInvoicePdf() {
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const open = async (orderId: string) => {
    const newTab = window.open('', '_blank')
    setLoadingId(orderId)
    try {
      const res = await api.get<Blob>(`/modules/purchasing/orders/${orderId}/invoice-pdf`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      if (newTab) {
        newTab.location.href = url
      } else {
        toast.error('Tarayıcı açılır pencereyi engelledi. Adres çubuğundaki engel simgesinden izin verip tekrar deneyin.')
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch {
      newTab?.close()
      toast.error('Fatura oluşturulamadı.')
    } finally {
      setLoadingId(null)
    }
  }

  return { open, loadingId }
}

export function OrdersTab() {
  const [status, setStatus] = useState<PoStatus | ''>('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const invoicePdf = useInvoicePdf()

  const { data, isLoading } = useQuery({
    queryKey: ['purchasing-orders', status],
    queryFn: () => get<{ data: PurchaseOrder[] }>(`/modules/purchasing/orders?per_page=50${status ? `&status=${status}` : ''}`).then(r => r.data ?? []),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setStatus(f.value)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-full border transition-colors',
                status === f.value ? 'bg-blue-600 border-blue-600 text-white' : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-blue-400'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button onClick={() => setCreating(true)} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white">
          <Plus className="h-4 w-4" /> Yeni Sipariş
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-xs text-zinc-500">
            <tr>
              <th className="text-left px-3 py-2.5">Sipariş No</th>
              <th className="text-left px-3 py-2.5">Tedarikçi</th>
              <th className="text-left px-3 py-2.5">Durum</th>
              <th className="text-left px-3 py-2.5">Teslim Deposu</th>
              <th className="text-left px-3 py-2.5">Beklenen</th>
              <th className="text-right px-3 py-2.5">Kalem</th>
              <th className="text-right px-3 py-2.5">Tutar</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {isLoading ? (
              <tr><td colSpan={8} className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin text-zinc-400 inline" /></td></tr>
            ) : (data ?? []).length === 0 ? (
              <tr><td colSpan={8} className="py-12 text-center text-zinc-400">Sipariş yok.</td></tr>
            ) : data!.map(po => (
              <tr key={po.id} onClick={() => setOpenId(po.id)} className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                <td className="px-3 py-2.5 font-mono text-xs">
                  {po.po_number}
                  {po.source === 'suggestion' && <span className="ml-1.5 text-[10px] font-sans px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">Öneri</span>}
                </td>
                <td className="px-3 py-2.5">{po.supplier?.name ?? '—'}</td>
                <td className="px-3 py-2.5"><StatusPill po={po} /></td>
                <td className="px-3 py-2.5 text-zinc-500">{po.warehouse?.name ?? '—'}</td>
                <td className="px-3 py-2.5 text-zinc-500">{po.expected_date ? formatDate(po.expected_date) : '—'}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{po.items_count}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(po.total_amount, po.currency)}</td>
                <td className="px-3 py-2.5 text-right">
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); invoicePdf.open(po.id) }}
                    disabled={invoicePdf.loadingId === po.id}
                    title="Fatura PDF'ini Görüntüle"
                    className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                  >
                    {invoicePdf.loadingId === po.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {openId && <OrderModal id={openId} onClose={() => setOpenId(null)} />}
      {creating && <NewOrderModal onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setOpenId(id) }} />}
    </div>
  )
}

// ─── Sipariş detayı ──────────────────────────────────────────────────────────

interface ReceiveLine { quantity: string; damaged: string; lot: string; expiry: string }

function OrderModal({ id, onClose }: { id: string; onClose: () => void }) {
  const invalidate = useInvalidatePurchasing()
  const invoicePdf = useInvoicePdf()
  const [mode, setMode] = useState<'view' | 'receive' | 'edit'>('view')
  const [expectedDate, setExpectedDate] = useState('')
  const [receive, setReceive] = useState<Record<string, ReceiveLine>>({})
  const [edit, setEdit] = useState<Record<string, string>>({})
  const [confirmCancel, setConfirmCancel] = useState(false)

  const { data: po, isLoading } = useQuery({
    queryKey: ['purchasing-order', id],
    queryFn: () => get<{ data: PurchaseOrder }>(`/modules/purchasing/orders/${id}`).then(r => r.data),
  })

  const onDone = (message: string) => { toast.success(message); invalidate(); setMode('view') }

  const sendMutation = useMutation({
    mutationFn: () => post<{ message: string }>(`/modules/purchasing/orders/${id}/send`, { expected_date: expectedDate || null }),
    onSuccess: (r) => onDone(r.message),
    onError: (e) => toast.error(apiErrorMessage(e, 'Gönderilemedi.')),
  })

  const cancelMutation = useMutation({
    mutationFn: () => post<{ message: string }>(`/modules/purchasing/orders/${id}/cancel`),
    onSuccess: (r) => { setConfirmCancel(false); onDone(r.message) },
    onError: (e) => { setConfirmCancel(false); toast.error(apiErrorMessage(e, 'İptal edilemedi.')) },
  })

  const receiveMutation = useMutation({
    mutationFn: () => post<{ message: string }>(`/modules/purchasing/orders/${id}/receive`, {
      lines: Object.entries(receive)
        .filter(([, l]) => parseFloat(l.quantity) > 0 || parseFloat(l.damaged) > 0)
        .map(([itemId, l]) => ({
          item_id: itemId,
          quantity: parseFloat(l.quantity) || 0,
          damaged_quantity: parseFloat(l.damaged) || 0,
          lot_number: l.lot || null,
          expiry_date: l.expiry || null,
        })),
    }),
    onSuccess: (r) => { setReceive({}); onDone(r.message) },
    onError: (e) => toast.error(apiErrorMessage(e, 'Teslim alınamadı.')),
  })

  const editMutation = useMutation({
    mutationFn: () => put<{ message: string }>(`/modules/purchasing/orders/${id}`, {
      items: po!.items!.filter(i => (parseFloat(edit[i.id] ?? String(i.quantity)) || 0) > 0).map(i => ({
        product_id: i.product_id,
        quantity: parseFloat(edit[i.id] ?? String(i.quantity)),
        unit_price: i.unit_price,
      })),
    }),
    onSuccess: (r) => { setEdit({}); onDone(r.message) },
    onError: (e) => toast.error(apiErrorMessage(e, 'Kaydedilemedi.')),
  })

  const startReceive = () => {
    setReceive(Object.fromEntries((po?.items ?? []).filter(i => i.remaining > 0).map(i => [i.id, { quantity: String(i.remaining), damaged: '', lot: '', expiry: '' }])))
    setMode('receive')
  }

  const setRecv = (itemId: string, patch: Partial<ReceiveLine>) =>
    setReceive(prev => ({ ...prev, [itemId]: { ...prev[itemId], ...patch } }))

  const canReceive = po && (po.status === 'sent' || po.status === 'partially_received')
  const cancelLabel = po?.status === 'partially_received' ? 'Kalanı İptal Et / Kapat' : 'Siparişi İptal Et'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-4xl max-h-[92vh] flex flex-col">
        <div className="flex items-start justify-between p-5 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          {po ? (
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold font-mono text-zinc-900 dark:text-zinc-100">{po.po_number}</h2>
                <StatusPill po={po} />
              </div>
              <p className="text-xs text-zinc-500 mt-1">
                {po.supplier?.name} · Teslim: {po.warehouse?.name}
                {po.order_date && ` · Sipariş: ${formatDate(po.order_date)}`}
                {po.expected_date && ` · Beklenen: ${formatDate(po.expected_date)}`}
              </p>
            </div>
          ) : <span />}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => invoicePdf.open(id)}
              disabled={invoicePdf.loadingId === id}
              title="Fatura PDF'ini Görüntüle"
              className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30"
            >
              {invoicePdf.loadingId === id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400"><X className="h-4 w-4" /></button>
          </div>
        </div>

        {isLoading || !po ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-zinc-400" /></div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {mode === 'receive' && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-300">
                Sağlam miktar stok girişi olarak <strong>karantinaya</strong> işlenir; depo listesinde &quot;QC Bekliyor&quot; rozetinden fotoğraf yükleyince kullanılabilir stoğa geçer.
                Hasarlı miktar stoğa girmez, tedarikçi performansına yazılır.
              </p>
            )}

            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-xs text-zinc-500">
                  <tr>
                    <th className="text-left px-3 py-2">Ürün</th>
                    <th className="text-right px-3 py-2">Sipariş</th>
                    <th className="text-right px-3 py-2">Gelen</th>
                    <th className="text-right px-3 py-2">Hasarlı</th>
                    <th className="text-right px-3 py-2">Kalan</th>
                    <th className="text-right px-3 py-2">Birim fiyat</th>
                    {mode === 'receive' && <>
                      <th className="text-left px-3 py-2">Sağlam gelen</th>
                      <th className="text-left px-3 py-2">Hasarlı gelen</th>
                      <th className="text-left px-3 py-2">Lot</th>
                      <th className="text-left px-3 py-2">SKT</th>
                    </>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {po.items!.map(i => (
                    <tr key={i.id}>
                      <td className="px-3 py-2">
                        <p className="font-medium">{i.name}</p>
                        {i.suggestion?.reason && <p className="text-[11px] text-zinc-400 max-w-sm">{i.suggestion.reason}</p>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {mode === 'edit' ? (
                          <input type="number" min="0" step="any" value={edit[i.id] ?? String(i.quantity)} onChange={e => setEdit(p => ({ ...p, [i.id]: e.target.value }))} className={`${inputCls} w-24 py-1 text-right`} />
                        ) : `${formatQty(i.quantity)} ${i.unit ?? ''}`}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-green-600">{formatQty(i.received_qty)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-red-500">{i.damaged_qty ? formatQty(i.damaged_qty) : '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatQty(i.remaining)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(i.unit_price, po.currency)}</td>
                      {mode === 'receive' && (i.remaining > 0 ? <>
                        <td className="px-3 py-2"><input type="number" min="0" step="any" value={receive[i.id]?.quantity ?? ''} onChange={e => setRecv(i.id, { quantity: e.target.value })} className={`${inputCls} w-24 py-1`} /></td>
                        <td className="px-3 py-2"><input type="number" min="0" step="any" value={receive[i.id]?.damaged ?? ''} onChange={e => setRecv(i.id, { damaged: e.target.value })} className={`${inputCls} w-20 py-1`} placeholder="0" /></td>
                        <td className="px-3 py-2"><input value={receive[i.id]?.lot ?? ''} onChange={e => setRecv(i.id, { lot: e.target.value })} className={`${inputCls} w-24 py-1`} /></td>
                        <td className="px-3 py-2"><input type="date" value={receive[i.id]?.expiry ?? ''} onChange={e => setRecv(i.id, { expiry: e.target.value })} className={`${inputCls} py-1`} /></td>
                      </> : <td colSpan={4} className="px-3 py-2 text-xs text-zinc-400">Tamamlandı</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end text-sm">
              Toplam: <strong className="ml-2">{formatMoney(po.total_amount, po.currency)}</strong>
            </div>

            {po.receipts && po.receipts.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-2">Teslim Geçmişi</h3>
                <ul className="space-y-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                  {po.receipts.map(r => (
                    <li key={r.id} className="flex flex-wrap gap-x-2">
                      <span className="font-medium">{formatDateTime(r.received_at)}</span>
                      <span>· {r.received_by ?? '—'}</span>
                      {r.lines.map(l => {
                        const item = po.items!.find(i => i.id === l.purchase_order_item_id)
                        return <span key={l.purchase_order_item_id}>· {item?.name}: {formatQty(l.quantity)} sağlam{l.damaged_quantity > 0 && `, ${formatQty(l.damaged_quantity)} hasarlı`}</span>
                      })}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        {po && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-t border-zinc-200 dark:border-zinc-800 shrink-0">
            <div>
              {['draft', 'sent', 'partially_received'].includes(po.status) && mode === 'view' && (
                <button onClick={() => setConfirmCancel(true)} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30">
                  <Trash2 className="h-4 w-4" /> {cancelLabel}
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {mode !== 'view' && (
                <button onClick={() => { setMode('view'); setEdit({}) }} className="px-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700">Vazgeç</button>
              )}
              {po.status === 'draft' && mode === 'view' && (<>
                <button onClick={() => setMode('edit')} className="px-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700">Miktarları Düzenle</button>
                <input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} className={`${inputCls} py-1.5`} title="Beklenen teslim (boş: tedarik süresinden)" />
                <button onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60">
                  <Send className="h-4 w-4" /> {sendMutation.isPending ? 'Gönderiliyor...' : 'Tedarikçiye Gönderildi Olarak İşaretle'}
                </button>
              </>)}
              {mode === 'edit' && (
                <button onClick={() => editMutation.mutate()} disabled={editMutation.isPending} className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60">
                  {editMutation.isPending ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
              )}
              {canReceive && mode === 'view' && (
                <button onClick={startReceive} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-green-600 hover:bg-green-700 text-white">
                  <PackageCheck className="h-4 w-4" /> Teslim Al
                </button>
              )}
              {mode === 'receive' && (
                <button onClick={() => receiveMutation.mutate()} disabled={receiveMutation.isPending} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-green-600 hover:bg-green-700 text-white disabled:opacity-60">
                  <PackageCheck className="h-4 w-4" /> {receiveMutation.isPending ? 'Kaydediliyor...' : 'Teslimi Kaydet'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={() => cancelMutation.mutate()}
        title={cancelLabel + '?'}
        description={po?.status === 'partially_received'
          ? 'Teslim alınan miktar stokta kalır; gelmeyen miktar iptal edilir ve sipariş kapanır.'
          : 'Sipariş iptal edilir. Bu işlem geri alınamaz.'}
        confirmLabel="Evet"
        loading={cancelMutation.isPending}
      />
    </div>
  )
}

// ─── Manuel sipariş ──────────────────────────────────────────────────────────

interface DraftLine { product: WarehouseProduct; quantity: string; unit_price: string }

function NewOrderModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const invalidate = useInvalidatePurchasing()
  const { data: suppliers = [] } = useSuppliers(true)
  const { data: warehouses = [] } = useWarehouses()
  const [supplierId, setSupplierId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [notes, setNotes] = useState('')
  const [query, setQuery] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([])

  const { data: results = [], isFetching } = useQuery({
    queryKey: ['warehouse-products-search', query],
    queryFn: () => get<{ data: WarehouseProduct[] }>(`/modules/warehouse-products/search?q=${encodeURIComponent(query)}`).then(r => r.data ?? []),
    enabled: query.length >= 1,
  })

  const createMutation = useMutation({
    mutationFn: () => post<{ data: PurchaseOrder }>('/modules/purchasing/orders', {
      supplier_id: supplierId,
      warehouse_id: warehouseId || null,
      notes: notes || null,
      items: lines.map(l => ({ product_id: l.product.id, quantity: parseFloat(l.quantity), unit_price: l.unit_price ? parseFloat(l.unit_price) : null })),
    }),
    onSuccess: (r) => { toast.success('Taslak sipariş oluşturuldu.'); invalidate(); onCreated(r.data.id) },
    onError: (e) => toast.error(apiErrorMessage(e, 'Oluşturulamadı.')),
  })

  const addProduct = (p: WarehouseProduct) => {
    if (!lines.some(l => l.product.id === p.id)) {
      setLines(prev => [...prev, { product: p, quantity: '', unit_price: p.unit_price != null ? String(p.unit_price) : '' }])
    }
    setQuery('')
  }

  const submit = () => {
    if (!supplierId) { toast.error('Tedarikçi seçin.'); return }
    if (lines.length === 0) { toast.error('En az bir ürün ekleyin.'); return }
    if (lines.some(l => !(parseFloat(l.quantity) > 0))) { toast.error('Miktarları girin.'); return }
    createMutation.mutate()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Yeni Satın Alma Siparişi</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Tedarikçi <span className="text-red-500">*</span></label>
              <select value={supplierId} onChange={e => setSupplierId(e.target.value)} className={`${inputCls} w-full`}>
                <option value="">Seçin</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {suppliers.length === 0 && <p className="mt-1 text-xs text-amber-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Önce Tedarikçiler sekmesinden tedarikçi ekleyin.</p>}
            </div>
            <div>
              <label className={labelCls}>Teslim deposu</label>
              <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)} className={`${inputCls} w-full`}>
                <option value="">Varsayılan depo</option>
                {warehouses.filter(w => w.is_active).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
          </div>

          <div className="relative">
            <label className={labelCls}>Ürün ekle</label>
            <Search className="absolute left-3 top-[34px] h-4 w-4 text-zinc-400" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Ürün adı, SKU veya barkod..." className={`${inputCls} w-full pl-9`} />
            {query && (results.length > 0 || isFetching) && (
              <div className="absolute z-10 w-full mt-1 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-lg max-h-52 overflow-y-auto">
                {isFetching && <p className="px-3 py-2 text-xs text-zinc-400">Aranıyor...</p>}
                {results.map(p => (
                  <button key={p.id} type="button" onClick={() => addProduct(p)} className="w-full text-left px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 text-sm">
                    {p.name} <span className="text-xs text-zinc-400">{p.sku} · stok {formatQty(p.current_stock)} {p.unit}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {lines.length > 0 && (
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800">
              {lines.map((l, idx) => (
                <div key={l.product.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <span className="flex-1 min-w-40 text-sm font-medium">{l.product.name}</span>
                  <input type="number" min="0" step="any" placeholder="Miktar" value={l.quantity} onChange={e => setLines(p => p.map((x, i) => i === idx ? { ...x, quantity: e.target.value } : x))} className={`${inputCls} w-24 py-1.5`} />
                  <span className="text-xs text-zinc-400 w-10">{l.product.unit}</span>
                  <input type="number" min="0" step="any" placeholder="Birim ₺" value={l.unit_price} onChange={e => setLines(p => p.map((x, i) => i === idx ? { ...x, unit_price: e.target.value } : x))} className={`${inputCls} w-24 py-1.5`} />
                  <button onClick={() => setLines(p => p.filter((_, i) => i !== idx))} className="p-1.5 text-zinc-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          )}

          <div>
            <label className={labelCls}>Not</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className={`${inputCls} w-full resize-none`} />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-zinc-200 dark:border-zinc-800 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700">İptal</button>
          <button onClick={submit} disabled={createMutation.isPending} className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60">
            {createMutation.isPending ? 'Oluşturuluyor...' : 'Taslak Oluştur'}
          </button>
        </div>
      </div>
    </div>
  )
}
