import { LucideIcon, TrendingDown, TrendingUp } from 'lucide-react'
import { cn, formatNumber } from '@/lib/utils'

interface StatsCardProps {
  title: string
  value: number | string
  icon: LucideIcon
  trend?: number
  trendLabel?: string
  color?: 'blue' | 'green' | 'purple' | 'orange' | 'red' | 'teal' | 'pink'
  subtitle?: string
  loading?: boolean
}

const colorStyles = {
  blue:   { bg: 'bg-blue-50 dark:bg-blue-950/40',   icon: 'text-blue-600 dark:text-blue-400',   border: 'border-blue-100 dark:border-blue-900' },
  green:  { bg: 'bg-green-50 dark:bg-green-950/40', icon: 'text-green-600 dark:text-green-400', border: 'border-green-100 dark:border-green-900' },
  purple: { bg: 'bg-purple-50 dark:bg-purple-950/40',icon: 'text-purple-600 dark:text-purple-400',border: 'border-purple-100 dark:border-purple-900' },
  orange: { bg: 'bg-orange-50 dark:bg-orange-950/40',icon: 'text-orange-600 dark:text-orange-400',border: 'border-orange-100 dark:border-orange-900' },
  red:    { bg: 'bg-red-50 dark:bg-red-950/40',     icon: 'text-red-600 dark:text-red-400',     border: 'border-red-100 dark:border-red-900' },
  teal:   { bg: 'bg-teal-50 dark:bg-teal-950/40',   icon: 'text-teal-600 dark:text-teal-400',   border: 'border-teal-100 dark:border-teal-900' },
  pink:   { bg: 'bg-pink-50 dark:bg-pink-950/40',   icon: 'text-pink-600 dark:text-pink-400',   border: 'border-pink-100 dark:border-pink-900' },
}

export function StatsCard({ title, value, icon: Icon, trend, trendLabel, color = 'blue', subtitle, loading }: StatsCardProps) {
  const c = colorStyles[color]

  if (loading) {
    return (
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 animate-pulse">
        <div className="flex justify-between">
          <div className="h-4 w-24 bg-zinc-200 dark:bg-zinc-700 rounded" />
          <div className="h-9 w-9 bg-zinc-200 dark:bg-zinc-700 rounded-lg" />
        </div>
        <div className="h-8 w-20 bg-zinc-200 dark:bg-zinc-700 rounded mt-4" />
      </div>
    )
  }

  return (
    <div className={cn(
      'rounded-xl border p-5 bg-white dark:bg-zinc-900 transition-shadow hover:shadow-md',
      c.border
    )}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{title}</p>
        <div className={cn('rounded-lg p-2', c.bg)}>
          <Icon className={cn('h-5 w-5', c.icon)} />
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between">
        <div>
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            {typeof value === 'number' ? formatNumber(value) : value}
          </p>
          {subtitle && <p className="text-xs text-zinc-500 mt-0.5">{subtitle}</p>}
        </div>
        {trend !== undefined && (
          <span className={cn(
            'flex items-center gap-1 text-xs font-medium',
            trend > 0 ? 'text-emerald-600 dark:text-emerald-400' : trend < 0 ? 'text-red-500 dark:text-red-400' : 'text-zinc-400'
          )}>
            {trend > 0 ? <TrendingUp className="h-3 w-3" /> : trend < 0 ? <TrendingDown className="h-3 w-3" /> : null}
            {trend !== 0 ? `${Math.abs(trend)}%` : '—'}
            {trendLabel && <span className="text-zinc-400 ml-1">{trendLabel}</span>}
          </span>
        )}
      </div>
    </div>
  )
}
