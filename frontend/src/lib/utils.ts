import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow, parseISO } from 'date-fns'
import { tr } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Sunucu saatleri UTC gelir; ekranda her zaman Türkiye saati gösterilir.
// Böylece kullanıcının bilgisayarı başka bir saat diliminde olsa da kayıtlar aynı görünür.
const DISPLAY_TZ = 'Europe/Istanbul'

/** UTC gelen tarihi Türkiye saatine kaydırır (date-fns yerel saat varsayar). */
function toDisplayZone(date: string | Date): Date {
  const d = typeof date === 'string' ? parseISO(date) : date
  const shown = new Date(d.toLocaleString('en-US', { timeZone: DISPLAY_TZ }))
  return isNaN(shown.getTime()) ? d : shown
}

/**
 * Bugünün tarihi (yyyy-MM-dd), Türkiye saatine göre.
 * new Date().toISOString() UTC verdiği için gece 00:00–03:00 arası dünü gösteriyordu.
 */
export function todayInput(): string {
  return format(toDisplayZone(new Date()), 'yyyy-MM-dd')
}

export function formatDate(date: string | Date, fmt = 'dd.MM.yyyy'): string {
  return format(toDisplayZone(date), fmt, { locale: tr })
}

export function formatDateTime(date: string | Date): string {
  return formatDate(date, 'dd.MM.yyyy HH:mm')
}

export function timeAgo(date: string | Date): string {
  // Göreli süre mutlak zamanla hesaplanır; saat dilimi çevirisi gerekmez
  const d = typeof date === 'string' ? parseISO(date) : date
  return formatDistanceToNow(d, { addSuffix: true, locale: tr })
}

export function formatCurrency(amount: number, currency = 'TRY'): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount)
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('tr-TR').format(n)
}

export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let i = 0
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024
    i++
  }
  return `${size.toFixed(1)} ${units[i]}`
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength) + '...'
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function buildQueryString(params: Record<string, unknown>): string {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') {
      query.set(key, String(value))
    }
  })
  return query.toString()
}

export const statusColors: Record<string, string> = {
  draft:       'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  pending:     'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  completed:   'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  cancelled:   'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  approved:    'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  rejected:    'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400',
  active:      'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  inactive:    'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  suspended:   'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}

export const priorityColors: Record<string, string> = {
  low:      'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
  medium:   'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  high:     'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  critical: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}
