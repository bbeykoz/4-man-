import { cn, statusColors, priorityColors } from '@/lib/utils'

interface StatusBadgeProps {
  status: string
  label?: string
  type?: 'status' | 'priority'
  size?: 'sm' | 'md'
}

export function StatusBadge({ status, label, type = 'status', size = 'sm' }: StatusBadgeProps) {
  const colors = type === 'priority' ? priorityColors : statusColors
  const colorClass = colors[status] ?? 'bg-zinc-100 text-zinc-600'

  return (
    <span className={cn(
      'inline-flex items-center rounded-full font-medium',
      size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
      colorClass
    )}>
      {label ?? status}
    </span>
  )
}
