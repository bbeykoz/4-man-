'use client'

// Animasyon: watermelon "inline action" düğmesi. Boşta → yükleniyor (kayan çubuk) → onay (tik).
// Satır içi aksiyonlar için: sipariş taslağı oluştur, transferi uygula, anomaliyi incelendi işaretle.
import { useEffect, useState } from 'react'
import { AnimatePresence, motion, MotionConfig, type Transition } from 'motion/react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

type Status = 'idle' | 'loading' | 'success'

interface AsyncActionButtonProps {
  label: string
  onAction: () => Promise<unknown>
  disabled?: boolean
  /** Başarıdan sonra boşta durumuna dönüş süresi (ms) */
  resetAfter?: number
  width?: number
  className?: string
}

const spring: Transition = { type: 'spring', stiffness: 400, damping: 35, mass: 1 }

export function AsyncActionButton({
  label,
  onAction,
  disabled,
  resetAfter = 2000,
  width = 132,
  className,
}: AsyncActionButtonProps) {
  const [status, setStatus] = useState<Status>('idle')

  const handleTrigger = async () => {
    if (status !== 'idle' || disabled) return
    setStatus('loading')
    try {
      await onAction()
      setStatus('success')
    } catch {
      setStatus('idle')
    }
  }

  useEffect(() => {
    if (status !== 'success' || resetAfter <= 0) return
    const timer = setTimeout(() => setStatus('idle'), resetAfter)
    return () => clearTimeout(timer)
  }, [status, resetAfter])

  return (
    <MotionConfig transition={spring}>
      <motion.div
        animate={{ width: status === 'success' ? 40 : width }}
        className={cn(
          'relative flex h-9 items-center overflow-hidden rounded-full bg-zinc-100 px-2 dark:bg-zinc-800',
          disabled && 'opacity-60',
          className,
        )}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {status === 'idle' && (
            <motion.button
              key="idle"
              type="button"
              initial={{ opacity: 0, filter: 'blur(4px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, filter: 'blur(4px)' }}
              onClick={handleTrigger}
              disabled={disabled}
              className="w-full rounded-full text-[13px] font-semibold whitespace-nowrap text-zinc-900 dark:text-zinc-100"
            >
              {label}
            </motion.button>
          )}

          {status === 'loading' && (
            <motion.div
              key="loading"
              initial={{ opacity: 0, filter: 'blur(4px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, filter: 'blur(4px)' }}
              className="w-full"
            >
              <div className="relative h-1.5 w-full rounded-full bg-zinc-300 dark:bg-zinc-600">
                <motion.div
                  className="absolute bottom-0 top-0 w-[30%] rounded-full bg-blue-600 dark:bg-blue-400"
                  initial={{ left: '0%' }}
                  animate={{ left: '70%' }}
                  transition={{ duration: 0.8, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
                />
              </div>
            </motion.div>
          )}

          {status === 'success' && (
            <motion.div
              key="success"
              initial={{ filter: 'blur(4px)', opacity: 0 }}
              animate={{ filter: 'blur(0px)', opacity: 1 }}
              exit={{ filter: 'blur(4px)', opacity: 0 }}
              className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-emerald-600"
            >
              <motion.div
                initial={{ x: '0%' }}
                animate={{ x: '100%' }}
                transition={{ duration: 0.7, delay: 0.1, ease: 'easeOut' }}
                className="absolute inset-0 z-10 h-full w-full skew-x-[-40deg] bg-gradient-to-r from-transparent via-white/50 to-transparent"
              />
              <Check className="size-4 stroke-[3] text-white" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </MotionConfig>
  )
}
