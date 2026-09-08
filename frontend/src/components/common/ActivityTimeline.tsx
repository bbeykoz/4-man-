import { timeAgo } from '@/lib/utils'
import type { ActivityLog } from '@/types/api.types'

interface ActivityTimelineProps {
  items: ActivityLog[]
  loading?: boolean
}

const actionIcons: Record<string, string> = {
  created:  '🟢',
  updated:  '🔵',
  deleted:  '🔴',
  approved: '✅',
  rejected: '❌',
  login:    '🔑',
  logout:   '🚪',
  default:  '⚡',
}

function getActionIcon(action: string): string {
  const key = Object.keys(actionIcons).find((k) => action.includes(k))
  return actionIcons[key ?? 'default']
}

export function ActivityTimeline({ items, loading }: ActivityTimelineProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-3 animate-pulse">
            <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-700 flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-3/4 bg-zinc-200 dark:bg-zinc-700 rounded" />
              <div className="h-2.5 w-1/3 bg-zinc-200 dark:bg-zinc-700 rounded" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (!items.length) {
    return <p className="text-sm text-zinc-400 text-center py-6">Henüz aktivite yok.</p>
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.id} className="flex gap-3 group">
          <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0 text-sm">
            {getActionIcon(item.action)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {item.user && (
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{item.user.name}</span>
              )}
              <span className="text-sm text-zinc-600 dark:text-zinc-400 truncate">{item.description ?? item.action}</span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">{timeAgo(item.created_at)}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
