'use client'

// Animasyon: watermelon "view on map". Küçük düğme, aynı layoutId ile haritaya büyür.
// Harita Google Maps'in gömülü sürümü; adres bilgisi Google'a gider.
import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Loader2, X } from 'lucide-react'
import { MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'

interface WarehouseMapProps {
  /** Haritada aranacak adres; depo adresi ve şehri birleştirilerek verilir */
  query: string
  label?: string
  className?: string
}

const spring = { type: 'spring' as const, stiffness: 400, damping: 30, mass: 0.8 }

export function WarehouseMap({ query, label = 'Haritada gör', className }: WarehouseMapProps) {
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const toggle = () => {
    setOpen(o => !o)
    if (open) setLoaded(false)
  }

  const mapUrl = `https://maps.google.com/maps?q=${encodeURIComponent(query)}&t=&z=15&ie=UTF8&iwloc=&output=embed`
  const layoutId = `warehouse-map-${query}`

  return (
    <div className={cn('relative', className)}>
      <AnimatePresence mode="popLayout">
        {!open ? (
          <motion.button
            key="button"
            type="button"
            layoutId={layoutId}
            onClick={toggle}
            className="group relative flex cursor-pointer items-center justify-center overflow-hidden bg-zinc-100 shadow-sm transition-colors dark:bg-zinc-800"
            style={{ height: 32, borderRadius: 16 }}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={spring}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            <span className="relative z-10 flex items-center gap-1.5 px-3 py-1.5">
              <MapPin className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
              <span className="whitespace-nowrap text-xs font-medium text-zinc-700 dark:text-zinc-200">
                {label}
              </span>
            </span>
          </motion.button>
        ) : (
          <motion.div
            key="map"
            layoutId={layoutId}
            className="relative aspect-square w-full max-w-sm overflow-hidden bg-zinc-200 shadow-lg dark:bg-zinc-900"
            style={{ borderRadius: 24 }}
            transition={spring}
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.15 }}
              className="absolute inset-0 h-full w-full"
            >
              <iframe
                title={`${query} haritası`}
                width="100%"
                height="100%"
                style={{ border: 0 }}
                src={mapUrl}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                onLoad={() => setLoaded(true)}
                className={cn('transition-opacity duration-700', loaded ? 'opacity-100' : 'opacity-0')}
              />
            </motion.div>

            {!loaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800">
                <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
              </div>
            )}

            <motion.button
              type="button"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={toggle}
              aria-label="Haritayı kapat"
              className="absolute right-3 top-3 z-50 flex h-8 w-8 items-center justify-center rounded-full bg-white text-zinc-500 shadow-lg transition-all hover:bg-zinc-50 active:scale-90 dark:bg-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-600"
            >
              <X className="h-4 w-4" strokeWidth={3} />
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
