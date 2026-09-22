'use client'

// Animasyon: watermelon "inline disclosure menu". Satır menüsü yaylanarak açılır,
// "Sil" seçilince aynı şerit yukarı kayıp onay satırına dönüşür (ayrı pencere açılmaz).
// Not: özgün dosya @hugeicons kullanıyordu; projede kurulu olan lucide ikonlarına çevrildi.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MoreVertical } from 'lucide-react'
import { AnimatePresence, LayoutGroup, motion, type Transition, type Variants } from 'motion/react'
import { cn } from '@/lib/utils'

export interface RowMenuItem {
  icon: ReactNode
  label: string
  onClick?: () => void
  className?: string
}

export interface RowMenuProps {
  items: RowMenuItem[]
  title?: string
  deleteLabel?: string
  confirmLabel?: string
  cancelLabel?: string
  onDelete?: () => void
  deleteIcon?: ReactNode
  align?: 'left' | 'right'
}

const spring: Transition = { type: 'spring', bounce: 0, duration: 0.4 }

const menuVariants: Variants = {
  hidden: { opacity: 0, scale: 0.94 },
  visible: { opacity: 1, scale: 1, transition: spring },
}

const slideVariants: Variants = {
  initial: (confirm: boolean) => ({ y: confirm ? 60 : -60 }),
  animate: { y: 0, transition: spring },
  exit: (confirm: boolean) => ({ y: confirm ? -60 : 60, transition: spring }),
}

function MenuRow({ icon, label, onClick, className = '' }: RowMenuItem) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800',
        className,
      )}
    >
      <span className="text-zinc-500 dark:text-zinc-400">{icon}</span>
      <span className="text-sm font-medium tracking-tight">{label}</span>
    </button>
  )
}

export function RowMenu({
  items,
  title = 'İşlemler',
  deleteLabel = 'Sil',
  confirmLabel = 'Evet, sil',
  cancelLabel = 'Vazgeç',
  onDelete,
  deleteIcon,
  align = 'right',
}: RowMenuProps) {
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setConfirm(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <motion.button
        type="button"
        whileTap={{ scale: 0.95 }}
        onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
        aria-label={title}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
      >
        <MoreVertical className="h-4 w-4" />
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            variants={menuVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            onClick={e => e.stopPropagation()}
            className={cn(
              'absolute top-full z-50 mt-1 w-56 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900',
              align === 'right' ? 'right-0 origin-top-right' : 'left-0 origin-top-left',
            )}
          >
            <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-2 dark:border-zinc-800 dark:bg-zinc-800/50">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{title}</span>
            </div>

            <LayoutGroup>
              <div className="flex flex-col gap-1 p-2">
                {items.map((item, i) => (
                  <MenuRow
                    key={i}
                    {...item}
                    onClick={() => { item.onClick?.(); setOpen(false) }}
                  />
                ))}
              </div>

              {onDelete && (
                <div className="relative h-14 overflow-hidden border-t border-zinc-200 dark:border-zinc-800">
                  <AnimatePresence custom={confirm} mode="popLayout" initial={false}>
                    {!confirm ? (
                      <motion.div
                        key="delete"
                        custom={confirm}
                        variants={slideVariants}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        className="absolute inset-0 flex items-center px-2"
                      >
                        <MenuRow
                          icon={deleteIcon}
                          label={deleteLabel}
                          className="text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                          onClick={() => setConfirm(true)}
                        />
                      </motion.div>
                    ) : (
                      <motion.div
                        key="confirm"
                        custom={confirm}
                        variants={slideVariants}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        className="absolute inset-0 flex items-center gap-2 px-2"
                      >
                        <button
                          type="button"
                          onClick={() => { onDelete(); setOpen(false); setConfirm(false) }}
                          className="h-9 flex-1 rounded-xl bg-red-600 text-sm font-semibold text-white hover:bg-red-700"
                        >
                          {confirmLabel}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirm(false)}
                          className="h-9 flex-1 rounded-xl border border-zinc-200 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
                        >
                          {cancelLabel}
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </LayoutGroup>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
