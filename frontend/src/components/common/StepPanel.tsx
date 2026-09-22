'use client'

// Animasyon: watermelon "micro-interaction" kutusunun özü — içerik değişince kutu
// yüksekliğini yayla ayarlar, eski adım yukarı süzülür, yeni adım aşağıdan gelir.
// Çekmece (vaul) yerine panelin kendi ortadan açılan penceresi korunur.
import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import useMeasure from 'react-use-measure'
import { cn } from '@/lib/utils'

interface StepPanelProps {
  /** Adım anahtarı; değiştiğinde geçiş animasyonu çalışır */
  step: string
  children: ReactNode
  className?: string
}

export function StepPanel({ step, children, className }: StepPanelProps) {
  const [ref, bounds] = useMeasure({ offsetSize: true })

  return (
    <motion.div
      animate={{ height: bounds.height > 0 ? bounds.height : 'auto' }}
      transition={{ type: 'spring', stiffness: 400, damping: 34 }}
      className={cn('overflow-hidden', className)}
    >
      <div ref={ref}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

/** Adım göstergesi: kaç adım var, hangisindeyiz. */
export function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <motion.span
          key={i}
          animate={{
            width: i === current ? 18 : 6,
            backgroundColor: i <= current ? '#2563eb' : '#d4d4d8',
          }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="h-1.5 rounded-full"
        />
      ))}
    </div>
  )
}
