'use client'

/**
 * Muhasebe ekranlarının ortak parçaları.
 *
 * Depo modülündeki desenleri izliyor ama muhasebeye özgü ihtiyaçları
 * karşılıyor: borç/alacak hizalaması, durum rozetleri, para sütunları.
 */
import { type ReactNode } from 'react'
import { AlertTriangle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { money } from './api'

/** Sayfa içi bölüm başlığı. */
export function Section({
  title, description, action, children, className,
}: {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900', className)}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{description}</p>}
        </div>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  )
}

/** Tek satırlık rakam kartı. */
export function Stat({
  label, value, suffix, hint, tone = 'default',
}: {
  label: string
  value: string | number
  suffix?: string
  hint?: string
  tone?: 'default' | 'positive' | 'negative' | 'warning'
}) {
  const renk = {
    default:  'text-zinc-900 dark:text-zinc-100',
    positive: 'text-emerald-600 dark:text-emerald-400',
    negative: 'text-rose-600 dark:text-rose-400',
    warning:  'text-amber-600 dark:text-amber-400',
  }[tone]

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className={cn('mt-1 text-lg font-semibold tabular-nums', renk)}>
        {value}
        {suffix && <span className="ml-1 text-xs font-normal text-zinc-400">{suffix}</span>}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-zinc-400">{hint}</p>}
    </div>
  )
}

/** Para sütunu: sağa hizalı, tabular, sıfır soluk. */
export function Money({ value, currency, className }: { value: string | number | null | undefined; currency?: string; className?: string }) {
  const n = typeof value === 'string' ? parseFloat(value) : value
  const bos = !n

  return (
    <span className={cn('tabular-nums', bos && 'text-zinc-300 dark:text-zinc-600', className)}>
      {bos ? '—' : money(n)}
      {!bos && currency && <span className="ml-1 text-xs text-zinc-400">{currency}</span>}
    </span>
  )
}

/** Borç/alacak çifti; mizan ve fiş satırlarında kullanılır. */
export function DebitCredit({ debit, credit }: { debit: string | number; credit: string | number }) {
  return (
    <span className="tabular-nums">
      {Number(debit) > 0
        ? <span className="text-zinc-900 dark:text-zinc-100">{money(debit)}</span>
        : <span className="text-emerald-600 dark:text-emerald-400">{money(credit)}</span>}
    </span>
  )
}

const ROZET_RENKLERI: Record<string, string> = {
  gray:    'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  blue:    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  indigo:  'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  amber:   'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  rose:    'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  red:     'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
}

export function Badge({ label, color = 'gray', className }: { label: string; color?: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap',
      ROZET_RENKLERI[color] ?? ROZET_RENKLERI.gray, className)}>
      {label}
    </span>
  )
}

/** Bilgi / uyarı şeridi. */
export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warning' | 'danger'; children: ReactNode }) {
  const stil = {
    info:    'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300',
    warning: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
    danger:  'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300',
  }[tone]

  const Icon = tone === 'info' ? Info : AlertTriangle

  return (
    <div className={cn('flex items-start gap-2 rounded-lg border px-3 py-2 text-sm', stil)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** Basit tablo kabuğu; muhasebe tablolarının hepsi ızgaralı. */
export function Table({ head, children, empty }: { head: ReactNode; children: ReactNode; empty?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-800/50 dark:text-zinc-400">
          {head}
        </thead>
        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">{children}</tbody>
      </table>
      {empty && (
        <p className="border-t border-zinc-200 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          Kayıt yok.
        </p>
      )}
    </div>
  )
}

export function Th({ children, align = 'left', className }: { children?: ReactNode; align?: 'left' | 'right' | 'center'; className?: string }) {
  return <th className={cn('px-3 py-2 font-medium', align === 'right' && 'text-right', align === 'center' && 'text-center', className)}>{children}</th>
}

export function Td({ children, align = 'left', className, colSpan }: { children?: ReactNode; align?: 'left' | 'right' | 'center'; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={cn('px-3 py-2 text-zinc-700 dark:text-zinc-300', align === 'right' && 'text-right', align === 'center' && 'text-center', className)}>{children}</td>
}

/** Tarih aralığı seçici; raporların hepsinde aynı. */
export function DateRange({
  from, to, onChange, className,
}: {
  from: string
  to: string
  onChange: (from: string, to: string) => void
  className?: string
}) {
  const alan = 'rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100'

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <input type="date" value={from} onChange={e => onChange(e.target.value, to)} className={alan} />
      <span className="text-xs text-zinc-400">–</span>
      <input type="date" value={to} onChange={e => onChange(from, e.target.value)} className={alan} />
    </div>
  )
}
