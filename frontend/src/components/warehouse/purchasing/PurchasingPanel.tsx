'use client'

import { useState } from 'react'
import { Lightbulb, ClipboardList, Truck, Gauge } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SuggestionsTab } from './SuggestionsTab'
import { OrdersTab } from './OrdersTab'
import { SuppliersTab } from './SuppliersTab'
import { SupplierPerformanceTab } from './SupplierPerformanceTab'

const TABS = [
  { id: 'suggestions', label: 'Sipariş Önerileri', icon: Lightbulb },
  { id: 'orders',      label: 'Siparişler',        icon: ClipboardList },
  { id: 'suppliers',   label: 'Tedarikçiler',      icon: Truck },
  { id: 'performance', label: 'Tedarikçi Performansı', icon: Gauge },
] as const

type TabId = (typeof TABS)[number]['id']

/** Satın alma: otomatik öneriler, siparişler, tedarikçiler. */
export function PurchasingPanel() {
  const [tab, setTab] = useState<TabId>('suggestions')

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border border-zinc-200 dark:border-zinc-800 p-0.5 bg-zinc-50 dark:bg-zinc-900">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors',
              tab === t.id ? 'bg-white dark:bg-zinc-800 shadow-sm font-medium text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
            )}
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'suggestions' && <SuggestionsTab onCreated={() => setTab('orders')} />}
      {tab === 'orders' && <OrdersTab />}
      {tab === 'suppliers' && <SuppliersTab />}
      {tab === 'performance' && <SupplierPerformanceTab />}
    </div>
  )
}
