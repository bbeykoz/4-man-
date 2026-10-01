'use client'

// Şirkete bağlanıldığında en üstte duran şerit. Hangi şirkette olduğunu,
// kimin kimliğiyle gezildiğini ve oturumun ne zaman biteceğini gösterir.
import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Eye, LogOut } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

function remaining(expiresAt: string) {
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (diff <= 0) return 'süre doldu'
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `${minutes} dk kaldı`
  return `${Math.floor(minutes / 60)} sa ${minutes % 60} dk kaldı`
}

export function ImpersonationBanner() {
  const { impersonation, stopImpersonation } = useAuth()
  const [left, setLeft] = useState('')

  useEffect(() => {
    if (!impersonation) return
    const tick = () => setLeft(remaining(impersonation.expiresAt))
    tick()
    const timer = setInterval(tick, 30_000)
    return () => clearInterval(timer)
  }, [impersonation])

  if (!impersonation) return null

  return (
    <motion.div
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
      className="flex flex-wrap items-center justify-between gap-2 bg-amber-500 px-4 py-2 text-sm text-amber-950"
    >
      <span className="flex min-w-0 items-center gap-2">
        <Eye className="h-4 w-4 shrink-0" />
        <span className="truncate">
          <strong>{impersonation.companyName}</strong> şirketinde geziyorsun
          {impersonation.asUserName && <> · {impersonation.asUserName} kimliğiyle</>}
          <span className="ml-2 opacity-80">({left})</span>
        </span>
      </span>

      <button
        onClick={() => stopImpersonation()}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-950/10 px-3 py-1 font-medium transition-colors hover:bg-amber-950/20"
      >
        <LogOut className="h-3.5 w-3.5" />
        Kendi hesabıma dön
      </button>
    </motion.div>
  )
}
