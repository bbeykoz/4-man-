'use client'

/**
 * Argus Tech yükleme animasyonu.
 *
 * Veriler gelene kadar marka işareti dağılıp tekrar toplanıyor: işaret önce
 * taneciklere ayrılmış halde gelir, netleşir, kısa süre durur, sonra yeniden
 * dağılarak kaybolur ve döngü başa döner.
 *
 * Teknik: mark.png bir raster görsel olduğu için dağılma efekti SVG filtresiyle
 * yapılıyor. feTurbulence bir gürültü dokusu üretir, feDisplacementMap bu
 * dokuya göre pikselleri kaydırır; kaydırma miktarı (scale) animasyonlanınca
 * görsel dağılıp toplanıyormuş gibi görünür. Animasyon SMIL (<animate>) ile
 * yazıldı; CSS'te filtre primitiflerine erişilemiyor.
 *
 * Her örneğin kendi filtre kimliği var (useId), aynı sayfada birden çok loader
 * olduğunda filtreler birbirine karışmasın.
 */

import { useId } from 'react'
import { cn } from '@/lib/utils'

/** Bir tam döngünün süresi. Aşamalar bu süreye oranla hesaplanır. */
const DONGU = '3.4s'

interface Props {
  /** Kenar uzunluğu (px). Satır içi kullanımda 20-24, bölüm ortasında 64-96. */
  size?: number
  /** Görselin çevresindeki ince kare çerçeve çizilsin mi. */
  frame?: boolean
  className?: string
  /** Ekran okuyucuya okunacak metin. */
  label?: string
}

export function BrandLoader({ size = 64, frame = true, className, label = 'Yükleniyor' }: Props) {
  const id = useId().replace(/:/g, '')
  const dagilma = `dagilma-${id}`
  const parlama = `parlama-${id}`

  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={label}
      className={cn('inline-flex shrink-0', className)}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
        <defs>
          {/* Dağılma filtresi: gürültü dokusu + piksel kaydırma */}
          <filter id={dagilma} x="-35%" y="-35%" width="170%" height="170%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.028" numOctaves="2" seed="7" result="gurultu">
              <animate
                attributeName="baseFrequency"
                values="0.07;0.028;0.028;0.08"
                keyTimes="0;0.3;0.62;1"
                dur={DONGU}
                repeatCount="indefinite"
              />
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" in2="gurultu" xChannelSelector="R" yChannelSelector="G" scale="0">
              {/* 0 → net görüntü. Büyük değer → tanecikli dağılma. */}
              <animate
                attributeName="scale"
                values="34;0;0;38"
                keyTimes="0;0.3;0.62;1"
                calcMode="spline"
                keySplines="0.22 1 0.36 1; 0 0 1 1; 0.64 0 0.78 0"
                dur={DONGU}
                repeatCount="indefinite"
              />
            </feDisplacementMap>
          </filter>

          {/* Dağılırken soluklaşma; net halde tam opak */}
          <radialGradient id={parlama}>
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.35" />
            <stop offset="70%" stopColor="#3b82f6" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Arkadaki mavi hale; işaret netken belirir */}
        <circle cx="50" cy="50" r="46" fill={`url(#${parlama})`} opacity="0">
          <animate
            attributeName="opacity"
            values="0;1;1;0"
            keyTimes="0;0.3;0.62;1"
            dur={DONGU}
            repeatCount="indefinite"
          />
        </circle>

        {frame && (
          /* İnce kare çerçeve: kesik çizgi kaydırılarak kendini çiziyormuş gibi görünür */
          <rect
            x="6"
            y="6"
            width="88"
            height="88"
            rx="10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeOpacity="0.35"
            strokeDasharray="352"
            strokeDashoffset="352"
          >
            <animate
              attributeName="stroke-dashoffset"
              values="352;0;0;-352"
              keyTimes="0;0.3;0.62;1"
              calcMode="spline"
              keySplines="0.22 1 0.36 1; 0 0 1 1; 0.64 0 0.78 0"
              dur={DONGU}
              repeatCount="indefinite"
            />
          </rect>
        )}

        <g filter={`url(#${dagilma})`}>
          <image href="/brand/mark.png" x="14" y="14" width="72" height="72" opacity="0" preserveAspectRatio="xMidYMid meet">
            <animate
              attributeName="opacity"
              values="0;1;1;0"
              keyTimes="0;0.3;0.62;1"
              dur={DONGU}
              repeatCount="indefinite"
            />
          </image>
        </g>
      </svg>
    </span>
  )
}

/**
 * Bölüm ortasına yerleşen yükleme bloğu. Liste ve kart içerikleri gelene kadar
 * Loader2 yerine bunu kullanıyoruz.
 */
export function BrandLoaderBlock({
  size = 72,
  text = 'Veriler yükleniyor…',
  className,
}: {
  size?: number
  text?: string | null
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-12', className)}>
      <BrandLoader size={size} label={text ?? 'Yükleniyor'} />
      {text && <p className="text-sm text-zinc-500 dark:text-zinc-400">{text}</p>}
    </div>
  )
}

/** Sayfanın tamamını kaplayan yükleme perdesi; ilk açılış ve ağır geçişler için. */
export function BrandLoaderOverlay({ text = 'Yükleniyor…' }: { text?: string | null }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm dark:bg-zinc-950/80">
      <BrandLoaderBlock size={96} text={text} />
    </div>
  )
}
