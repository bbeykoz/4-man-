'use client'

// Ana sayfaya eklenen depo bölümleri özeti.
// Her kart bir depo sekmesini özetler ve o sekmeye bağlanır. Veriler tek
// istekten gelir (/modules/stock/summary), sekme başına ayrı çağrı yapılmaz.
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle, ArrowUpRight, Bookmark, Boxes, CalendarClock, ClipboardCheck,
  Loader2, Activity, ShieldAlert, ShoppingCart, Shuffle, Siren, SlidersHorizontal,
} from 'lucide-react'
import { get } from '@/lib/api'
import { cn, formatDateTime } from '@/lib/utils'
import { DashboardCard } from '@/components/dashboard/shared'

interface Trend {
  trend: { date: string; value: number }[]
  trend_label: string
  trend_forward?: boolean
}

interface Ozet {
  period: { days: number; from: string; to: string }
  control: { records: number; pending: number; qc_waiting: number; last_at: string | null; by_type: Record<string, number> } & Trend
  daily_check: { total: number; done: number; remaining: number; percent: number | null; products: { total: number; done: number }; tasks: { total: number; done: number } } & Trend
  stock: { products: number; available: number; reserved: number; quarantine: number; damaged: number; value: number; below_min: number; out_of_stock: number } & Trend
  booked: { open: number; reserved: number; shortage: number; delivered: number } & Trend
  risk: { snapshot_date: string | null; critical: number; high: number; levels: Record<string, number>; top: { name: string; score: number; level: string }[] } & Trend
  purchasing: { draft: number; open: number; open_amount: number; overdue: number; received_30d: number } & Trend
  expiry: { expired_lots: number; expired_qty: number; critical_lots: number; critical_qty: number; critical_days: number; dead_products: number; dead_value: number } & Trend
  transfers: { records: number; pending: number; qty: number; last_at: string | null } & Trend
  anomalies: { open: number; severe: number; by_type: Record<string, number>; top: { type: string; severity: number; message: string }[] } & Trend
  workstation: { records: number; people: number; top: { name: string; records: number }[] } & Trend
}

const sayi = (v: number, basamak = 0) =>
  v.toLocaleString('tr-TR', { maximumFractionDigits: basamak })

const para = (v: number) =>
  v >= 1_000_000 ? `₺${sayi(v / 1_000_000, 1)}M` : v >= 1_000 ? `₺${sayi(v / 1_000, 1)}K` : `₺${sayi(v)}`

/**
 * Kart altındaki çizgi grafiği.
 *
 * Tek seri, eksen ve ızgara yok: amaç kesin değer okumak değil, gidişatı görmek.
 * Değerler eşitse düz çizgi çizilir. Üstüne gelince gün ve değer görünür.
 */
function Sparkline({
  veri, renk = 'var(--chart-1)', etiket, ileriye = false,
}: {
  veri: { date: string; value: number }[]
  renk?: string
  etiket: string
  ileriye?: boolean
}) {
  if (veri.length < 2) return null

  const G = 100
  const Y = 28
  const degerler = veri.map(v => v.value)
  const enAz = Math.min(...degerler)
  const enCok = Math.max(...degerler)
  const fark = enCok - enAz
  const bos = enCok === 0 && enAz === 0
  // Tüm değerler eşitse (ör. stok hiç değişmemiş) çizgi ortadan geçer;
  // en alta çizilirse sıfırmış gibi okunurdu.
  const duz = fark === 0

  const nokta = (v: number, i: number) => {
    const x = (i / (veri.length - 1)) * G
    // Üst ve altta 2 birim pay: çizgi kenara yapışmasın
    const y = duz ? Y / 2 : Y - 2 - ((v - enAz) / fark) * (Y - 4)
    return [x, y] as const
  }

  const noktalar = degerler.map(nokta)
  const cizgi = noktalar.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
  const alan = `0,${Y} ${cizgi} ${G},${Y}`
  const [sonX, sonY] = noktalar[noktalar.length - 1]

  const ilkTarih = veri[0].date.slice(5).replace('-', '.')
  const sonTarih = veri[veri.length - 1].date.slice(5).replace('-', '.')

  return (
    <div className="mt-1">
      <svg
        viewBox={`0 0 ${G} ${Y}`}
        preserveAspectRatio="none"
        className="h-8 w-full"
        role="img"
        aria-label={`${etiket}: ${ilkTarih} – ${sonTarih}`}
      >
        <title>{`${etiket} · ${ilkTarih} – ${sonTarih} · en yüksek ${enCok.toLocaleString('tr-TR')}`}</title>
        {!bos && <polygon points={alan} fill={renk} opacity={0.12} />}
        <polyline
          points={cizgi}
          fill="none"
          stroke={bos ? 'var(--border)' : renk}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {!bos && <circle cx={sonX} cy={sonY} r={1.8} fill={renk} vectorEffect="non-scaling-stroke" />}
      </svg>
      <div className="flex items-center justify-between text-[10px] leading-none text-muted-foreground">
        <span>{ilkTarih}</span>
        <span className="truncate px-1">{etiket}{ileriye && ' →'}</span>
        <span>{sonTarih}</span>
      </div>
    </div>
  )
}

/** Tek bir bölümün kartı: ana sayı, alt satırlar ve sekmeye bağlantı. */
function BolumKarti({
  baslik, href, Icon, deger, birim, satirlar, uyari, trend, renk,
}: {
  baslik: string
  href: string
  Icon: React.ElementType
  deger: string
  birim?: string
  satirlar: { etiket: string; deger: string; tehlike?: boolean }[]
  uyari?: string | null
  trend?: Trend
  renk?: string
}) {
  return (
    <DashboardCard className="flex min-h-40 flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <Link href={href} className="group flex min-w-0 items-center gap-1.5">
          <h3 className="truncate text-sm font-medium leading-5">{baslik}</h3>
          <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </Link>
        <div className="dashboard-icon-badge flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-lg p-1.5 text-white">
          <Icon className="size-4 shrink-0" />
        </div>
      </div>

      <div className="flex items-end gap-1.5">
        <span className="text-2xl font-bold leading-none tracking-normal">{deger}</span>
        {birim && <span className="pb-0.5 text-xs text-muted-foreground">{birim}</span>}
      </div>

      <div className="mt-auto space-y-1">
        {satirlar.map(s => (
          <div key={s.etiket} className="flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate text-muted-foreground">{s.etiket}</span>
            <span className={cn('shrink-0 font-medium', s.tehlike && 'text-[var(--destructive)]')}>{s.deger}</span>
          </div>
        ))}
      </div>

      {trend && (
        <Sparkline veri={trend.trend} etiket={trend.trend_label} ileriye={trend.trend_forward} renk={renk} />
      )}

      {uyari && (
        <p className="flex items-start gap-1.5 rounded-lg border border-border p-2 text-[11px] leading-snug text-muted-foreground">
          <AlertTriangle className="mt-px size-3 shrink-0" style={{ color: 'var(--destructive)' }} />
          {uyari}
        </p>
      )}
    </DashboardCard>
  )
}

const W = '/modules/warehouse'

export function WarehouseSections({ days = 7 }: { days?: number }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboard', 'warehouse-summary', days],
    queryFn: () => get<{ data: Ozet }>(`/modules/stock/summary?days=${days}`).then(r => r.data),
  })

  if (isLoading) {
    return (
      <DashboardCard className="flex items-center justify-center py-10">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </DashboardCard>
    )
  }
  if (isError || !data) return null

  const { control: k, daily_check: g, stock: s, booked: b, risk: r,
          purchasing: sa, expiry: e, transfers: t, anomalies: a, workstation: w } = data

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-normal leading-6">Depo bölümleri</h2>
        <span className="text-xs text-muted-foreground">son {data.period.days} gün</span>
      </div>

      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        <BolumKarti
          baslik="Depo kontrol işleri"
          href={`${W}?tab=stok`}
          Icon={SlidersHorizontal}
          deger={sayi(k.records)}
          birim="kayıt"
          satirlar={[
            { etiket: 'Bekleyen', deger: sayi(k.pending), tehlike: k.pending > 0 },
            { etiket: 'Kalite kontrol bekleyen', deger: sayi(k.qc_waiting), tehlike: k.qc_waiting > 0 },
            { etiket: 'Son işlem', deger: k.last_at ? formatDateTime(k.last_at) : '—' },
          ]}
          trend={k}
          renk="var(--chart-1)"
        />

        <BolumKarti
          baslik="Günlük kontrol"
          href={`${W}?tab=gunluk-kontrol`}
          Icon={ClipboardCheck}
          deger={g.percent === null ? '—' : `%${sayi(g.percent, 1)}`}
          birim="tamamlandı"
          satirlar={[
            { etiket: 'Yapılan', deger: `${sayi(g.done)} / ${sayi(g.total)}` },
            { etiket: 'Ürün kontrolü', deger: `${sayi(g.products.done)} / ${sayi(g.products.total)}` },
            { etiket: 'Görev', deger: `${sayi(g.tasks.done)} / ${sayi(g.tasks.total)}` },
          ]}
          uyari={g.remaining > 0 ? `Bugün ${sayi(g.remaining)} kontrol bekliyor.` : null}
          trend={g}
          renk="var(--chart-4)"
        />

        <BolumKarti
          baslik="Stok durumu"
          href={`${W}?tab=stok-durumu`}
          Icon={Boxes}
          deger={sayi(s.available)}
          birim="kullanılabilir"
          satirlar={[
            { etiket: 'Ürün', deger: sayi(s.products) },
            { etiket: 'Karantina / hasarlı', deger: `${sayi(s.quarantine)} / ${sayi(s.damaged)}`, tehlike: s.quarantine + s.damaged > 0 },
            { etiket: 'Stok değeri', deger: para(s.value) },
          ]}
          uyari={s.out_of_stock > 0 ? `${sayi(s.out_of_stock)} ürünün stoğu bitti, ${sayi(s.below_min)} ürün minimum altında.` : null}
          trend={s}
          renk="var(--chart-1)"
        />

        <BolumKarti
          baslik="Booked"
          href={`${W}?tab=booked`}
          Icon={Bookmark}
          deger={sayi(b.open)}
          birim="açık sipariş"
          satirlar={[
            { etiket: 'Rezervedeki stok', deger: sayi(b.reserved) },
            { etiket: 'Stok yetmeyen', deger: sayi(b.shortage), tehlike: b.shortage > 0 },
            { etiket: 'Teslim edilen', deger: sayi(b.delivered) },
          ]}
          trend={b}
          renk="var(--chart-2)"
        />

        <BolumKarti
          baslik="Stok riski"
          href={`${W}?tab=stok-riski`}
          Icon={ShieldAlert}
          deger={sayi(r.critical)}
          birim="kritik ürün"
          satirlar={[
            { etiket: 'Yüksek riskli', deger: sayi(r.high), tehlike: r.high > 0 },
            ...(r.top[0] ? [{ etiket: r.top[0].name, deger: `%${r.top[0].score}`, tehlike: true }] : []),
            { etiket: 'Son ölçüm', deger: r.snapshot_date ?? 'henüz yok' },
          ]}
          trend={r}
          renk="var(--chart-5)"
        />

        <BolumKarti
          baslik="Satın alma"
          href={`${W}?tab=satin-alma`}
          Icon={ShoppingCart}
          deger={sayi(sa.open)}
          birim="açık sipariş"
          satirlar={[
            { etiket: 'Taslak', deger: sayi(sa.draft) },
            { etiket: 'Açık sipariş tutarı', deger: para(sa.open_amount) },
            { etiket: 'Son 30 günde teslim', deger: sayi(sa.received_30d) },
          ]}
          uyari={sa.overdue > 0 ? `${sayi(sa.overdue)} sipariş beklenen tarihi geçti.` : null}
          trend={sa}
          renk="var(--chart-3)"
        />

        <BolumKarti
          baslik="SKT & ölü stok"
          href={`${W}?tab=skt-olu-stok`}
          Icon={CalendarClock}
          deger={sayi(e.critical_lots)}
          birim={`lot · ${e.critical_days} gün içinde`}
          satirlar={[
            { etiket: 'SKT geçmiş lot', deger: `${sayi(e.expired_lots)} (${sayi(e.expired_qty)})`, tehlike: e.expired_lots > 0 },
            { etiket: 'Ölü stok ürünü', deger: sayi(e.dead_products) },
            { etiket: 'Ölü stok değeri', deger: para(e.dead_value) },
          ]}
          uyari={e.expired_lots > 0 ? `${sayi(e.expired_qty)} birim SKT'si geçmiş stok duruyor.` : null}
          trend={e}
          renk="var(--chart-5)"
        />

        <BolumKarti
          baslik="Depo transferleri"
          href={`${W}?tab=depo-transfer`}
          Icon={Shuffle}
          deger={sayi(t.records)}
          birim="transfer"
          satirlar={[
            { etiket: 'Bekleyen', deger: sayi(t.pending), tehlike: t.pending > 0 },
            { etiket: 'Taşınan miktar', deger: sayi(t.qty) },
            { etiket: 'Son transfer', deger: t.last_at ? formatDateTime(t.last_at) : '—' },
          ]}
          trend={t}
          renk="var(--chart-2)"
        />

        <BolumKarti
          baslik="Anomaliler"
          href={`${W}?tab=anomaliler`}
          Icon={Siren}
          deger={sayi(a.open)}
          birim="açık"
          satirlar={[
            { etiket: 'Önemli', deger: sayi(a.severe), tehlike: a.severe > 0 },
            { etiket: 'Tür', deger: sayi(Object.keys(a.by_type).length) },
            ...(a.top[0] ? [{ etiket: 'En yüksek', deger: `%${a.top[0].severity}`, tehlike: true }] : []),
          ]}
          uyari={a.top[0]?.message ? a.top[0].message.slice(0, 90) : null}
          trend={a}
          renk="var(--chart-5)"
        />

        <BolumKarti
          baslik="Workstation"
          href={`${W}?tab=workstation`}
          Icon={Activity}
          deger={sayi(w.records)}
          birim="işlem"
          satirlar={
            w.top.length > 0
              ? w.top.map(p => ({ etiket: p.name, deger: `${sayi(p.records)} işlem` }))
              : [{ etiket: 'Bu aralıkta işlem yok', deger: '—' }]
          }
          trend={w}
          renk="var(--chart-3)"
        />
      </div>
    </div>
  )
}
