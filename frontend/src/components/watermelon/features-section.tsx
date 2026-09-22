'use client';

// watermelon "features 4" bloğu. Düzen aynı; import yolu @/components/ui/card,
// metinler ve sayılar depo işine göre Türkçe.
import { Card, CardContent } from '@/components/ui/card';

import {
  HiSignal,
  HiUsers,
  HiChartBar,
  HiArrowTrendingUp,
  HiClock,
  HiExclamationTriangle,
} from 'react-icons/hi2';

export default function FeaturesSection() {
  return (
    <section className="flex w-full flex-col items-center justify-center px-6 py-16">
      <h1 className="text-foreground text-center text-4xl font-semibold tracking-tight md:text-5xl">
        Önce görün, sonra karar verin
      </h1>

      <p className="text-muted-foreground mt-4 max-w-2xl text-center">
        Hangi ürün tükeniyor, hangi lot bozulmak üzere, hangi tedarikçi geç
        kalıyor. Hepsi tek yerde, gerçek hareket verisinden.
      </p>

      <div className="mt-12 grid w-full max-w-6xl items-stretch gap-6 md:grid-cols-3">
        <Card className="bg-muted/40 flex h-full flex-col rounded-[40px] p-0">
          <CardContent className="flex h-full flex-col gap-8 p-4">
            <div className="text-center">
              <h3 className="text-foreground text-2xl font-semibold">
                Hareket akışı
              </h3>
              <p className="text-muted-foreground text-md/6">
                Giriş, çıkış ve transferleri anlık izleyin. Yoğunluk ve
                sapmalar aynı gün görünür.
              </p>
            </div>

            <div className="bg-background dark:bg-background/60 flex min-h-[350px] flex-col justify-between rounded-4xl  p-4 shadow-[0px_3px_8px_-1px_rgba(0,0,0,0.03),0px_1px_2px_-1px_rgba(0,0,0,0.04),0px_2px_4px_0px_rgba(0,0,0,0.04)] dark:shadow-[0px_3px_8px_-1px_rgba(0,0,0,0.06),0px_1px_2px_-1px_rgba(0,0,0,0.04),0px_2px_4px_0px_rgba(0,0,0,0.04),inset_0px_2px_0px_0px_rgba(255,255,255,0.05)]">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1 text-sm">
                  <HiSignal className="text-primary h-4 w-4" />
                  Bu ayki kayıtlar
                </span>
                <span className="text-primary text-xs">● canlı</span>
              </div>

              <div className="flex items-end justify-between">
                <div className="text-foreground text-4xl font-semibold">
                  372
                </div>
                <div className="text-primary text-sm">+%12</div>
              </div>

              <div className="flex h-24 items-end gap-2">
                {[40, 60, 35, 80, 55, 90, 70].map((h, i) => (
                  <div
                    key={i}
                    className="bg-primary/80 w-full rounded-md"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-muted rounded-lg p-3">
                  <div className="text-muted-foreground flex items-center gap-1 text-xs">
                    <HiClock className="h-3 w-3" />
                    Çıkış süresi
                  </div>
                  <div className="text-foreground text-lg font-medium">
                    2,4 sa
                  </div>
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <div className="text-muted-foreground flex items-center gap-1 text-xs">
                    <HiExclamationTriangle className="h-3 w-3" />
                    Hasar
                  </div>
                  <div className="text-destructive text-lg font-medium">
                    %0,6
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/40 flex h-full flex-col rounded-4xl p-0">
          <CardContent className="flex h-full flex-col gap-8 p-4">
            <div className="text-center">
              <h3 className="text-foreground text-2xl font-semibold">
                Stok dağılımı
              </h3>
              <p className="text-muted-foreground text-md/6">
                Kullanılabilir, karantinadaki ve hasarlı stok ayrı ayrı durur.
                Satılabilir miktarı karıştırmaz.
              </p>
            </div>

            <div className="bg-background dark:bg-background/60 flex min-h-[350px] flex-col justify-between rounded-4xl  p-4 shadow-[0px_3px_8px_-1px_rgba(0,0,0,0.03),0px_1px_2px_-1px_rgba(0,0,0,0.04),0px_2px_4px_0px_rgba(0,0,0,0.04)] dark:shadow-[0px_3px_8px_-1px_rgba(0,0,0,0.06),0px_1px_2px_-1px_rgba(0,0,0,0.04),0px_2px_4px_0px_rgba(0,0,0,0.04),inset_0px_2px_0px_0px_rgba(255,255,255,0.05)]">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1 text-sm">
                  <HiUsers className="text-primary h-4 w-4" />
                  Kullanılabilir pay
                </span>
                <span className="text-muted-foreground text-xs">13 ürün</span>
              </div>

              <div className="flex items-center justify-center">
                <div className="border-primary/20 relative flex h-28 w-28 items-center justify-center rounded-full border-8">
                  <div className="border-primary absolute h-full w-full rotate-45 rounded-full border-8 border-t-transparent" />
                  <span className="text-foreground text-xl font-semibold">
                    %99
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                {[
                  { name: 'Kullanılabilir', value: '3.117' },
                  { name: 'Karantinada', value: '0' },
                  { name: 'Hasarlı', value: '20' },
                ].map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-muted-foreground">{item.name}</span>
                    <span className="text-foreground font-medium">
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <div className="bg-primary h-2 flex-1 rounded-full" />
                <div className="bg-primary/60 h-2 flex-1 rounded-full" />
                <div className="bg-primary/30 h-2 flex-1 rounded-full" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/40 flex h-full flex-col rounded-4xl p-0">
          <CardContent className="flex h-full flex-col gap-8 p-4">
            <div className="text-center">
              <h3 className="text-foreground text-2xl font-semibold">
                Depo skoru
              </h3>
              <p className="text-muted-foreground text-md/6">
                Doğruluk, zamanında teslim ve devir hızı tek skorda toplanır.
                Önceki döneme göre kıyaslanır.
              </p>
            </div>

            <div className="bg-background dark:bg-background/60 flex min-h-[350px] flex-col justify-between rounded-4xl  p-4 shadow-[0px_3px_8px_-1px_rgba(0,0,0,0.03),0px_1px_2px_-1px_rgba(0,0,0,0.04),0px_2px_4px_0px_rgba(0,0,0,0.04)] dark:shadow-[0px_3px_8px_-1px_rgba(0,0,0,0.06),0px_1px_2px_-1px_rgba(0,0,0,0.04),0px_2px_4px_0px_rgba(0,0,0,0.04),inset_0px_2px_0px_0px_rgba(255,255,255,0.05)]">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1 text-sm">
                  <HiChartBar className="text-primary h-4 w-4" />
                  Depo KPI
                </span>
                <span className="text-primary border-primary/20 bg-primary/5 rounded-3xl border px-2 text-xs">
                  +%6,2
                </span>
              </div>

              <div className="text-foreground text-5xl font-semibold">78</div>

              <div className="space-y-4">
                {[
                  { label: 'Sayım doğruluğu', value: 99 },
                  { label: 'Zamanında teslim', value: 94 },
                  { label: 'Stok devir hızı', value: 74 },
                ].map((item, i) => (
                  <div key={i} className="space-y-1">
                    <div className="text-muted-foreground flex justify-between text-xs">
                      <span>{item.label}</span>
                      <span>%{item.value}</span>
                    </div>
                    <div className="bg-muted h-2 w-full rounded-full">
                      <div
                        className="bg-primary h-2 rounded-full"
                        style={{ width: `${item.value}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-muted flex justify-between rounded-lg p-3 text-sm">
                <span className="text-muted-foreground flex items-center gap-1">
                  <HiArrowTrendingUp className="h-4 w-4" />
                  Eğilim
                </span>
                <span className="text-primary font-medium">Yükseliyor</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
