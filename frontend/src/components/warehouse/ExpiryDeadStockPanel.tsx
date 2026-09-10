'use client'

import { useState } from 'react'
import { CalendarClock, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ExpiryPanel } from './ExpiryPanel'
import { DeadStockPanel } from './DeadStockPanel'

/** SKT / FEFO ve hareket analizi (ölü / yavaş stok). */
export function ExpiryDeadStockPanel() {
  const [tab, setTab] = useState<'expiry' | 'dead'>('expiry')

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border border-zinc-200 dark:border-zinc-800 p-0.5 bg-zinc-50 dark:bg-zinc-900">
        {([
          { id: 'expiry', label: 'SKT / FEFO', icon: CalendarClock },
          { id: 'dead', label: 'Hareket Analizi (Ölü Stok)', icon: TrendingDown },
        ] as const).map(t => (
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
      {tab === 'expiry' ? <ExpiryPanel /> : <DeadStockPanel />}
    </div>
  )
}
