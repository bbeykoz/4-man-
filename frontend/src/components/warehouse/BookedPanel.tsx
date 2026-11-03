'use client'

// Booked: siparişe ayrılan stok. Stok çıkışı kaydı açılınca ürün serbest stoktan
// rezerveye geçer, böylece verilen siparişler depodaki stokla karışmaz.
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bookmark, CheckCircle2, Loader2, PackageCheck, PlusCircle, Search, TriangleAlert, X } from 'lucide-react'
import { toast } from 'sonner'
import { get, post } from '@/lib/api'
import { cn, formatDate } from '@/lib/utils'
import { ConfirmModal } from '@/components/common/ConfirmModal'
import { apiErrorMessage, formatQty, useWarehouses } from './stock'

type ReservationStatus = 'open' | 'delivered' | 'cancelled'

interface Reservation {
  id: string
  record_id: string
  record_number: string | null
  record_title: string | null
  product_id: string
  product_name: string | null
  sku: string | null
  unit: string | null
  warehouse_name: string | null
  lot_number: string | null
  quantity: number
  reserved_quantity: number
  delivered_quantity: number
  remaining: number
  shortage: number
  status: ReservationStatus
  reference: string | null
  due_date: string | null
  created_by_name: string | null
  created_at: string | null
}

interface Summary {
  open_count: number
  reserved_total: number
  shortage_count: number
}

const STATUS: Record<ReservationStatus, { label: string; cls: string }> = {
  open:      { label: 'Açık',          cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  delivered: { label: 'Teslim edildi', cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  cancelled: { label: 'İptal',         cls: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400' },
}

const FILTERS: { id: ReservationStatus | 'all'; label: string }[] = [
  { id: 'open',      label: 'Açık siparişler' },
  { id: 'delivered', label: 'Teslim edilen' },
  { id: 'cancelled', label: 'İptal' },
  { id: 'all',       label: 'Tümü' },
]

// ─── Teslim penceresi ────────────────────────────────────────────────────────

function DeliverModal({ row, onClose, onDone }: { row: Reservation; onClose: () => void; onDone: () => void }) {
  const [qty, setQty] = useState(String(row.remaining))
  const [saving, setSaving] = useState(false)

  const parsed  = parseFloat(qty)
  const invalid = !Number.isFinite(parsed) || parsed <= 0 || parsed > row.remaining

  const submit = async () => {
    if (invalid) return
    setSaving(true)
    try {
      await post(`/modules/stock/reservations/${row.id}/deliver`, { quantity: parsed })
      toast.success(parsed >= row.remaining ? 'Sipariş teslim edildi.' : 'Kısmi teslimat kaydedildi.')
      onDone()
      onClose()
    } catch (e) {
      toast.error(apiErrorMessage(e, 'Teslimat kaydedilemedi.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b border-zinc-200 dark:border-zinc-800">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Teslim Et</h2>
            <p className="text-xs text-zinc-500 truncate">{row.record_number} · {row.product_name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              ['Sipariş', row.quantity],
              ['Rezerve', row.reserved_quantity],
              ['Kalan', row.remaining],
            ].map(([label, value]) => (
              <div key={label as string} className="rounded-lg bg-zinc-50 dark:bg-zinc-800/60 py-2">
                <p className="text-[11px] text-zinc-500">{label}</p>
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{formatQty(value as number)}</p>
              </div>
            ))}
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
              Teslim miktarı {row.unit && <span className="text-zinc-400">({row.unit})</span>}
            </label>
            <input
              type="number"
              min="0"
              step="0.001"
              max={row.remaining}
              value={qty}
              onChange={e => setQty(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm"
            />
            {invalid && (
              <p className="mt-1 text-xs text-red-500">
                1 ile {formatQty(row.remaining)} arasında bir miktar girin.
              </p>
            )}
          </div>

          <p className="text-xs text-zinc-500">
            Teslim edilen miktar rezerveden düşer ve depodan çıkar. Tamamı teslim edilince sipariş kapanır.
          </p>
        </div>

        <div className="flex justify-end gap-3 px-5 pb-5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            Vazgeç
          </button>
          <button
            onClick={submit}
            disabled={invalid || saving}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-green-600 hover:bg-green-700 text-white disabled:opacity-60"
          >
            {saving ? 'Kaydediliyor...' : 'Teslim Et'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Panel ───────────────────────────────────────────────────────────────────

export function BookedPanel() {
  const qc = useQueryClient()
  const { data: warehouses = [] } = useWarehouses()

  const [status, setStatus]           = useState<ReservationStatus | 'all'>('open')
  const [warehouseId, setWarehouseId] = useState('')
  const [search, setSearch]           = useState('')
  const [deliverRow, setDeliverRow]   = useState<Reservation | null>(null)
  const [cancelRow, setCancelRow]     = useState<Reservation | null>(null)

  const params = new URLSearchParams({ status })
  if (warehouseId) params.set('warehouse_id', warehouseId)
  if (search.trim()) params.set('search', search.trim())

  const { data, isLoading } = useQuery({
    queryKey: ['stock-reservations', status, warehouseId, search],
    queryFn: () => get<{ data: Reservation[]; summary: Summary }>(`/modules/stock/reservations?${params}`),
  })

  const rows    = data?.data ?? []
  const summary = data?.summary

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['stock-reservations'] })
    qc.invalidateQueries({ queryKey: ['stock-balances'] })
    qc.invalidateQueries({ queryKey: ['warehouses'] })
  }

  const cancelMutation = useMutation({
    mutationFn: (id: string) => post(`/modules/stock/reservations/${id}/cancel`, {}),
    onSuccess: () => {
      toast.success('Rezerve iptal edildi, kalan miktar serbest stoğa döndü.')
      setCancelRow(null)
      refresh()
    },
    onError: (e) => { toast.error(apiErrorMessage(e, 'İptal edilemedi.')); setCancelRow(null) },
  })

  const topUpMutation = useMutation({
    mutationFn: (id: string) => post<{ message: string }>(`/modules/stock/reservations/${id}/top-up`, {}),
    onSuccess: (res) => { toast.success(res.message ?? 'Rezerve tamamlandı.'); refresh() },
    onError: (e) => toast.error(apiErrorMessage(e, 'Rezerve tamamlanamadı.')),
  })

  const cards = [
    { label: 'Açık sipariş',     value: summary?.open_count ?? 0,                 Icon: Bookmark,      cls: 'text-blue-600 dark:text-blue-400' },
    { label: 'Rezervedeki stok', value: formatQty(summary?.reserved_total ?? 0),  Icon: PackageCheck,  cls: 'text-green-600 dark:text-green-400' },
    { label: 'Stok yetmeyen',    value: summary?.shortage_count ?? 0,             Icon: TriangleAlert, cls: 'text-amber-600 dark:text-amber-400' },
  ]

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-blue-50/60 dark:bg-blue-950/20 px-4 py-3">
        <p className="text-xs text-zinc-600 dark:text-zinc-300">
          Stok çıkışı kaydı açıldığında ürün otomatik rezerve edilir ve serbest stoktan düşer.
          Böylece verilen siparişler depodaki stokla karışmaz. Teslimatı buradan yapın.
        </p>
      </div>

      {/* Özet */}
      <div className="grid gap-3 sm:grid-cols-3">
        {cards.map(({ label, value, Icon, cls }) => (
          <div key={label} className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
            <div className="flex items-center gap-2">
              <Icon className={cn('h-4 w-4', cls)} />
              <p className="text-xs text-zinc-500">{label}</p>
            </div>
            <p className="mt-1 text-xl font-semibold text-zinc-900 dark:text-zinc-100">{value}</p>
          </div>
        ))}
      </div>

      {/* Filtreler */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setStatus(f.id)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                status === f.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <select
          value={warehouseId}
          onChange={e => setWarehouseId(e.target.value)}
          className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-1.5 text-xs"
        >
          <option value="">Tüm depolar</option>
          {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>

        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Sipariş no, ürün veya referans"
            className="w-56 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 pl-8 pr-3 py-1.5 text-xs"
          />
        </div>
      </div>

      {/* Liste */}
      <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-zinc-400" /></div>
        ) : rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-zinc-500">
            {status === 'open' ? 'Açık sipariş yok. Stok çıkışı kaydı açtığınızda burada görünür.' : 'Kayıt yok.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-800/60 text-xs text-zinc-500">
                <tr>
                  {['Sipariş', 'Ürün', 'Depo', 'Sipariş', 'Rezerve', 'Teslim', 'Kalan', 'Durum', ''].map((h, i) => (
                    <th key={i} className={cn('px-3 py-2 font-medium', i >= 3 && i <= 6 ? 'text-right' : 'text-left')}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {rows.map(r => (
                  <tr key={r.id} className={cn(r.status !== 'open' && 'opacity-60')}>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-zinc-900 dark:text-zinc-100">{r.record_number}</p>
                      <p className="text-xs text-zinc-500">
                        {r.reference}
                        {r.due_date && <> · {formatDate(r.due_date)}</>}
                      </p>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="text-zinc-900 dark:text-zinc-100">{r.product_name}</p>
                      <p className="text-xs text-zinc-500">
                        {r.sku}
                        {r.lot_number && <> · Lot {r.lot_number}</>}
                      </p>
                    </td>
                    <td className="px-3 py-2.5 text-zinc-600 dark:text-zinc-400">{r.warehouse_name ?? '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatQty(r.quantity)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatQty(r.reserved_quantity)}
                      {r.shortage > 0 && (
                        <span
                          title={`Serbest stok yetmedi, ${formatQty(r.shortage)} ${r.unit ?? ''} rezerve edilemedi`}
                          className="ml-1 inline-flex items-center gap-0.5 text-[11px] text-amber-600 dark:text-amber-400"
                        >
                          <TriangleAlert className="h-3 w-3" />
                          {formatQty(r.shortage)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatQty(r.delivered_quantity)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium">{formatQty(r.remaining)}</td>
                    <td className="px-3 py-2.5">
                      <span className={cn('inline-block px-2 py-0.5 rounded-full text-xs font-medium', STATUS[r.status].cls)}>
                        {STATUS[r.status].label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {r.status === 'open' && (
                        <div className="flex items-center justify-end gap-1">
                          {r.shortage > 0 && (
                            <button
                              onClick={() => topUpMutation.mutate(r.id)}
                              disabled={topUpMutation.isPending}
                              title="Serbest stoktan rezerveyi tamamla"
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-lg border border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 disabled:opacity-60"
                            >
                              <PlusCircle className="h-3 w-3" /> Tamamla
                            </button>
                          )}
                          <button
                            onClick={() => setDeliverRow(r)}
                            disabled={r.remaining <= 0}
                            title={r.remaining > 0 ? 'Teslim et' : 'Rezervede teslim edilecek miktar yok'}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-lg bg-green-600 hover:bg-green-700 text-white disabled:opacity-40"
                          >
                            <CheckCircle2 className="h-3 w-3" /> Teslim Et
                          </button>
                          <button
                            onClick={() => setCancelRow(r)}
                            title="Rezerveyi iptal et"
                            className="px-2 py-1 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                          >
                            İptal
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {deliverRow && (
        <DeliverModal row={deliverRow} onClose={() => setDeliverRow(null)} onDone={refresh} />
      )}

      <ConfirmModal
        open={!!cancelRow}
        onClose={() => setCancelRow(null)}
        onConfirm={() => cancelRow && cancelMutation.mutate(cancelRow.id)}
        title="Rezerve iptal edilsin mi?"
        description={cancelRow
          ? `${cancelRow.record_number} siparişinde rezervede kalan ${formatQty(cancelRow.remaining)} ${cancelRow.unit ?? 'birim'} serbest stoğa döner.`
          : ''}
        confirmLabel="İptal Et"
        loading={cancelMutation.isPending}
      />
    </div>
  )
}
