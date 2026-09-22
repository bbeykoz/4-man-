'use client';

// watermelon "navigation 7" bloğu. Düzen aynı: yuvarlak yüzen çubuk + açılır mega menü.
// Değişenler: import yolu @/components/ui/*, içerik Türkçe ve depo paneline göre.
// Avatar menüsü kaldırıldı — tanıtım sayfasında oturum açmış kullanıcı yok, yerine giriş düğmesi.
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowUpRight,
  CalendarClock,
  Layers,
  Menu,
  ShieldAlert,
  ShoppingCart,
  X,
} from 'lucide-react';
import { useState } from 'react';

export interface NavigationProps {
  brandName?: string;
  panelUrl?: string;
}

export function Navigation({
  brandName = 'BytePanel',
  panelUrl = '#',
}: NavigationProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative w-full py-10">
      <div className="mx-auto flex max-w-7xl items-center justify-center px-6">
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverAnchor asChild>
            <div className="flex h-16 w-full items-center justify-between gap-2 rounded-full border border-neutral-200 bg-white pr-4 shadow-lg md:w-5xl lg:w-4xl dark:border-neutral-800 dark:bg-neutral-950">
              <div className="flex items-center gap-2 pl-4">
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-xl text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                  >
                    {isOpen ? <X className="size-5" /> : <Menu className="size-5" />}
                    <span className="sr-only">Menüyü aç</span>
                  </Button>
                </PopoverTrigger>

                <a href="#" className="flex items-center gap-1.5">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-blue-600 to-violet-600 text-xs font-bold text-white">
                    BP
                  </span>
                  <span className="text-lg font-bold tracking-tight text-neutral-900 dark:text-white">
                    {brandName}
                  </span>
                </a>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href="#fiyatlandirma"
                  className="hidden text-sm font-medium text-neutral-600 hover:text-neutral-900 lg:block dark:text-neutral-400 dark:hover:text-neutral-50"
                >
                  Fiyatlandırma
                </a>
                <Button asChild className="rounded-full px-5">
                  <a href={panelUrl}>Panele giriş</a>
                </Button>
              </div>
            </div>
          </PopoverAnchor>

          <PopoverContent
            align="center"
            sideOffset={20}
            className={cn(
              'max-h-[82dvh] w-xs max-w-none overflow-y-auto overscroll-contain rounded-2xl border border-neutral-200 bg-white p-0 shadow-none ring-0 sm:w-2xl dark:border-neutral-800 dark:bg-neutral-950',
              'lg:w-[calc(100vw-3rem)] lg:max-w-5xl lg:rounded-[2.5rem] lg:shadow-lg',
            )}
          >
            <div className="mx-auto grid w-full max-w-none grid-cols-1 gap-0 px-8 py-6 lg:max-w-5xl lg:grid-cols-4 lg:px-10 lg:py-10 dark:divide-neutral-900">
              {/* Sütun 1 */}
              <div className="flex flex-col pb-8 lg:pr-8 lg:pb-0">
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-100 dark:bg-neutral-900">
                  <Layers className="h-5 w-5 text-neutral-700 dark:text-neutral-300" />
                </div>
                <h4 className="mb-1 text-sm font-medium text-neutral-900 dark:text-neutral-50">
                  Hareket defteri
                </h4>
                <p className="mb-3 text-sm tracking-tight text-neutral-500 dark:text-neutral-400">
                  Giriş, çıkış, transfer ve sayım tek deftere yazılır. Stok
                  onayda işlenir.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    asChild
                    variant="outline"
                    className="h-7 gap-1.5 rounded-full px-3 text-xs text-neutral-700 dark:text-neutral-300"
                  >
                    <a href="#ozellikler">
                      <ShieldAlert className="h-3.5 w-3.5" />
                      Stok riski
                    </a>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    className="h-7 gap-1.5 rounded-full px-3 text-xs text-neutral-700 dark:text-neutral-300"
                  >
                    <a href="#ozellikler">
                      <CalendarClock className="h-3.5 w-3.5" />
                      SKT takibi
                    </a>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    className="h-7 gap-1.5 rounded-full px-3 text-xs text-neutral-700 dark:text-neutral-300"
                  >
                    <a href="#ozellikler">
                      <ShoppingCart className="h-3.5 w-3.5" />
                      Satın alma
                    </a>
                  </Button>
                </div>
              </div>

              {/* Sütun 2 */}
              <div className="flex flex-col gap-3 border-t border-neutral-100 py-8 lg:border-t-0 lg:border-l lg:py-0 lg:pl-8 dark:border-neutral-900">
                <h4 className="mb-1 text-xs text-neutral-400 uppercase dark:text-neutral-500">
                  Kullanım
                </h4>
                {[
                  { label: 'Kalite kontrol', href: '#ozellikler' },
                  { label: 'Depolar arası transfer', href: '#ozellikler' },
                  { label: 'Anomali tespiti', href: '#ozellikler' },
                  { label: 'ABC / XYZ analizi', href: '#ozellikler' },
                ].map((item) => (
                  <a
                    key={item.label}
                    href={item.href}
                    className="text-sm font-medium tracking-tight text-neutral-500 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-50"
                  >
                    {item.label}
                  </a>
                ))}
              </div>

              {/* Sütun 3 */}
              <div className="flex flex-col gap-3 border-t border-neutral-100 py-8 lg:border-t-0 lg:border-l lg:py-0 lg:pl-8 dark:border-neutral-900">
                <h4 className="mb-1 text-xs text-neutral-400 uppercase dark:text-neutral-500">
                  Kaynaklar
                </h4>
                {[
                  { label: 'Nasıl çalışır', href: '#nasil' },
                  { label: 'Sık sorulan sorular', href: '#sss' },
                  { label: 'Rehberler', href: '#kaynaklar' },
                  { label: 'İletişim', href: '#iletisim' },
                ].map((item) => (
                  <a
                    key={item.label}
                    href={item.href}
                    className="text-sm font-medium tracking-tight text-neutral-500 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-50"
                  >
                    {item.label}
                  </a>
                ))}
              </div>

              {/* Sütun 4 */}
              <div className="flex flex-col border-t border-neutral-100 py-8 lg:border-t-0 lg:border-l lg:py-0 lg:pl-8 dark:border-neutral-900">
                <h4 className="mb-4 text-xs text-neutral-400 uppercase dark:text-neutral-500">
                  Öne çıkan
                </h4>
                <a
                  href="#iletisim"
                  className="ring-primary/50 group relative flex h-full min-h-[160px] flex-col justify-between overflow-hidden rounded-2xl p-6 ring transition-all"
                >
                  <div className="from-primary/5 dark:from-primary/10 absolute inset-0 bg-gradient-to-br via-transparent to-transparent group-hover:opacity-100" />
                  <div className="absolute inset-0 -z-10 bg-neutral-100 dark:bg-neutral-900" />

                  <div>
                    <Badge
                      variant="outline"
                      className="border-primary text-primary dark:border-primary dark:text-primary mb-3 bg-white dark:bg-neutral-950"
                    >
                      Canlı demo
                    </Badge>
                    <h4 className="mb-2 text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                      Kendi ürünlerinizle deneyin
                    </h4>
                    <p className="text-sm tracking-tight text-neutral-600 dark:text-neutral-400">
                      Otuz dakikalık gösterimde kayıt açmaktan rapor almaya
                      kadar akışı birlikte görelim.
                    </p>
                  </div>

                  <div className="text-primary dark:text-primary mt-4 flex items-center text-sm font-medium">
                    Demo planla{' '}
                    <ArrowUpRight className="ml-1 size-4 transition-transform group-hover:translate-x-1" />
                  </div>
                </a>
              </div>
            </div>

            <div className="px-6 pb-8 lg:hidden">
              <Button
                asChild
                className="bg-primary shadow-primary/20 hover:bg-primary dark:bg-primary dark:hover:bg-primary w-full rounded-xl py-6 text-white shadow-lg"
              >
                <a href={panelUrl}>Panele giriş</a>
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
