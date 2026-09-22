'use client';

// watermelon "hero 35" bloğu. Düzen ve hareketler aynı. Değişenler:
// framer-motion yerine kurulu olan motion/react, LogoIcon yerine BytePanel işareti,
// dış sunucudaki arka plan görseli yerine degrade (istenirse backgroundImage ile görsel verilir),
// metinler prop.
import { motion, type Variants } from 'motion/react';
import { ArrowRight } from 'lucide-react';

export interface HeroNavLink {
  label: string;
  href: string;
}

export interface HeroStat {
  value: string;
  label: string;
}

export interface HeroProps {
  brandName?: string;
  navLinks?: HeroNavLink[];
  navCtaLabel?: string;
  navCtaHref?: string;
  titleWords?: string[];
  stats?: HeroStat[];
  description?: string;
  ctaLabel?: string;
  ctaHref?: string;
  backgroundImage?: string;
}

export default function Hero({
  brandName = 'BytePanel',
  navLinks = [],
  navCtaLabel = 'Demo iste',
  navCtaHref = '#iletisim',
  titleWords = ['Depoyu', 'hareket', 'defteriyle', 'yönetin'],
  stats = [],
  description = '',
  ctaLabel = 'Panele giriş',
  ctaHref = '#',
  backgroundImage,
}: HeroProps) {
  const navVariants: Variants = {
    hidden: { opacity: 0, y: -18, filter: 'blur(6px)' },
    show: {
      opacity: 1,
      y: 0,
      filter: 'blur(0px)',
      transition: { type: 'spring', damping: 22, stiffness: 150, delay: 0.1 },
    },
  };

  const titleContainerVariants: Variants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.09, delayChildren: 0.4 },
    },
  };
  const titleWordVariants: Variants = {
    hidden: { opacity: 0, y: 32, filter: 'blur(10px)', rotateX: 8 },
    show: {
      opacity: 1,
      y: 0,
      filter: 'blur(0px)',
      rotateX: 0,
      transition: { type: 'spring', damping: 26, stiffness: 95, mass: 1.1 },
    },
  };

  const statsVariants: Variants = {
    hidden: { opacity: 0, y: 16, filter: 'blur(4px)' },
    show: {
      opacity: 1,
      y: 0,
      filter: 'blur(0px)',
      transition: { type: 'spring', damping: 24, stiffness: 110, delay: 1.05 },
    },
  };

  const rightContainerVariants: Variants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.14, delayChildren: 0.75 },
    },
  };
  const rightItemVariants: Variants = {
    hidden: { opacity: 0, x: 20, filter: 'blur(5px)' },
    show: {
      opacity: 1,
      x: 0,
      filter: 'blur(0px)',
      transition: { type: 'spring', damping: 20, stiffness: 100, mass: 0.9 },
    },
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black font-sans antialiased selection:bg-white/30 selection:text-white">
      {/* Arka plan */}
      <div className="absolute inset-0 z-0">
        {backgroundImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={backgroundImage}
            alt=""
            aria-hidden
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            aria-hidden
            className="h-full w-full bg-[radial-gradient(70%_60%_at_20%_15%,rgba(37,99,235,0.35)_0%,transparent_60%),radial-gradient(60%_60%_at_85%_20%,rgba(124,58,237,0.28)_0%,transparent_65%),linear-gradient(180deg,#0b1020_0%,#09090b_100%)]"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/80" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1800px] flex-col justify-between px-6 py-6 md:px-12">
        {/* Üst menü */}
        <motion.nav
          variants={navVariants}
          initial="hidden"
          animate="show"
          className="flex items-center justify-between"
        >
          <a href="#" className="group flex cursor-pointer items-center gap-2 text-white">
            <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-blue-600 to-violet-600 text-xs font-bold">
              BP
            </span>
            <span className="text-lg font-medium tracking-wide">{brandName}</span>
          </a>

          <div className="hidden items-center gap-10 text-[13px] font-medium tracking-[0.05em] text-white/80 md:flex">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="flex min-h-[40px] items-center transition-colors hover:text-white"
              >
                {link.label}
              </a>
            ))}
          </div>

          <a
            href={navCtaHref}
            className="group flex min-h-[40px] items-center gap-2 rounded-full bg-zinc-200 px-6 py-2.5 text-[14px] font-medium text-black shadow-[inset_0_-2px_0px_rgba(0,0,0,0.2),inset_0_2px_0px_rgba(255,255,255,0.2)] transition-all will-change-transform hover:bg-white/90 active:scale-[0.96]"
          >
            {navCtaLabel}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </a>
        </motion.nav>

        {/* Alt içerik */}
        <div className="flex flex-col items-end justify-between gap-12 pb-8 lg:flex-row">
          <div
            className="flex w-full flex-col gap-12 lg:w-1/2"
            style={{ perspective: '800px' }}
          >
            <motion.h1
              variants={titleContainerVariants}
              initial="hidden"
              animate="show"
              className="text-[3.5rem] leading-[1.05] font-normal tracking-tight text-white sm:text-[5rem]"
            >
              {titleWords.map((word, i) => (
                <motion.span
                  key={i}
                  variants={titleWordVariants}
                  className="mr-[0.22em] inline-block last:mr-0"
                >
                  {word}
                </motion.span>
              ))}
            </motion.h1>

            {stats.length > 0 && (
              <motion.div
                variants={statsVariants}
                initial="hidden"
                animate="show"
                className="flex gap-12 sm:gap-16"
              >
                {stats.map(({ value, label }) => (
                  <div key={label} className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-white">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="currentColor"
                        className="opacity-80"
                      >
                        <circle cx="4" cy="4" r="1.5" />
                        <circle cx="12" cy="4" r="1.5" />
                        <circle cx="4" cy="12" r="1.5" />
                        <circle cx="12" cy="12" r="1.5" />
                      </svg>
                      <span className="text-[1.25rem] font-medium tracking-wide tabular-nums">
                        {value}
                      </span>
                    </div>
                    <span className="ml-6 text-[14px] font-medium tracking-wide text-white/60">
                      {label}
                    </span>
                  </div>
                ))}
              </motion.div>
            )}
          </div>

          <motion.div
            variants={rightContainerVariants}
            initial="hidden"
            animate="show"
            className="flex w-full flex-col items-start gap-8 lg:w-[450px] lg:items-start"
          >
            <motion.p
              variants={rightItemVariants}
              className="text-[1.125rem] leading-[1.6] font-normal text-pretty text-white/90"
            >
              {description}
            </motion.p>

            <motion.a
              href={ctaHref}
              variants={rightItemVariants}
              className="group flex min-h-[40px] items-center gap-2 rounded-full bg-zinc-200 px-7 py-3.5 text-[15px] font-medium text-black shadow-[inset_0_-2px_0px_rgba(0,0,0,0.2),inset_0_2px_0px_rgba(255,255,255,0.2)] transition-all will-change-transform hover:bg-white/90 active:scale-[0.96]"
            >
              {ctaLabel}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </motion.a>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
