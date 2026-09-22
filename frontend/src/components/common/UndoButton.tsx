'use client'

// Animasyon: watermelon "time undo action". İşlem hemen yapılmaz: düğmeye basınca geri sayım
// başlar, süre dolmadan tekrar basılırsa iptal edilir. Yanlışlıkla silmeyi önler.
import { useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, MotionConfig } from 'motion/react'
import { Undo2 } from 'lucide-react'
import useMeasure from 'react-use-measure'
import { cn } from '@/lib/utils'

interface UndoButtonProps {
  /** Geri sayım dolunca çalışacak asıl işlem */
  onConfirm: () => void
  label?: string
  undoLabel?: string
  seconds?: number
  icon?: ReactNode
  disabled?: boolean
  className?: string
}

export function UndoButton({
  onConfirm,
  label = 'Sil',
  undoLabel = 'Vazgeç',
  seconds = 5,
  icon,
  disabled,
  className,
}: UndoButtonProps) {
  const [pending, setPending] = useState(false)
  const [countdown, setCountdown] = useState(seconds)
  const [ref, bounds] = useMeasure({ offsetSize: true })

  useEffect(() => {
    if (!pending) return

    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval)
          setPending(false)
          setCountdown(seconds)
          onConfirm()
          return seconds
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [pending, seconds, onConfirm])

  const toggle = () => {
    if (disabled) return
    setPending(prev => {
      if (!prev) setCountdown(seconds)
      return !prev
    })
  }

  return (
    <MotionConfig transition={{ type: 'spring', stiffness: 250, damping: 22 }}>
      <motion.div
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() } }}
        animate={{ width: bounds.width > 0 ? bounds.width : 'auto' }}
        className={cn(
          'relative flex cursor-pointer items-center justify-start overflow-hidden rounded-full bg-red-600 transition-colors duration-300',
          pending && 'bg-red-500/10 dark:bg-red-500/20',
          disabled && 'cursor-not-allowed opacity-60',
          className,
        )}
      >
        <div ref={ref} className={cn('flex items-center justify-center gap-2 px-4 py-2', pending && 'px-2')}>
          <AnimatePresence mode="popLayout">
            {pending && (
              <motion.div
                className="rounded-full bg-red-600 p-1.5"
                initial={{ opacity: 0, filter: 'blur(2px)' }}
                animate={{ opacity: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, filter: 'blur(2px)' }}
              >
                {icon ?? <Undo2 className="size-4 text-white" />}
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatedText
            text={pending ? undoLabel : label}
            className={cn('z-10 text-sm font-medium', pending ? 'text-red-500' : 'text-white')}
          />

          <AnimatePresence mode="popLayout">
            {pending && (
              <motion.div
                className="flex items-center justify-center rounded-full bg-red-600 px-2 py-0.5 text-white tabular-nums"
                initial={{ opacity: 0, filter: 'blur(2px)' }}
                animate={{ opacity: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, filter: 'blur(2px)' }}
              >
                <AnimatePresence mode="popLayout">
                  <motion.span
                    key={countdown}
                    className="text-sm"
                    initial={{ opacity: 0, y: -16, filter: 'blur(2px)', scale: 0.5 }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)', scale: 1 }}
                    exit={{ opacity: 0, y: 16, filter: 'blur(2px)', scale: 0.5 }}
                    transition={{ type: 'spring', stiffness: 240, damping: 20 }}
                  >
                    {countdown}
                  </motion.span>
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </MotionConfig>
  )
}

function AnimatedText({
  text,
  className,
  delayStep = 0.014,
}: {
  text: string
  className?: string
  delayStep?: number
}) {
  const chars = text.split('')

  return (
    <span className={className} style={{ display: 'inline-flex' }}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={text} style={{ display: 'inline-flex', willChange: 'transform' }}>
          {chars.map((char, i) => (
            <motion.span
              key={i}
              initial={{ y: 10, opacity: 0, scale: 0.5, filter: 'blur(2px)' }}
              animate={{ y: 0, opacity: 1, scale: 1, filter: 'blur(0px)' }}
              exit={{ y: -10, opacity: 0, scale: 0.5, filter: 'blur(2px)' }}
              transition={{ type: 'spring', stiffness: 240, damping: 16, mass: 1.2, delay: i * delayStep }}
              style={{ display: 'inline-block', whiteSpace: char === ' ' ? 'pre' : undefined }}
            >
              {char}
            </motion.span>
          ))}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}
