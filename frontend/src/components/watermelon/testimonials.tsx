'use client';

// watermelon "testimonials 3" bloğu. Kart düzeni, gölgeler ve satır dizilimi aslındaki gibi.
// İçerik değiştirildi: orijinalde gerçek kişilerin (Dan Abramov, Linus Torvalds…) adı, fotoğrafı ve
// uydurma tweet'leri vardı. Onların yerine açıkça "örnek" etiketli yer tutucular kondu.
// Gerçek müşteri yorumları geldiğinde items prop'u ile değiştirilir ve isPlaceholder false yapılır.
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Quote } from 'lucide-react';

export interface Testimonial {
  name: string;
  role: string;
  avatar?: string;
  text: string;
  date: string;
}

export interface TestimonialsProps {
  title?: string;
  subtitle?: string;
  items?: Testimonial[];
  /** true iken bölümün üstünde ve kartlarda "örnek" uyarısı görünür */
  isPlaceholder?: boolean;
}

const PLACEHOLDER_ITEMS: Testimonial[] = [
  {
    name: 'Depo müdürü',
    role: 'Gıda toptancısı · 2 depo',
    text: 'Buraya müşterinizin kendi cümlesi gelecek. Örnek: sayım farkımız ilk ayda görünür şekilde azaldı.',
    date: 'Yer tutucu',
  },
  {
    name: 'Satın alma sorumlusu',
    role: 'Kozmetik üreticisi',
    text: 'Buraya müşterinizin kendi cümlesi gelecek. Örnek: sipariş önerileri sayesinde stok bitmeden haberimiz oluyor.',
    date: 'Yer tutucu',
  },
  {
    name: 'Operasyon direktörü',
    role: 'Lojistik firması · 4 depo',
    text: 'Buraya müşterinizin kendi cümlesi gelecek. Örnek: depolar arası transferleri artık tahminle değil raporla yapıyoruz.',
    date: 'Yer tutucu',
  },
  {
    name: 'Kalite sorumlusu',
    role: 'İlaç deposu',
    text: 'Buraya müşterinizin kendi cümlesi gelecek. Örnek: karantina akışı sayesinde kontrolsüz mal stoğa karışmıyor.',
    date: 'Yer tutucu',
  },
  {
    name: 'Şirket sahibi',
    role: 'Yedek parça ticareti',
    text: 'Buraya müşterinizin kendi cümlesi gelecek. Örnek: ölü stok raporu bağlı sermayeyi ilk kez net gösterdi.',
    date: 'Yer tutucu',
  },
  {
    name: 'Depo sorumlusu',
    role: 'Tekstil üreticisi',
    text: 'Buraya müşterinizin kendi cümlesi gelecek. Örnek: mal kabulde barkodla çalışmak kayıt süresini kısalttı.',
    date: 'Yer tutucu',
  },
];

function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default function Testimonials({
  title = 'Kullananlar ne diyor?',
  subtitle = 'Sahadaki ekiplerin kendi cümleleri.',
  items = PLACEHOLDER_ITEMS,
  isPlaceholder = true,
}: TestimonialsProps) {
  return (
    <section className="bg-background py-16">
      <div className="container mx-auto px-4 md:px-6">
        <div className="mb-12 flex flex-col items-center text-center md:mb-16">
          {isPlaceholder && (
            <span className="mb-4 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-500">
              Örnek içerik — gerçek yorumlarla değiştirilecek
            </span>
          )}
          <h2 className="text-foreground mb-3 text-4xl font-semibold tracking-tight md:text-5xl">
            {title}
          </h2>
          <p className="text-muted-foreground max-w-xl text-base md:text-lg">
            {subtitle}
          </p>
        </div>

        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
          {items.map((t, idx) => (
            <Card
              key={idx}
              className="bg-muted/50 flex flex-col rounded-xl pb-4 shadow-[inset_0px_1px_0px_0px_rgba(255,255,255,1),0px_0px_0px_1px_rgba(0,0,0,0.08),0px_1px_2px_-1px_rgba(0,0,0,0.08),0px_2px_4px_0px_rgba(0,0,0,0.06)] ring-0 transition-all duration-200 hover:shadow-[inset_0px_1px_0px_0px_rgba(255,255,255,1),0px_0px_0px_1px_rgba(0,0,0,0.08),0px_6px_8px_0px_rgba(0,0,0,0.1)] dark:shadow-[inset_0px_1px_0px_0px_rgba(255,255,255,0.06),0px_0px_0px_1px_rgba(255,255,255,0.08),0px_1px_2px_-1px_rgba(0,0,0,0.4),0px_2px_4px_0px_rgba(0,0,0,0.3)] dark:hover:shadow-[inset_0px_1px_0px_0px_rgba(255,255,255,0.06),0px_0px_0px_1px_rgba(255,255,255,0.1),0px_6px_8px_0px_rgba(0,0,0,0.5)]"
            >
              <div className="flex items-start justify-between px-4">
                <div className="flex items-start gap-3">
                  <Avatar className="h-10 w-10">
                    {t.avatar && <AvatarImage src={t.avatar} alt={t.name} />}
                    <AvatarFallback className="text-xs font-semibold">
                      {initials(t.name)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex flex-col leading-tight">
                    <span className="text-foreground text-sm font-semibold">
                      {t.name}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {t.role}
                    </span>
                  </div>
                </div>

                <Quote className="text-muted-foreground h-4 w-4" />
              </div>

              <p className="text-foreground text-md flex-1 px-4 leading-relaxed">
                {t.text}
              </p>

              <div className="flex flex-row items-center justify-between px-4">
                <div className="text-muted-foreground text-sm font-medium">
                  {t.date}
                </div>
                {isPlaceholder && (
                  <span className="text-muted-foreground/60 rounded-full border px-2 py-0.5 text-[10px]">
                    örnek
                  </span>
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
