'use client'

import { AlertTriangle, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ConfirmModalProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning' | 'default'
  loading?: boolean
}

export function ConfirmModal({
  open, onClose, onConfirm,
  title, description,
  confirmLabel = 'Onayla', cancelLabel = 'İptal',
  variant = 'danger', loading,
}: ConfirmModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm mx-4 bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 p-6">
        <button onClick={onClose} className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 transition-colors">
          <X className="h-4 w-4" />
        </button>

        <div className={cn(
          'w-12 h-12 rounded-full flex items-center justify-center mb-4',
          variant === 'danger'  ? 'bg-red-100 dark:bg-red-950' :
          variant === 'warning' ? 'bg-yellow-100 dark:bg-yellow-950' :
          'bg-blue-100 dark:bg-blue-950'
        )}>
          <AlertTriangle className={cn(
            'h-6 w-6',
            variant === 'danger'  ? 'text-red-600 dark:text-red-400' :
            variant === 'warning' ? 'text-yellow-600 dark:text-yellow-400' :
            'text-blue-600 dark:text-blue-400'
          )} />
        </div>

        <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50 mb-2">{title}</h3>
        {description && <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">{description}</p>}

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-2 text-sm font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={cn(
              'flex-1 px-4 py-2 text-sm font-medium rounded-lg text-white transition-colors disabled:opacity-50',
              variant === 'danger'  ? 'bg-red-600 hover:bg-red-700' :
              variant === 'warning' ? 'bg-yellow-600 hover:bg-yellow-700' :
              'bg-blue-600 hover:bg-blue-700'
            )}
          >
            {loading ? 'Bekleyin...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
