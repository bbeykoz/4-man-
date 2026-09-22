'use client'

// Animasyon: watermelon "save toggle". Fark: sahte zamanlayıcı yerine gerçek istek beklenir.
// onSave sözü çözülünce başarı, hata alınca boşta durumuna döner.
import { useState } from 'react'
import { AnimatePresence, motion, MotionConfig } from 'motion/react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

type Status = 'idle' | 'loading' | 'success'
type Size = 'sm' | 'md'

const SIZE = {
  sm: { height: 40, circle: 40, width: 128, text: 'text-sm', icon: 'h-4 w-4', spinner: 'h-5 w-5' },
  md: { height: 48, circle: 48, width: 160, text: 'text-base', icon: 'h-5 w-5', spinner: 'h-6 w-6' },
}

interface SaveButtonProps {
  onSave: () => Promise<unknown>
  idleText?: string
  savedText?: string
  size?: Size
  disabled?: boolean
  /** Başarı durumundan sonra boşta durumuna dönme süresi (ms); 0 verilirse dönmez */
  resetAfter?: number
  className?: string
}

export function SaveButton({
  onSave,
  idleText = 'Kaydet',
  savedText = 'Kaydedildi',
  size = 'md',
  disabled,
  resetAfter = 1600,
  className,
}: SaveButtonProps) {
  const [status, setStatus] = useState<Status>('idle')
  const cfg = SIZE[size]

  const handleClick = async () => {
    if (status !== 'idle' || disabled) return
    setStatus('loading')
    try {
      await onSave()
      setStatus('success')
      if (resetAfter > 0) setTimeout(() => setStatus('idle'), resetAfter)
    } catch {
      setStatus('idle')
    }
  }

  return (
    <MotionConfig transition={{ type: 'spring', stiffness: 400, damping: 30 }}>
      <motion.button
        type="button"
        onClick={handleClick}
        disabled={disabled || status !== 'idle'}
        initial={false}
        animate={{ width: status === 'loading' ? cfg.circle : cfg.width, height: cfg.height }}
        transition={{ type: 'spring', stiffness: 200, damping: 15, mass: 1.2 }}
        className={cn(
          'relative z-0 flex cursor-pointer items-center justify-center overflow-hidden rounded-full font-medium text-white select-none',
          status === 'success' ? 'bg-emerald-600' : 'bg-blue-600 hover:bg-blue-700',
          'active:scale-[0.97] disabled:cursor-default disabled:opacity-90',
          cfg.text,
          className,
        )}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {status === 'idle' && (
            <motion.span
              key="idle"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="absolute inset-0 flex items-center justify-center whitespace-nowrap"
            >
              {idleText}
            </motion.span>
          )}

          {status === 'loading' && (
            <motion.div
              key="loading"
              initial={{ opacity: 0, scale: 0.8, filter: 'blur(4px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 0.8, filter: 'blur(4px)' }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <motion.svg
                viewBox="0 0 26 26"
                className={cfg.spinner}
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 0.7, ease: 'linear' }}
              >
                <circle cx="13" cy="13" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="3" fill="none" />
                <path d="M13 3 A10 10 0 0 1 23 13" stroke="white" strokeWidth="3" strokeLinecap="round" fill="none" />
              </motion.svg>
            </motion.div>
          )}

          {status === 'success' && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.5, filter: 'blur(4px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: 15, filter: 'blur(4px)' }}
              className="absolute inset-0 flex items-center justify-center gap-2 px-4"
            >
              <Check className={cn(cfg.icon, 'shrink-0')} strokeWidth={3} />
              <span className="whitespace-nowrap">{savedText}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>
    </MotionConfig>
  )
}
