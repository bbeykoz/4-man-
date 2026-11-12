'use client'

/**
 * Kiracı şirketlerin işlem hacmi: günlük, haftalık, aylık.
 *
 * Kaynak aktivite kaydı — bir şirkette yapılan her işlem bir satır. Seçilen
 * dönem bir öncekiyle kıyaslanır, böylece hacim düşen şirket göze çarpar.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Building2, TrendingDown, TrendingUp } from 'lucide-react'
import { BrandLoaderBlock } from '@/components/common/BrandLoader'
import { get } from '@/lib/api'
import { cn, timeAgo } from '@/lib/utils'

type Kova = 'day' | 'week' | 'month'

interface Yanit {
  period: { from: string; to: string; days: number; bucket: Kova }
  series: { date: string; total: number; companies: Record<string, number> }[]
  companies: {
    id: string
    name: string
    status: string
    actions: number
    active_users: number
    last_action_at: string | null
    previous: number
    change_pct: number | null
  }[]
  modules: { module: string; count: number }[]
  totals: { actions: number; previous: number; companies: number }
}

/** Tek seri: kategorik ayrım gerekmiyor, açık ve koyu temada okunan tek mavi. */
const RENK = '#2563eb'

const KOVALAR: { v: Kova; l: string; gun: number }[] = [
  { v: 'day', l: 'Günlük', gun: 30 },
  { v: 'week', l: 'Haftalık', gun: 84 },
  { v: 'month', l: 'Aylık', gun: 365 },
]

function etiketle(tarih: string, kova: Kova): string {
  const d = new Date(tarih)
  if (kova === 'month') return d.toLocaleDateString('tr-TR', { month: 'short', year: '2-digit' })
  if (kova === 'week') return `${d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })} haftası`
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })
}

export function CompanyVolumePanel() {
  const [kova, setKova] = useState<Kova>('day')
  const gun = KOVALAR.find(k => k.v === kova)!.gun

  const { data, isLoading } = useQuery({
    queryKey: ['platform-company-analytics', kova, gun],
    queryFn: () => get<{ data: Yanit }>('/admin/analytics/companies', { params: { bucket: kova, days: gun } })
      .then(r => r.data),
  })

  const seri = (data?.series ?? []).map(s => ({ ...s, etiket: etiketle(s.date, kova) }))
  const toplam = data?.totals.actions ?? 0
  const onceki = data?.totals.previous ?? 0
  const degisim = onceki > 0 ? Math.round(((toplam - onceki) / onceki) * 1000) / 10 : null
  const enYuksek = Math.max(1, ...(data?.companies ?? []).map(c => c.actions))

  return (
    <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-5 py-3.5 dark:border-zinc-800">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            <Building2 className="h-4 w-4" /> Şirketlerin işlem hacmi
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            {data ? `${data.period.from} – ${data.period.to}` : 'Seçilen dönemdeki tüm şirket hareketleri'}
          </p>
        </div>
        <div className="flex gap-1">
          {KOVALAR.map(k => (
            <button
              key={k.v}
              onClick={() => setKova(k.v)}
              className={cn(
                'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
                kova === k.v ? 'bg-blue-600 text-white' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800',
              )}
            >
              {k.l}
            </button>
          ))}
        </div>
      </header>

      {isLoading ? (
        <div className="p-8"><BrandLoaderBlock size={64} text={null} /></div>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 px-5 pt-4">
            <span>
              <span className="text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                {toplam.toLocaleString('tr-TR')}
              </span>
              <span className="ml-1.5 text-xs text-zinc-500">işlem</span>
            </span>
            {degisim !== null && (
              <span className={cn(
                'flex items-center gap-1 text-xs font-medium',
                degisim >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
              )}>
                {degisim >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                {degisim > 0 ? '+' : ''}{degisim}% · önceki döneme göre
              </span>
            )}
            <span className="text-xs text-zinc-500">{data?.totals.companies ?? 0} şirket hareket etti</span>
          </div>

          <div className="h-56 px-2 pt-3">
            {seri.length === 0 ? (
              <p className="py-16 text-center text-sm text-zinc-500">Bu dönemde hareket yok.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={seri} margin={{ top: 4, right: 12, bottom: 4, left: 0 }}>
                  <CartesianGrid vertical={false} stroke="currentColor" className="text-zinc-200 dark:text-zinc-800" />
                  <XAxis dataKey="etiket" tick={{ fontSize: 11 }} tickLine={false} axisLine={false}
                    stroke="currentColor" className="text-zinc-500" interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false}
                    stroke="currentColor" className="text-zinc-500" width={44} />
                  <Tooltip
                    cursor={{ fill: 'currentColor', className: 'text-zinc-100 dark:text-zinc-800' }}
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null
                      const satir = payload[0].payload as (typeof seri)[number]
                      const sirketler = Object.entries(satir.companies).sort((a, b) => b[1] - a[1]).slice(0, 5)
                      return (
                        <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow-md dark:border-zinc-700 dark:bg-zinc-900">
                          <p className="font-semibold text-zinc-900 dark:text-zinc-100">{label}</p>
                          <p className="text-zinc-600 dark:text-zinc-300">
                            Toplam <strong className="tabular-nums">{satir.total.toLocaleString('tr-TR')}</strong>
                          </p>
                          {sirketler.map(([ad, adet]) => (
                            <p key={ad} className="text-zinc-500">{ad}: <strong className="tabular-nums">{adet}</strong></p>
                          ))}
                        </div>
                      )
                    }}
                  />
                  {/* 4px yuvarlak uç, tabana oturur */}
                  <Bar dataKey="total" fill={RENK} radius={[4, 4, 0, 0]} maxBarSize={38} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="overflow-x-auto border-t border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900/60">
                <tr>
                  <th className="px-5 py-2.5 text-left font-semibold">Şirket</th>
                  <th className="px-3 py-2.5 text-right font-semibold">İşlem</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Önceki dönem</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Değişim</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Aktif kullanıcı</th>
                  <th className="px-5 py-2.5 text-left font-semibold">Son hareket</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {(data?.companies ?? []).map(c => (
                  <tr key={c.id}>
                    <td className="px-5 py-3">
                      <div className="font-medium text-zinc-900 dark:text-zinc-100">{c.name}</div>
                      <div className="mt-1.5 h-1 w-32 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                        <div className="h-full rounded-full bg-blue-600" style={{ width: `${(c.actions / enYuksek) * 100}%` }} />
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                      {c.actions.toLocaleString('tr-TR')}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-zinc-500">{c.previous.toLocaleString('tr-TR')}</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {c.change_pct === null ? (
                        <span className="text-zinc-400">{c.actions > 0 ? 'yeni' : '—'}</span>
                      ) : (
                        <span className={c.change_pct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                          {c.change_pct > 0 ? '+' : ''}{c.change_pct}%
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-zinc-600 dark:text-zinc-400">{c.active_users}</td>
                    <td className="px-5 py-3 text-xs text-zinc-500">
                      {c.last_action_at ? timeAgo(c.last_action_at) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(data?.modules.length ?? 0) > 0 && (
            <div className="border-t border-zinc-200 px-5 py-3 dark:border-zinc-800">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Hangi alanlarda çalışıyorlar</h3>
              <ul className="flex flex-wrap gap-2">
                {data!.modules.map(m => (
                  <li key={m.module} className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    {m.module} <strong className="tabular-nums">{m.count.toLocaleString('tr-TR')}</strong>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  )
}
