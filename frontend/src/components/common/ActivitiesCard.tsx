'use client'

// Animasyon: watermelon "activities card". Başlığa tıklayınca liste açılır, ikon küçülür,
// satırlar soldan kayarak gelir. Bildirim ve hareket listeleri için.
import { useState, type FC, type ReactNode } from 'react'
import { AnimatePresence, motion, MotionConfig } from 'motion/react'
import { ChevronUpIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ActivityItemType {
  icon: ReactNode
  title: string
  desc: string
  time: string
  onClick?: () => void
}

export interface ActivitiesCardProps {
  headerIcon: ReactNode
  title: string
  subtitle: string
  activities: ActivityItemType[]
  defaultOpen?: boolean
  emptyText?: string
  className?: string
}

const ActivityItem: FC<ActivityItemType> = ({ icon, title, desc, time, onClick }) => (
  <motion.div
    layout
    initial={{ opacity: 0, x: -10 }}
    animate={{ opacity: 1, x: 0 }}
    onClick={onClick}
    className={cn(
      'flex items-center gap-3 px-3 py-3 transition-colors sm:gap-4 sm:px-5',
      onClick ? 'cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50' : '',
    )}
  >
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-100 bg-gradient-to-b from-zinc-50 to-zinc-100 text-zinc-500 sm:h-12 sm:w-12 dark:border-zinc-700 dark:from-zinc-800 dark:to-zinc-900 dark:text-zinc-400">
      {icon}
    </div>

    <div className="min-w-0 flex-1">
      <p className="truncate text-[15px] font-bold leading-tight text-zinc-800 dark:text-zinc-200">
        {title}
      </p>
      <p className="truncate text-[13px] text-zinc-500 dark:text-zinc-400">{desc}</p>
    </div>

    <span className="whitespace-nowrap pt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
      {time}
    </span>
  </motion.div>
)

export const ActivitiesCard: FC<ActivitiesCardProps> = ({
  headerIcon,
  title,
  subtitle,
  activities,
  defaultOpen = false,
  emptyText = 'Kayıt yok.',
  className,
}) => {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <MotionConfig transition={{ type: 'spring', bounce: 0, duration: 0.6 }}>
      <motion.div
        layout
        className={cn(
          'overflow-hidden rounded-xl border border-zinc-200 bg-white sm:rounded-2xl dark:border-zinc-800 dark:bg-zinc-900',
          className,
        )}
      >
        <motion.button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 transition-colors"
        >
          <div className="flex min-w-0 flex-1 items-center gap-4 text-left">
            <motion.div
              initial={{ width: 56, height: 56 }}
              animate={{ width: open ? 44 : 56, height: open ? 44 : 56 }}
              className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-zinc-100 bg-gradient-to-b from-zinc-50 to-zinc-100 text-zinc-600 shadow-sm dark:border-zinc-700 dark:from-zinc-700 dark:to-zinc-900 dark:text-zinc-300"
            >
              <motion.div animate={{ scale: open ? 0.7 : 1 }}>{headerIcon}</motion.div>
            </motion.div>

            <div className="flex min-w-0 flex-1 flex-col justify-center">
              <motion.p
                layout
                className="truncate text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-100"
              >
                {title}
              </motion.p>
              <AnimatePresence mode="popLayout" initial={false}>
                {!open && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                    className="truncate text-sm tracking-tight text-zinc-400 dark:text-zinc-500"
                  >
                    {subtitle}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </div>

          <motion.div
            animate={{ rotate: open ? 180 : 0 }}
            className="flex size-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-zinc-400 to-zinc-500 dark:from-zinc-700 dark:to-zinc-800"
          >
            <ChevronUpIcon className="size-4 text-white" />
          </motion.div>
        </motion.button>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="border-t border-zinc-200 dark:border-zinc-800"
            >
              <div className="py-2">
                {activities.length === 0 ? (
                  <p className="px-5 py-6 text-center text-sm text-zinc-500">{emptyText}</p>
                ) : (
                  activities.map((item, i) => <ActivityItem key={i} {...item} />)
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </MotionConfig>
  )
}
