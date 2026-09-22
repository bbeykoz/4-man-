'use client'

// Animasyon: watermelon "family receive" bloğu — tetikleyici düğme onay düğmesine dönüşür
// (aynı layoutId), pencere yayla aşağıdan gelir. Prop'lar ve davranış değişmedi.
import { AnimatePresence, motion, type Transition } from 'motion/react'
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
  /** Tetikleyici düğmeye aynı layoutId verilirse düğme pencereye dönüşerek açılır */
  layoutId?: string
}

const spring: Transition = { type: 'spring', bounce: 0, duration: 0.4 }

export function ConfirmModal({
  open, onClose, onConfirm,
  title, description,
  confirmLabel = 'Onayla', cancelLabel = 'İptal',
  variant = 'danger', loading, layoutId,
}: ConfirmModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={loading ? undefined : onClose}
          />

          <motion.div
            initial={{ y: 100, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 100, opacity: 0, scale: 0.98 }}
            transition={spring}
            className="relative z-10 mx-4 w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
          >
            <button
              onClick={onClose}
              disabled={loading}
              className="absolute right-4 top-4 text-zinc-400 transition-colors hover:text-zinc-600 disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>

            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ ...spring, delay: 0.05 }}
              className={cn(
                'mb-4 flex h-12 w-12 items-center justify-center rounded-full',
                variant === 'danger' ? 'bg-red-100 dark:bg-red-950'
                  : variant === 'warning' ? 'bg-yellow-100 dark:bg-yellow-950'
                  : 'bg-blue-100 dark:bg-blue-950',
              )}
            >
              <AlertTriangle className={cn(
                'h-6 w-6',
                variant === 'danger' ? 'text-red-600 dark:text-red-400'
                  : variant === 'warning' ? 'text-yellow-600 dark:text-yellow-400'
                  : 'text-blue-600 dark:text-blue-400',
              )} />
            </motion.div>

            <h3 className="mb-2 text-base font-semibold text-zinc-900 dark:text-zinc-50">{title}</h3>
            {description && <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">{description}</p>}

            <div className="mt-6 flex gap-3">
              <motion.button
                onClick={onClose}
                disabled={loading}
                whileTap={{ scale: 0.97 }}
                className="flex-1 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {cancelLabel}
              </motion.button>
              <motion.button
                layoutId={layoutId}
                onClick={onConfirm}
                disabled={loading}
                whileTap={{ scale: 0.97 }}
                transition={spring}
                className={cn(
                  'flex-1 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50',
                  variant === 'danger' ? 'bg-red-600 hover:bg-red-700'
                    : variant === 'warning' ? 'bg-yellow-600 hover:bg-yellow-700'
                    : 'bg-blue-600 hover:bg-blue-700',
                )}
              >
                {loading ? 'Bekleyin...' : confirmLabel}
              </motion.button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
