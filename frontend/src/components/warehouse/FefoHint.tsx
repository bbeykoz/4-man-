'use client'

import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ListOrdered } from 'lucide-react'
import { get } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { formatQty, type LotBalance } from './stock'

/** Stoktan düşen hareketler (lot seçimi FEFO'yu ilgilendirir) */
const OUTBOUND = ['stock_out', 'transfer', 'damage', 'adjustment']

interface FefoHintProps {
  productId: string
  warehouseId: string
  type: string
  batchNumber: string
  unit?: string
}

/**
 * Formda ürün + depo seçilince FEFO lot sırasını gösterir.
 * Lot boş bırakılırsa çıkış otomatik bu sırayla yapılır; SKT'si daha geç bir lot yazılırsa uyarır.
 */
export function FefoHint({ productId, warehouseId, type, batchNumber, unit }: FefoHintProps) {
  const enabled = !!productId && !!warehouseId && OUTBOUND.includes(type)

  const { data: lots = [] } = useQuery({
    queryKey: ['stock-product', productId],
    queryFn: () => get<{ data: { lots: LotBalance[] } }>(`/modules/stock/products/${productId}`).then(r => r.data.lots),
    enabled,
    staleTime: 15_000,
  })

  if (!enabled) return null

  const fefo = lots.filter(l => l.warehouse_id === warehouseId && l.bucket === 'available')
  if (fefo.length === 0) {
    return <p className="text-xs text-amber-600">Seçili depoda bu ürünün kullanılabilir stoğu yok.</p>
  }

  const first = fefo[0]
  const chosen = batchNumber.trim() ? fefo.find(l => l.lot_number === batchNumber.trim()) : null
  const offFefo = chosen && first.expiry_date && chosen.expiry_date !== first.expiry_date && chosen.lot_number !== first.lot_number
  const unknown = batchNumber.trim() && !chosen

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 px-3 py-2 space-y-1.5">
      <p className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400 flex items-center gap-1">
        <ListOrdered className="h-3.5 w-3.5" /> FEFO sırası {!batchNumber.trim() && '(lot boş: otomatik bu sırayla düşülür)'}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {fefo.slice(0, 4).map((l, i) => (
          <span key={`${l.lot_number}-${i}`} className="text-[11px] px-1.5 py-0.5 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700">
            {i + 1}. {l.lot_number ?? 'lotsuz'} · {l.expiry_date ? formatDate(l.expiry_date) : 'SKT yok'} · {formatQty(l.qty)} {unit}
          </span>
        ))}
      </div>
      {offFefo && (
        <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1">
          <AlertTriangle className="h-3.5 w-3.5" /> FEFO dışı: önce {first.lot_number ?? 'lotsuz stok'} ({formatDate(first.expiry_date!)}) çıkmalı.
        </p>
      )}
      {unknown && (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <AlertTriangle className="h-3.5 w-3.5" /> Bu depoda &quot;{batchNumber}&quot; lotunda kullanılabilir stok yok.
        </p>
      )}
    </div>
  )
}
