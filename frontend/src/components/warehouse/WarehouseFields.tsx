'use client'

import { useEffect, useMemo } from 'react'
import { ArrowDownCircle, ArrowUpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useWarehouses } from './stock'

const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelCls = 'block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1'

interface WarehouseFieldsProps {
  type: string
  warehouseId: string
  onWarehouseChange: (id: string) => void
  toWarehouseId: string
  onToWarehouseChange: (id: string) => void
  direction: string
  onDirectionChange: (d: 'increase' | 'decrease') => void
}

/**
 * Depo kaydı formunda stok defteri alanları:
 * depo (varsayılan seçili), transferde hedef depo, düzeltmede artış/azalış.
 */
export function WarehouseFields({
  type, warehouseId, onWarehouseChange, toWarehouseId, onToWarehouseChange, direction, onDirectionChange,
}: WarehouseFieldsProps) {
  const { data: warehouses } = useWarehouses()
  const active = useMemo(() => (warehouses ?? []).filter(w => w.is_active), [warehouses])

  // Varsayılan depoyu önceden seç
  useEffect(() => {
    if (!warehouseId && active.length > 0) {
      onWarehouseChange((active.find(w => w.is_default) ?? active[0]).id)
    }
  }, [warehouseId, active, onWarehouseChange])

  const isTransfer = type === 'transfer'

  return (
    <div className="space-y-3">
      <div className={cn('grid gap-3', isTransfer ? 'grid-cols-2' : 'grid-cols-1')}>
        <div>
          <label className={labelCls}>{isTransfer ? 'Kaynak Depo' : 'Depo'}</label>
          <select className={inputCls} value={warehouseId} onChange={e => onWarehouseChange(e.target.value)}>
            {active.map(w => (
              <option key={w.id} value={w.id}>{w.name}{w.is_default ? ' (varsayılan)' : ''}</option>
            ))}
          </select>
        </div>
        {isTransfer && (
          <div>
            <label className={labelCls}>Hedef Depo <span className="text-red-500">*</span></label>
            <select className={inputCls} value={toWarehouseId} onChange={e => onToWarehouseChange(e.target.value)}>
              <option value="">Seçiniz</option>
              {active.filter(w => w.id !== warehouseId).map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
            {active.length < 2 && (
              <p className="mt-1 text-xs text-amber-600">Transfer için en az iki depo tanımlayın (Depolar butonu).</p>
            )}
          </div>
        )}
      </div>

      {type === 'adjustment' && (
        <div>
          <label className={labelCls}>Düzeltme Yönü <span className="text-red-500">*</span></label>
          <div className="grid grid-cols-2 gap-2">
            {([
              { value: 'increase', label: 'Artış', icon: ArrowDownCircle, cls: 'bg-green-600 border-green-600' },
              { value: 'decrease', label: 'Azalış', icon: ArrowUpCircle, cls: 'bg-red-600 border-red-600' },
            ] as const).map(o => (
              <button
                key={o.value}
                type="button"
                onClick={() => onDirectionChange(o.value)}
                className={cn(
                  'inline-flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-medium border transition-colors',
                  direction === o.value
                    ? `${o.cls} text-white`
                    : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-zinc-400'
                )}
              >
                <o.icon className="h-3.5 w-3.5" /> {o.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {type === 'stock_count' && (
        <p className="text-xs text-zinc-500">
          Miktar alanına <strong>sayılan</strong> miktarı girin. Onayda sistem stoğuyla fark otomatik düzeltilir.
        </p>
      )}
    </div>
  )
}
