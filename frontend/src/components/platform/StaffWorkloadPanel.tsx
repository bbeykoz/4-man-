'use client'

/**
 * Platform ekibinin iş hacmi ve çalışma süresi.
 *
 * Süre ayrı tutulmuyor; işlem zamanlarından çıkarılıyor (30 dakikadan uzun
 * boşluk yeni oturum sayılır), yani giriş-çıkış mesaisi değil ekranda geçen
 * etkin süre. Bir ekip üyesi şirkete bağlanıp iş yaptıysa o işler de burada
 * sayılır.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Clock, ListChecks, Timer, UserCog, X } from 'lucide-react'
import { BrandLoaderBlock } from '@/components/common/BrandLoader'
import { get } from '@/lib/api'
import { cn, formatDateTime, timeAgo } from '@/lib/utils'

interface Staff {
  id: string
  name: string
  email: string
  title: string | null
  actions: number
  active_days: number
  minutes: number
  hours: number
  avg_day_minutes: number
  sessions: number
  companies: number
  last_action_at: string | null
  last_login_at: string | null
  top_actions: { action: string; count: number }[]
  daily: { date: string; count: number }[]
  tickets: { assigned: number; resolved: number }
}

interface StaffYanit {
  period: { from: string; to: string; days: number }
  staff: Staff[]
  totals: { people: number; actions: number; minutes: number; hours: number; tickets_done: number }
}

const ARALIKLAR = [
  { gun: 7, etiket: 'Son 7 gün' },
  { gun: 30, etiket: 'Son 30 gün' },
  { gun: 90, etiket: 'Son 90 gün' },
]

export function sureMetni(dakika: number): string {
  if (dakika <= 0) return '—'
  const saat = Math.floor(dakika / 60)
  const kalan = dakika % 60
  if (saat === 0) return `${kalan} dk`
  return kalan === 0 ? `${saat} sa` : `${saat} sa ${kalan} dk`
}

export function StaffWorkloadPanel() {
  const [gun, setGun] = useState(30)
  const [secili, setSecili] = useState<Staff | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['platform-staff-analytics', gun],
    queryFn: () => get<{ data: StaffYanit }>('/admin/analytics/staff', { params: { days: gun } }).then(r => r.data),
  })

  const ekip = data?.staff ?? []
  const enYuksek = Math.max(1, ...ekip.map(s => s.actions))

  return (
    <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-5 py-3.5 dark:border-zinc-800">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            <UserCog className="h-4 w-4" /> Ekibimizin iş hacmi
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            İşlem sayısı, çalışma süresi ve yapılan işin dökümü
          </p>
        </div>
        <div className="flex gap-1">
          {ARALIKLAR.map(a => (
            <button
              key={a.gun}
              onClick={() => setGun(a.gun)}
              className={cn(
                'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
                gun === a.gun
                  ? 'bg-blue-600 text-white'
                  : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800',
              )}
            >
              {a.etiket}
            </button>
          ))}
        </div>
      </header>

      {isLoading ? (
        <div className="p-8"><BrandLoaderBlock size={64} text={null} /></div>
      ) : (
        <>
          <div className="grid gap-3 border-b border-zinc-200 px-5 py-4 sm:grid-cols-4 dark:border-zinc-800">
            <Ozet etiket="Ekip" deger={String(data?.totals.people ?? 0)} ikon={<UserCog className="h-3.5 w-3.5" />} />
            <Ozet etiket="Toplam işlem" deger={(data?.totals.actions ?? 0).toLocaleString('tr-TR')} ikon={<ListChecks className="h-3.5 w-3.5" />} />
            <Ozet etiket="Toplam süre" deger={sureMetni(data?.totals.minutes ?? 0)} ikon={<Clock className="h-3.5 w-3.5" />} />
            <Ozet etiket="Çözülen talep" deger={String(data?.totals.tickets_done ?? 0)} ikon={<Timer className="h-3.5 w-3.5" />} />
          </div>

          {ekip.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-zinc-500">Bu dönemde ekip hareketi yok.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900/60">
                  <tr>
                    <th className="px-5 py-2.5 text-left font-semibold">Kişi</th>
                    <th className="px-3 py-2.5 text-right font-semibold">İşlem</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Aktif gün</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Süre</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Gün ort.</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Oturum</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Talep</th>
                    <th className="px-5 py-2.5 text-left font-semibold">Son işlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {ekip.map(k => (
                    <tr
                      key={k.id}
                      onClick={() => setSecili(k)}
                      className="cursor-pointer transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                    >
                      <td className="px-5 py-3">
                        <div className="font-medium text-zinc-900 dark:text-zinc-100">{k.name}</div>
                        <div className="text-xs text-zinc-400">{k.title ?? k.email}</div>
                        {/* Oran çubuğu: en yoğun kişiye göre */}
                        <div className="mt-1.5 h-1 w-32 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                          <div className="h-full rounded-full bg-blue-600" style={{ width: `${(k.actions / enYuksek) * 100}%` }} />
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                        {k.actions.toLocaleString('tr-TR')}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-zinc-600 dark:text-zinc-400">{k.active_days}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-zinc-600 dark:text-zinc-400">{sureMetni(k.minutes)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-zinc-600 dark:text-zinc-400">{sureMetni(k.avg_day_minutes)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-zinc-600 dark:text-zinc-400">{k.sessions}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-zinc-600 dark:text-zinc-400">
                        {k.tickets.resolved}/{k.tickets.assigned}
                      </td>
                      <td className="px-5 py-3 text-xs text-zinc-500">
                        {k.last_action_at ? timeAgo(k.last_action_at) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="border-t border-zinc-100 px-5 py-2.5 text-[11px] text-zinc-400 dark:border-zinc-800">
            Süre, işlem zamanlarından hesaplanır: 30 dakikadan uzun boşluk yeni oturum sayılır.
            Giriş-çıkış mesaisi değil, ekranda geçen etkin süredir. Satıra tıklayınca yapılan işlerin dökümü açılır.
          </p>
        </>
      )}

      {secili && <KisiDetay kisi={secili} gun={gun} onClose={() => setSecili(null)} />}
    </section>
  )
}

function Ozet({ etiket, deger, ikon }: { etiket: string; deger: string; ikon: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800">
      <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">{ikon} {etiket}</div>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{deger}</p>
    </div>
  )
}

interface Islem {
  id: string
  action: string
  description: string | null
  model_type: string | null
  company: string | null
  via_company: boolean
  ip_address: string | null
  created_at: string | null
}

function KisiDetay({ kisi, gun, onClose }: { kisi: Staff; gun: number; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['platform-staff-detail', kisi.id, gun],
    queryFn: () => get<{ data: { actions: Islem[] } }>(`/admin/analytics/staff/${kisi.id}`, { params: { days: gun } })
      .then(r => r.data),
  })

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm">
      <div className="my-8 w-full max-w-3xl rounded-2xl bg-white shadow-xl dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <div>
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{kisi.name}</h3>
            <p className="mt-0.5 text-xs text-zinc-500">
              Son {gun} gün · {kisi.actions.toLocaleString('tr-TR')} işlem · {sureMetni(kisi.minutes)} ·{' '}
              {kisi.companies} şirkette çalıştı
            </p>
          </div>
          <button onClick={onClose} aria-label="Kapat"
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {kisi.top_actions.length > 0 && (
            <div>
              <h4 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">En çok yaptığı işler</h4>
              <ul className="flex flex-wrap gap-2">
                {kisi.top_actions.map(t => (
                  <li key={t.action} className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    {t.action} <strong className="tabular-nums">{t.count}</strong>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h4 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">İşlem dökümü</h4>
            {isLoading ? (
              <BrandLoaderBlock size={56} text={null} />
            ) : (data?.actions.length ?? 0) === 0 ? (
              <p className="py-6 text-center text-sm text-zinc-500">Bu dönemde işlem yok.</p>
            ) : (
              <ul className="max-h-96 divide-y divide-zinc-100 overflow-y-auto rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                {data!.actions.map(i => (
                  <li key={i.id} className="flex items-start justify-between gap-3 px-3 py-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-zinc-800 dark:text-zinc-200">
                        {i.description ?? i.action}
                      </span>
                      <span className="flex flex-wrap items-center gap-x-2 text-[11px] text-zinc-400">
                        <span className="font-mono">{i.action}</span>
                        {i.company && <span>{i.company}</span>}
                        {i.via_company && (
                          <span className="rounded bg-amber-100 px-1.5 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                            şirkete bağlı
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px] text-zinc-400">
                      {i.created_at ? formatDateTime(i.created_at) : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
