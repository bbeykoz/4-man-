'use client'

import { useState } from 'react'
import {
  ArrowRight, Boxes, CalendarClock, ClipboardCheck, FileSpreadsheet, Gauge, Layers,
  PlayCircle, ShieldAlert, ShoppingCart, Shuffle, Siren, Warehouse,
} from 'lucide-react'
import { IoBriefcase, IoDesktop, IoHeadset, IoSchool } from 'react-icons/io5'
import { TooltipNavbar } from '@/components/watermelon/tooltip-navbar'
import { WigglingCards } from '@/components/watermelon/wiggling-cards'
import { FeatureTour } from '@/components/watermelon/feature-tour'
import ContactBlock from '@/components/watermelon/contact-block'
import AnnouncementBar from '@/components/watermelon/announcement-bar'
import Bento from '@/components/watermelon/bento'
import FeaturesSection from '@/components/watermelon/features-section'
import FAQSection from '@/components/watermelon/faq-section'
import BlogSection from '@/components/watermelon/blog-section'
import { PerformanceOverview } from '@/components/watermelon/performance-overview'
import { Footer } from '@/components/watermelon/footer'
import Hero from '@/components/watermelon/hero'
import { Navigation } from '@/components/watermelon/navigation'
import Stats from '@/components/watermelon/stats'
import Integrations from '@/components/watermelon/integrations'
import Notifications from '@/components/watermelon/notifications'
import { Pricing } from '@/components/watermelon/pricing'
import Testimonials from '@/components/watermelon/testimonials'

const PANEL_URL = 'https://panel.smsbenden.com'

/** Kahraman bölümündeki modül çubuğu: panelin depo sekmeleriyle aynı adlar. */
const MODULE_ITEMS = [
  { icon: <Layers className="h-full w-full" />, label: 'Depolama' },
  { icon: <ClipboardCheck className="h-full w-full" />, label: 'Kalite kontrol' },
  { icon: <CalendarClock className="h-full w-full" />, label: 'SKT takibi' },
  { icon: <ShieldAlert className="h-full w-full" />, label: 'Stok riski' },
  { icon: <ShoppingCart className="h-full w-full" />, label: 'Satın alma' },
  { icon: <FileSpreadsheet className="h-full w-full" />, label: 'Raporlar' },
]

/** Ölçüler örnek panelden: depo müdürü ekranındaki kartların karşılığı. */
const METRIC_CARDS = [
  { id: 0, icon: Boxes, percentage: '%99,4', value: '3.117', label: 'Kullanılabilir stok' },
  { id: 1, icon: ShieldAlert, percentage: '4 ürün', value: '%12', label: 'Kritik stok oranı' },
  { id: 2, icon: CalendarClock, percentage: '30 gün', value: '7', label: 'SKT riski taşıyan lot' },
  { id: 3, icon: Gauge, percentage: '+%8', value: '%94', label: 'Zamanında teslim' },
]

const FEATURES = [
  {
    icon: Layers,
    title: 'Hareket defteri',
    text: 'Her giriş, çıkış, transfer ve sayım ayrı kayıt olarak yazılır. Silinmez; iptal edilirse ters kayıt düşülür. Stok onayda işlenir.',
  },
  {
    icon: ClipboardCheck,
    title: 'Kalite kontrol',
    text: 'Yeni kayıtta kalite kontrol sorulur ve görsel istenir. Kontrol bekleyen mal karantinada durur, onaylanınca kullanılabilir stoğa geçer.',
  },
  {
    icon: CalendarClock,
    title: 'Son kullanma ve ölü stok',
    text: 'Lot bazında SKT takibi, FEFO ile ilk çıkacak lotun seçilmesi, hareketsiz ürünlerin ve bağlı sermayenin raporlanması.',
  },
  {
    icon: ShieldAlert,
    title: 'Stok riski',
    text: 'Tüketim hızı, tedarik süresi ve emniyet stoğu birlikte değerlendirilir. Stok bitmeden önce uyarı gelir, sipariş miktarı önerilir.',
  },
  {
    icon: ShoppingCart,
    title: 'Satın alma',
    text: 'Öneriden taslak siparişe, mal kabulden faturaya. Tedarikçi performansı gecikme, eksik gönderim ve hasar oranıyla ölçülür.',
  },
  {
    icon: Shuffle,
    title: 'Depolar arası transfer',
    text: 'Bir depoda fazla, diğerinde eksik olan ürün eşleştirilir. Sistem transferi kendisi yapmaz, önerir; onay sizde kalır.',
  },
  {
    icon: Siren,
    title: 'Anomali tespiti',
    text: 'Olağan dışı çıkış, aşırı hasar kaydı, mesai dışı işlem ve sayım farkı gece taramasında yakalanır, yetkiliye bildirilir.',
  },
  {
    icon: FileSpreadsheet,
    title: 'Raporlama',
    text: 'Aylık hacim, risk trendi, depo bazında stok ve tedarikçi gecikmesi grafikleri. On iki rapor tek tıkla Excel olarak iner.',
  },
]

/** Fiyatlandırma bölümü (pricing 3). Rakamlar örnektir, kendi paketlerinle değişecek. */
const PRICING_PLANS = [
  {
    id: 'isletme',
    name: 'İşletme',
    price: '₺2.500',
    description: 'Tek veya birkaç depolu işletmeler için aylık abonelik. Kurulum ve veri aktarımı dahil.',
    isPopular: true,
    popularBadgeText: 'En çok tercih edilen',
    buttonText: 'Başlayalım',
    features: [
      { text: 'Sınırsız ürün ve hareket kaydı' },
      { text: 'Kalite kontrol ve karantina' },
      { text: 'SKT takibi, FEFO ve ölü stok' },
      { text: 'Satın alma ve tedarikçi performansı' },
      { text: 'On iki Excel raporu' },
    ],
  },
  {
    id: 'kurumsal',
    name: 'Kurumsal',
    price: '₺4.900',
    description: 'Çok depolu yapılar, geniş ekipler ve özel kural isteyen operasyonlar için.',
    buttonText: 'Teklif iste',
    buttonVariant: 'outline' as const,
    features: [
      { text: 'İşletme paketindeki her şey' },
      { text: 'Sınırsız kullanıcı ve rol' },
      { text: 'Anomali tespiti ve gece taraması' },
      { text: 'Depolar arası transfer önerileri' },
      { text: 'Öncelikli destek ve eğitim' },
    ],
  },
]

const ENTERPRISE_PLAN = {
  title: 'Kendi sunucunuzda',
  description:
    'Veriler sizin sunucunuzda dursun isterseniz kurulumu biz yapar, yedekleme ve güncellemeyi devrederiz.',
  buttonText: 'Konuşalım',
  footnote: 'Kurulum ve veri aktarımı ücretsiz',
}

/** İletişim kartları. E-postalar geçici, gerçek adreslerle değişecek. */
const CONTACT_METHODS = [
  {
    id: 'destek',
    icon: <IoHeadset className="h-6 w-6" />,
    title: 'Teknik destek',
    description: 'Panel, barkod okuyucu veya Excel aktarımıyla ilgili sorunlarda yardım alın.',
    actionLabel: 'destek@smsbenden.com',
    actionUrl: 'mailto:destek@smsbenden.com',
  },
  {
    id: 'satis',
    icon: <IoBriefcase className="h-6 w-6" />,
    title: 'Satış ve kurumsal',
    description: 'Çok depolu kurulum, özel paket ve fiyatlandırma için görüşelim.',
    actionLabel: 'Satışla görüş',
    actionUrl: 'mailto:satis@smsbenden.com',
  },
  {
    id: 'demo',
    icon: <IoDesktop className="h-6 w-6" />,
    title: 'Canlı demo',
    description: 'Kendi ürünlerinizle otuz dakikalık canlı gösterim yapalım.',
    actionLabel: 'Demo planla',
    actionUrl: 'mailto:satis@smsbenden.com?subject=Demo%20talebi',
  },
  {
    id: 'kurulum',
    icon: <IoSchool className="h-6 w-6" />,
    title: 'Kurulum ve eğitim',
    description: 'Veri aktarımı, kullanıcı yetkileri ve depo ekibi eğitimi bizde.',
    actionLabel: 'Kurulum iste',
    actionUrl: 'mailto:destek@smsbenden.com?subject=Kurulum%20talebi',
  },
]

const HERO_STATS = [
  { value: '2,4 saat', label: 'Ortalama çıkış süresi' },
  { value: '%99,4', label: 'Sayım doğruluğu' },
]

/** SSS blokları iki başlıkta toplandı: ürün mantığı ve kurulum. */
const FAQ_CATEGORIES = [
  {
    id: 'stok',
    label: 'Stok',
    icon: <Layers className="h-3.5 w-3.5" />,
    items: [
      {
        question: 'Stok ne zaman düşer?',
        answer:
          'Kayıt açıldığında değil, onaylandığında. Böylece bekleyen veya iptal edilen kayıtlar stoğu bozmaz. İptalde ters kayıt düşülür.',
      },
      {
        question: 'Kalite kontrolü bekleyen mal stoğa girer mi?',
        answer:
          'Girmez. Kontrol bekleyen mal karantinada durur. Kontrol geçilince kullanılabilir stoğa geçer, kalırsa hasarlı kovasına yazılır.',
      },
      {
        question: 'Son kullanma tarihi olan ürünlerde hangi lot çıkar?',
        answer:
          'FEFO kuralı uygulanır: tarihi en yakın lot önce çıkar. Sistem çıkışta hangi lottan ne kadar düşüleceğini kendisi önerir.',
      },
      {
        question: 'Yapay zekâ stoğu kendi başına değiştirir mi?',
        answer:
          'Hayır. Sipariş ve transfer gibi işlemler yalnızca önerilir, gerekçesi açıklanır. Uygulama kararı her zaman kullanıcıya aittir.',
      },
    ],
  },
  {
    id: 'kurulum',
    label: 'Kurulum',
    icon: <ShieldAlert className="h-3.5 w-3.5" />,
    items: [
      {
        question: 'Verilerim nerede tutuluyor?',
        answer:
          'Veriler kendi sunucunuzda, kendi veritabanınızda durur. Her gece otomatik yedek alınır ve yedekler on dört gün saklanır.',
      },
      {
        question: 'Mevcut stok verimi aktarabilir miyim?',
        answer:
          'Evet. Ürün ve kayıtlar Excel ile toplu olarak yüklenir. Açılış stokları hareket defterine ilk giriş kaydı olarak yazılır.',
      },
      {
        question: 'Kaç depo tanımlayabilirim?',
        answer:
          'Sınır yok. Her deponun stoğu ayrı tutulur, depolar arası transfer önerileri kendiliğinden çıkar.',
      },
      {
        question: 'Barkod okuyucu gerekiyor mu?',
        answer:
          'Zorunlu değil. Kayıt elle de açılır. Barkod okuyucu veya telefon kamerası kullanıldığında ürün alanı kendiliğinden dolar.',
      },
    ],
  },
]

/** CTA bloğundaki telefon ekranı: panelin depo KPI değerleri. */
const KPI_PERIODS = [
  {
    id: 'son-30-gun',
    label: 'Son 30 gün',
    metrics: [
      { id: 'hareket', label: 'Hareket', value: '372', changePercent: 12, icon: 'chart' as const },
      { id: 'stok', label: 'Kullanılabilir', value: '3.117', changePercent: 4, icon: 'product' as const },
      { id: 'kritik', label: 'Kritik ürün', value: '4', changePercent: -18, icon: 'users' as const },
      { id: 'deger', label: 'Stok değeri', value: '₺1,2M', changePercent: 6, icon: 'finance' as const },
    ],
    activities: [
      { id: 'a1', title: 'Mal kabul · LT-QRS-018', timestamp: 'Bugün 09:14', value: '+50', isPositive: true },
      { id: 'a2', title: 'Sevkiyat · Ana Depo', timestamp: 'Dün 16:40', value: '-120', isPositive: false },
      { id: 'a3', title: 'Transfer · İstanbul deposuna', timestamp: 'Dün 11:05', value: '80', isPositive: true },
    ],
  },
]

/** Blog görselleri şimdilik Unsplash; kendi görsellerinle değişecek. */
const BLOG_DATA = {
  badge: 'KAYNAKLAR',
  heading: 'Depo ve stok\nyönetimi rehberleri',
  description:
    'Sayım, kalite kontrol ve satın alma süreçlerini kurarken işinize yarayacak kısa yazılar.',
  asideText:
    'Sahadaki uygulamalardan öğrendiklerimizi paylaşıyoruz: neyin işe yaradığı, neyin yaramadığı.',
  viewAllLabel: 'Tüm yazılar',
  viewAllHref: '#',
  articles: [
    {
      category: 'Stok yönetimi',
      readTime: '7 dakika',
      title: 'Emniyet stoğu nasıl hesaplanır, ABC/XYZ neden gerekir',
      href: '#',
      accent: 'blue' as const,
      imageSrc: 'https://images.unsplash.com/photo-1553413077-190dd305871c?w=800&q=80',
      imageAlt: 'Depo rafları',
    },
    {
      category: 'Kalite kontrol',
      readTime: '5 dakika',
      title: 'Mal kabulde kalite kontrolü: karantina neden şart',
      href: '#',
      accent: 'green' as const,
      imageSrc: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=800&q=80',
      imageAlt: 'Kutular ve etiketler',
    },
    {
      category: 'Satın alma',
      readTime: '6 dakika',
      title: 'Tedarikçi performansını gecikme ve eksik gönderimle ölçmek',
      href: '#',
      accent: 'violet' as const,
      imageSrc: 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800&q=80',
      imageAlt: 'Sevkiyat araçları',
    },
  ],
}

const FOOTER_COLUMNS = [
  {
    title: 'Ürün',
    links: [
      { label: 'Özellikler', href: '#ozellikler' },
      { label: 'Nasıl çalışır', href: '#nasil' },
      { label: 'Fiyatlandırma', href: '#fiyatlandirma' },
      { label: 'Panele giriş', href: PANEL_URL },
    ],
  },
  {
    title: 'Çözümler',
    links: [
      { label: 'Stok riski', href: '#ozellikler' },
      { label: 'SKT ve ölü stok', href: '#ozellikler' },
      { label: 'Satın alma', href: '#ozellikler' },
      { label: 'Raporlama', href: '#ozellikler' },
    ],
  },
  {
    title: 'Destek',
    links: [
      { label: 'SSS', href: '#sss' },
      { label: 'İletişim', href: '#iletisim' },
      { label: 'Kurulum ve eğitim', href: '#iletisim' },
      { label: 'Kaynaklar', href: '#kaynaklar' },
    ],
  },
]

const FOOTER_LEGAL = [
  { label: 'Gizlilik', href: '#' },
  { label: 'Kullanım koşulları', href: '#' },
  { label: 'KVKK', href: '#' },
]

const TOUR_STEPS = [
  {
    id: 'kayit',
    title: 'Kaydı aç',
    description: 'Barkodu okut veya ürünü seç. Miktar, lot ve son kullanma tarihi aynı ekranda girilir.',
    icon: <Warehouse className="size-5" />,
  },
  {
    id: 'kalite',
    title: 'Kalite kontrolü yap',
    description: 'Kontrol sorusu ve görsel istenir. Bekleyen mal karantinada durur, kullanılabilir stoğa karışmaz.',
    icon: <ClipboardCheck className="size-5" />,
  },
  {
    id: 'onay',
    title: 'Onayla',
    description: 'Onayla birlikte hareket deftere işlenir ve stok güncellenir. İptalde ters kayıt düşülür.',
    icon: <Layers className="size-5" />,
  },
  {
    id: 'rapor',
    title: 'Raporu al',
    description: 'Risk, SKT, tedarikçi ve depo raporları hazır gelir. On iki rapor Excel olarak indirilir.',
    icon: <FileSpreadsheet className="size-5" />,
  },
]

function SectionTitle({ eyebrow, title, text }: { eyebrow: string; title: string; text?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-bold sm:text-4xl">{title}</h2>
      {text && <p className="mt-3 text-zinc-400">{text}</p>}
    </div>
  )
}

export default function MarketPage() {
  const [tourOpen, setTourOpen] = useState(false)

  return (
    <main className="relative min-h-screen">
      {/* Duyuru şeridi — watermelon announcement 1 bloğu */}
      <AnnouncementBar
        badgeText="YENİ"
        message="Raporlar sekmesi yayında: aylık hacim, risk trendi ve on iki Excel raporu."
        linkLabel="Raporları gör"
        linkUrl="#ozellikler"
      />

      {/* Üst menü — watermelon navigation 7 bloğu */}
      <div className="absolute inset-x-0 top-8 z-50">
        <Navigation panelUrl={PANEL_URL} />
      </div>

      {/* Kahraman — watermelon hero 35 bloğu */}
      <Hero
        navLinks={[]}
        navCtaLabel="Demo iste"
        navCtaHref="#iletisim"
        titleWords={['Depoyu', 'hareket', 'defteriyle', 'yönetin']}
        stats={HERO_STATS}
        description="Giriş, çıkış, transfer ve sayım tek deftere yazılır. Stok onayda işlenir, kalite kontrolü beklerken karantinada durur. Risk, son kullanma tarihi ve satın alma önerileri aynı ekranda."
        ctaLabel="Panele giriş"
        ctaHref={PANEL_URL}
      />

      {/* Modüller ve panelden ölçüler */}
      <section className="border-t border-zinc-900 px-4 py-16">
        <div className="flex justify-center">
          <TooltipNavbar items={MODULE_ITEMS} />
        </div>
        <div className="mx-auto mt-14 max-w-5xl">
          <WigglingCards cards={METRIC_CARDS} />
        </div>
        <div className="mt-10 flex justify-center">
          <button
            onClick={() => setTourOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-3 font-medium text-zinc-200 transition-colors hover:bg-zinc-800"
          >
            <PlayCircle className="h-4 w-4" /> Ürün turu
          </button>
        </div>
      </section>

      {/* Özellikler */}
      <section id="ozellikler" className="border-t border-zinc-900 px-4 py-20">
        <SectionTitle
          eyebrow="Özellikler"
          title="Depo ekibinin günlük işi"
          text="Her bölüm panelde ayrı bir sekme. Hepsi aynı hareket defterini okur, aynı sayıyı gösterir."
        />
        <div className="mx-auto mt-12 grid max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(f => {
            const Icon = f.icon
            return (
              <article
                key={f.title}
                className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 transition-colors hover:border-zinc-700"
              >
                <Icon className="h-5 w-5 text-blue-400" />
                <h3 className="mt-4 font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">{f.text}</p>
              </article>
            )
          })}
        </div>
      </section>

      {/* Rakamlar — watermelon stats 2 bloğu */}
      <section className="border-t border-zinc-900">
        <Stats />
      </section>

      {/* Depo bileşenleri — watermelon bento 02 bloğu */}
      <section className="border-t border-zinc-900">
        <Bento />
      </section>

      {/* Panel ekranları — watermelon features 4 bloğu */}
      <section className="border-t border-zinc-900">
        <FeaturesSection />
      </section>

      {/* Yetenekler — watermelon integrations 1 bloğu */}
      <section className="border-t border-zinc-900">
        <Integrations />
      </section>

      {/* Bildirimler — watermelon notification 3 bloğu */}
      <section className="border-t border-zinc-900 px-4 py-20">
        <SectionTitle
          eyebrow="Bildirimler"
          title="Önemli olanı size getirir"
          text="Kalite kontrol bekleyen kayıt, kritik stok, transfer önerisi ve gece taramasının bulguları tek listede."
        />
        <div className="mt-12">
          <Notifications />
        </div>
      </section>

      {/* Nasıl çalışır */}
      <section id="nasil" className="border-t border-zinc-900 px-4 py-20">
        <SectionTitle eyebrow="Nasıl çalışır" title="Dört adım" text="Kayıttan rapora kadar akış aynı." />
        <ol className="mx-auto mt-12 grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TOUR_STEPS.map((s, i) => (
            <li key={s.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600/15 text-sm font-bold text-blue-400">
                {i + 1}
              </span>
              <h3 className="mt-4 font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{s.description}</p>
            </li>
          ))}
        </ol>
        <div className="mt-8 text-center">
          <button
            onClick={() => setTourOpen(true)}
            className="inline-flex items-center gap-2 text-sm font-medium text-blue-400 hover:text-blue-300"
          >
            Adımları sırayla gör <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      {/* Yorumlar — watermelon testimonials 3 bloğu (içerik yer tutucu) */}
      <section className="border-t border-zinc-900">
        <Testimonials />
      </section>

      {/* Fiyatlandırma — watermelon pricing 3 bloğu */}
      <section id="fiyatlandirma" className="border-t border-zinc-900">
        <Pricing
          badgeText="Fiyatlandırma"
          title="Depo sayısına göre, sürprizsiz"
          subtitle="Aylık abonelik, KDV hariç. Kurulum, veri aktarımı ve eğitim ücrete dahildir."
          plans={PRICING_PLANS}
          enterprisePlan={ENTERPRISE_PLAN}
          footerText="Fiyatlar örnektir; kendi paket yapınıza göre güncellenecektir."
        />
      </section>

      {/* SSS — watermelon faq 2 bloğu */}
      <section id="sss" className="border-t border-zinc-900">
        <FAQSection
          badge="Yardım lazım mı?"
          title="Sık sorulan sorular"
          subtitle="Kurulum, veri güvenliği ve stok mantığı hakkında en çok sorulanlar."
          categories={FAQ_CATEGORIES}
        />
      </section>

      {/* İletişim — watermelon contact 1 bloğu */}
      <section id="iletisim" className="border-t border-zinc-900">
        <ContactBlock
          badgeText="Bize ulaşın"
          title="Size nasıl yardımcı olalım?"
          description="Kurulum, veri aktarımı ve eğitim dahil. Hangi konuda destek istediğinizi seçin, aynı gün dönüş yapalım."
          contactMethods={CONTACT_METHODS}
        />
      </section>

      {/* Kapanış — watermelon CTA bloğu */}
      <section className="border-t border-zinc-900">
        <PerformanceOverview
          title="Depo performansınız"
          accentWord="cebinizde"
          subtitle="Kritik stok, bekleyen kalite kontrol ve günün hareketleri telefondan da görünür. Kurulum bizde; ürünleri Excel ile yükleyin, ilk kaydı aynı gün açın."
          ctaLabel="Panele giriş"
          ctaHref={PANEL_URL}
          periods={KPI_PERIODS}
        />
      </section>

      {/* Kaynaklar — watermelon blog 4 bloğu */}
      <section id="kaynaklar" className="border-t border-zinc-900">
        <BlogSection data={BLOG_DATA} />
      </section>

      <Footer columns={FOOTER_COLUMNS} legalLinks={FOOTER_LEGAL} />

      {tourOpen && <FeatureTour steps={TOUR_STEPS} onClose={() => setTourOpen(false)} loop />}
    </main>
  )
}
