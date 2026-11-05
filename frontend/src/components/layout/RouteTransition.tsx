'use client'

/**
 * Sayfa geçişlerinde marka yükleme perdesi.
 *
 * GEÇİCİ: animasyonu rahat görebilmek için her geçişte sabit bir bekleme var
 * (GECIS_SURESI_MS). Gerçek yükleme süresine bağlı değil. Kaldırmak için:
 * bu dosyayı sil ve (dashboard)/layout.tsx içindeki <RouteTransition /> satırı
 * ile import'unu çıkar.
 */

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { BrandLoader } from '@/components/common/BrandLoader'

/** Perdenin ekranda kalma süresi (ms). Geçici demo değeri. */
const GECIS_SURESI_MS = 2000

export function RouteTransition() {
  const pathname = usePathname()
  const [gorunur, setGorunur] = useState(true)
  const [sonYol, setSonYol] = useState(pathname)

  // Yol değiştiği anda perdeyi aç. Effect yerine render sırasında yapılıyor:
  // effect içinde setState çağırmak fazladan bir render turu doğuruyor.
  if (sonYol !== pathname) {
    setSonYol(pathname)
    setGorunur(true)
  }

  useEffect(() => {
    if (!gorunur) return
    const zaman = setTimeout(() => setGorunur(false), GECIS_SURESI_MS)
    return () => clearTimeout(zaman)
  }, [gorunur, pathname])

  if (!gorunur) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-4 bg-white/90 text-zinc-400 backdrop-blur-sm dark:bg-zinc-950/90"
    >
      <BrandLoader size={112} label="Sayfa yükleniyor" />
      <p className="text-sm text-zinc-500 dark:text-zinc-400">Yükleniyor…</p>
    </div>
  )
}
