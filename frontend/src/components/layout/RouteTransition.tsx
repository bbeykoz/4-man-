'use client'

/**
 * Sayfa geçişlerinde marka yükleme perdesi.
 *
 * Perde tam opak siyah: arkadaki sayfa görünmüyor, böylece içeriğin hazır
 * beklediği belli olmuyor. Süre dolunca perde sönerek kalkıyor ve sayfa
 * aydınlanıyormuş gibi açılıyor.
 *
 * GEÇİCİ: animasyonu rahat görebilmek için her geçişte sabit bir bekleme var
 * (GECIS_SURESI_MS). Gerçek yükleme süresine bağlı değil. Kaldırmak için:
 * bu dosyayı sil ve (dashboard)/layout.tsx içindeki <RouteTransition /> satırı
 * ile import'unu çıkar.
 */

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { BrandLoader } from '@/components/common/BrandLoader'

/** Perdenin tam opak kaldığı süre (ms). Geçici demo değeri. */
const GECIS_SURESI_MS = 500
/** Perdenin sönme süresi (ms). Aşağıdaki duration-[250ms] ile aynı olmalı. */
const SONME_MS = 250

type Asama = 'acik' | 'soner' | 'kapali'

export function RouteTransition() {
  const pathname = usePathname()
  const [asama, setAsama] = useState<Asama>('acik')
  const [sonYol, setSonYol] = useState(pathname)

  // Yol değiştiği anda perdeyi aç. Effect yerine render sırasında yapılıyor:
  // effect içinde setState çağırmak fazladan bir render turu doğuruyor.
  if (sonYol !== pathname) {
    setSonYol(pathname)
    setAsama('acik')
  }

  useEffect(() => {
    if (asama === 'kapali') return
    const sure = asama === 'acik' ? GECIS_SURESI_MS : SONME_MS
    const zaman = setTimeout(() => setAsama(asama === 'acik' ? 'soner' : 'kapali'), sure)
    return () => clearTimeout(zaman)
  }, [asama, pathname])

  if (asama === 'kapali') return null

  return (
    <div
      role="status"
      aria-live="polite"
      className={
        'fixed inset-0 z-[70] flex flex-col items-center justify-center gap-4 bg-zinc-950 ' +
        'text-zinc-500 transition-opacity duration-[250ms] ' +
        (asama === 'soner' ? 'pointer-events-none opacity-0' : 'opacity-100')
      }
    >
      <BrandLoader size={112} label="Sayfa yükleniyor" />
      <p className="text-sm text-zinc-400">Yükleniyor…</p>
    </div>
  )
}
