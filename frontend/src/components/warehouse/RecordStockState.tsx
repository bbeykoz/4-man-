'use client'

import { BookCheck, Undo2 } from 'lucide-react'
import type { WarehouseRecord } from '@/types/api.types'

/** Kaydın stok defterine işlenme durumu (durum rozetinin altında küçük satır). */
export function RecordStockState({ record }: { record: WarehouseRecord }) {
  if (record.reversed_at) {
    return (
      <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-zinc-400" title="İptal ile stok geri alındı">
        <Undo2 className="h-3 w-3" /> Stok geri alındı
      </span>
    )
  }
  if (record.posted_at) {
    return (
      <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400" title="Stok defterine işlendi">
        <BookCheck className="h-3 w-3" /> Stoğa işlendi{record.warehouse_name ? ` · ${record.warehouse_name}` : ''}
      </span>
    )
  }
  if (record.product_id && record.warehouse_name) {
    return <span className="mt-1 block text-[11px] text-zinc-400">{record.warehouse_name}{record.to_warehouse_name ? ` → ${record.to_warehouse_name}` : ''}</span>
  }
  return null
}
