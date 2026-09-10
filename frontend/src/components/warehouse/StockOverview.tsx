'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createColumnHelper } from '@tanstack/react-table'
import { AlertTriangle, Loader2, Search, X } from 'lucide-react'
import { DataTable } from '@/components/common/DataTable'
import { get } from '@/lib/api'
import { cn, formatDate, formatDateTime } from '@/lib/utils'
import {
  BUCKET_LABELS, MOVEMENT_LABELS, formatQty, useWarehouses,
  type LotBalance, type StockBalanceRow, type StockMovementRow,
} from './stock'

const inputCls = 'px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500'

const col = createColumnHelper<StockBalanceRow>()

/** Stok defterinden ürün × kova × depo bakiyeleri. */
export function StockOverview() {
  const [page, setPage] = useState(0)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [inStock, setInStock] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const { data: warehouses = [] } = useWarehouses()

  const { data, isLoading } = useQuery({
    queryKey: ['stock-balances', page, search, warehouseId, inStock],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page + 1), per_page: '15' })
      if (search) params.set('search', search)
      if (warehouseId) params.set('warehouse_id', warehouseId)
      if (inStock) params.set('in_stock', '1')
      return get<{ data: StockBalanceRow[]; meta: { total: number } }>(`/modules/stock/balances?${params}`)
    },
  })

  const qtyCell = (value: number, unit?: string | null, tone?: string) => (
    <span className={cn('text-sm tabular-nums', value ? tone ?? 'text-zinc-700 dark:text-zinc-300' : 'text-zinc-300 dark:text-zinc-600')}>
      {value ? `${formatQty(value)} ${unit ?? ''}`.trim() : '—'}
    </span>
  )

  const columns = [
    col.accessor('name', {
      header: 'Ürün',
      cell: info => {
        const p = info.row.original
        const critical = p.min_stock > 0 && p.available <= p.min_stock
        return (
          <button type="button" onClick={() => setDetailId(p.id)} className="text-left group">
            <p className="font-medium text-zinc-900 dark:text-zinc-100 group-hover:text-blue-600 flex items-center gap-1.5">
              {p.name}
              {critical && <AlertTriangle className="h-3.5 w-3.5 text-red-500" aria-label="Kritik stok" />}
            </p>
            {(p.sku || p.barcode) && <p className="text-xs text-zinc-400">{p.sku ?? p.barcode}</p>}
          </button>
        )
      },
    }),
    col.accessor('available', { header: 'Kullanılabilir', cell: info => qtyCell(info.getValue(), info.row.original.unit, 'font-semibold text-zinc-900 dark:text-zinc-100') }),
    col.accessor('quarantine', { header: 'Karantina', cell: info => qtyCell(info.getValue(), info.row.original.unit, 'text-amber-600') }),
    col.accessor('damaged', { header: 'Hasarlı', cell: info => qtyCell(info.getValue(), info.row.original.unit, 'text-red-500') }),
    col.accessor('min_stock', { header: 'Min. Stok', cell: info => qtyCell(info.getValue(), info.row.original.unit, 'text-zinc-500') }),
    col.display({
      id: 'warehouses',
      header: 'Depolar',
      cell: info => (
        <div className="flex flex-wrap gap-1">
          {info.row.original.warehouses.filter(w => w.available || w.quarantine || w.damaged).map(w => (
            <span key={w.warehouse_id} className="text-[11px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
              {w.warehouse_name}: {formatQty(w.available)}
            </span>
          ))}
        </div>
      ),
    }),
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <form onSubmit={e => { e.preventDefault(); setSearch(searchInput); setPage(0) }} className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Ürün, SKU, barkod..." className={`${inputCls} w-full pl-9`} />
        </form>
        <select value={warehouseId} onChange={e => { setWarehouseId(e.target.value); setPage(0) }} className={inputCls}>
          <option value="">Tüm depolar</option>
          {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <label className="inline-flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          <input type="checkbox" checked={inStock} onChange={e => { setInStock(e.target.checked); setPage(0) }} className="rounded" />
          Sadece stokta olanlar
        </label>
      </div>

      <DataTable
        columns={columns as never}
        data={data?.data ?? []}
        total={data?.meta?.total ?? 0}
        pageIndex={page}
        onPaginationChange={s => setPage(s.pageIndex)}
        isLoading={isLoading}
        emptyMessage="Ürün yok. Ürün Kataloğu'ndan ürün ekleyin."
      />

      {detailId && <ProductStockModal productId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  )
}

// ─── Ürün detay: lot / SKT ve hareket geçmişi ────────────────────────────────

function ProductStockModal({ productId, onClose }: { productId: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['stock-product', productId],
    queryFn: () => get<{ data: { product: { name: string; unit?: string }; lots: LotBalance[]; movements: StockMovementRow[] } }>(
      `/modules/stock/products/${productId}`
    ).then(r => r.data),
  })

  const unit = data?.product.unit ?? ''
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{data?.product.name ?? 'Ürün'} — Stok Detayı</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400"><X className="h-4 w-4" /></button>
        </div>

        {isLoading || !data ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-zinc-400" /></div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            <section>
              <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-2">Lot / SKT Bakiyeleri <span className="font-normal text-xs text-zinc-400">(çıkışlar bu sırayla yapılır — FEFO)</span></h3>
              {data.lots.length === 0 ? (
                <p className="text-sm text-zinc-400">Stok yok.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-xs text-zinc-500">
                      <tr><th className="text-left px-3 py-2">Depo</th><th className="text-left px-3 py-2">Durum</th><th className="text-left px-3 py-2">Lot</th><th className="text-left px-3 py-2">SKT</th><th className="text-right px-3 py-2">Miktar</th></tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {data.lots.map((l, i) => {
                        const expired = l.expiry_date && l.expiry_date < today
                        return (
                          <tr key={i}>
                            <td className="px-3 py-2">{l.warehouse_name}</td>
                            <td className="px-3 py-2">{BUCKET_LABELS[l.bucket]}</td>
                            <td className="px-3 py-2 font-mono text-xs">{l.lot_number ?? '—'}</td>
                            <td className={cn('px-3 py-2', expired && 'text-red-600 font-medium')}>{l.expiry_date ? formatDate(l.expiry_date) : '—'}{expired && ' (geçmiş)'}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{formatQty(l.qty)} {unit}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section>
              <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-2">Son Hareketler</h3>
              {data.movements.length === 0 ? (
                <p className="text-sm text-zinc-400">Hareket yok.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-xs text-zinc-500">
                      <tr><th className="text-left px-3 py-2">Tarih</th><th className="text-left px-3 py-2">Hareket</th><th className="text-left px-3 py-2">Depo / Durum</th><th className="text-left px-3 py-2">Lot</th><th className="text-right px-3 py-2">Miktar</th><th className="text-left px-3 py-2">Kayıt</th></tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {data.movements.map(m => (
                        <tr key={m.id}>
                          <td className="px-3 py-2 text-xs text-zinc-500 whitespace-nowrap">{formatDateTime(m.occurred_at)}</td>
                          <td className="px-3 py-2">{MOVEMENT_LABELS[m.movement_type] ?? m.movement_type}</td>
                          <td className="px-3 py-2 text-xs">{m.warehouse_name} · {BUCKET_LABELS[m.bucket]}</td>
                          <td className="px-3 py-2 font-mono text-xs">{m.lot_number ?? '—'}</td>
                          <td className={cn('px-3 py-2 text-right tabular-nums font-medium', m.quantity > 0 ? 'text-green-600' : 'text-red-600')}>
                            {m.quantity > 0 ? '+' : ''}{formatQty(m.quantity)}
                          </td>
                          <td className="px-3 py-2 text-xs text-zinc-500">{m.record_number ?? m.note ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
