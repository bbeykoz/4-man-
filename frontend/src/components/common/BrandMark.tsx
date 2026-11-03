import Image from 'next/image'
import { cn } from '@/lib/utils'

/**
 * Argus Tech görselleri.
 *
 * Tasarımcıdan gelen dosyaların arka planı koyu lacivert zeminle birlikte geliyordu;
 * küçük boyutta yalnız koyu bir kare görünüyordu. Buradaki sürümlerde o zemin
 * ayıklandı (saydam), böylece görseller sayfanın zeminine oturuyor. Kaynak
 * dosyalar design/brand/ altında duruyor.
 */

/**
 * Yalnız işaret (üçgen + göz). Kare alana oturur.
 *
 * İşaret gümüş–mavi olduğu için beyaz zeminde kayboluyor; açık temada koyu bir
 * rozetin içinde gösterilir, koyu temada doğrudan zemine oturur.
 */
export function BrandMark({ className, priority = false }: { className?: string; priority?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg',
        'bg-[#0b1220] p-[12%] ring-1 ring-black/5',
        'dark:bg-transparent dark:p-0 dark:ring-0',
        className,
      )}
    >
      <Image
        src="/brand/mark.png"
        alt="Argus Tech"
        width={256}
        height={256}
        priority={priority}
        className="h-full w-full object-contain"
      />
    </span>
  )
}

/** "ARGUS" üstte, "TECH" altta olan yazı görseli. Marka adının yazıyla geçtiği yerlerde kullanılır. */
export function BrandWordmark({ className, priority = false }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src="/brand/wordmark.png"
      alt="Argus Tech"
      width={520}
      height={129}
      priority={priority}
      /* Gümüş yazı beyaz zeminde soluk kalıyor; açık temada biraz koyulaştırılır */
      className={cn('h-auto w-auto select-none brightness-[0.72] contrast-125 dark:brightness-100 dark:contrast-100', className)}
    />
  )
}

/** İşaret ve yazının bir arada olduğu tanıtım görseli; koyu zeminli ekranlar için. */
export function BrandLockup({ className, priority = false }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src="/brand/lockup.jpg"
      alt="Argus Tech"
      width={760}
      height={588}
      priority={priority}
      className={cn('h-auto w-full max-w-xs select-none rounded-xl', className)}
    />
  )
}
