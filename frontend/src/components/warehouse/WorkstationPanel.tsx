'use client'

// Workstation raporu: hangi bölüm / personel / depo ne kadar çalışmış.
// Dört ölçü: işlem adedi, taşınan miktar, ortalama işlem süresi, saatlik yoğunluk.
// Her ölçü bir önceki eşit uzunluktaki dönemle karşılaştırılır.
import { useState } from 'react'
import { BrandLoaderBlock } from '@/components/common/BrandLoader'
import { useQuery } from '@tanstack/react-query'
import {
  Activity, Boxes, Building2, Clock, Timer, TrendingDown, TrendingUp, Users,
} from 'lucide-react'
import { get } from '@/lib/api'
import { cn, formatDateTime, todayInput } from '@/lib/utils'
import { formatQty } from './stock'

type Kirilim = 'module' | 'user' | 'warehouse'

interface Satir {
  key: string
  label: string
  records: number
  records_prev: number
  quantity: number | null
  quantity_prev: number | null
  avg_minutes: number | null
  avg_minutes_prev: number | null
  last_activity: string | null
  supports_quantity: boolean
  supports_duration: boolean
}

interface Rapor {
  group_by: Kirilim
  period: { from: string; to: string; days: number; previous_from: string; previous_to: string }
  rows: Satir[]
  totals: { records: number; records_prev: number; quantity: number; groups: number; avg_minutes: number | null }
  hourly: { hour: number; records: number }[]
  notes: string[]
}

const KIRILIMLAR: { id: Kirilim; label: string; Icon: typeof Users }[] = [
  { id: 'module',    label: 'Bölüm',    Icon: Building2 },
  { id: 'user',      label: 'Personel', Icon: Users },
  { id: 'warehouse', label: 'Depo',     Icon: Boxes },
]

const ARALIKLAR = [
  { gun: 1,  label: 'Bugün' },
  { gun: 7,  label: 'Son 7 gün' },
  { gun: 30, label: 'Son 30 gün' },
  { gun: 90, label: 'Son 90 gün' },
]

const inputCls = 'rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900'

/** Önceki döneme göre değişim; önceki yoksa null (yeni başlamış demektir). */
function degisim(simdi: number | null, onceki: number | null): number | null {
  if (simdi == null || onceki == null || onceki === 0) return null
  return ((simdi - onceki) / onceki) * 100
}

function Fark({ pct, tersi = false }: { pct: number | null; tersi?: boolean }) {
  if (pct === null || Math.abs(pct) < 0.5) return null
  const artis = pct > 0
  // Sürede artış kötüdür; adet ve miktarda iyidir
  const iyi = tersi ? !artis : artis
  const Icon = artis ? TrendingUp : TrendingDown

  return (
    <span className={cn(
      'ml-1 inline-flex items-center gap-0.5 text-[11px] font-medium',
      iyi ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
    )}>
      <Icon className="h-3 w-3" />%{formatQty(Math.abs(pct))}
    </span>
  )
}

/** Saatlik yoğunluk: 24 saatlik sütun grafiği. */
function SaatlikGrafik({ veri }: { veri: { hour: number; records: number }[] }) {
  const enYuksek = Math.max(1, ...veri.map(v => v.records))
  const toplam = veri.reduce((t, v) => t + v.records, 0)
  const zirve = veri.reduce((a, b) => (b.records > a.records ? b : a), veri[0])

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex items-baseline justify-between">
        <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Saatlik yoğunluk</p>
        {toplam > 0 && (
          <p className="text-xs text-zinc-500">
            En yoğun saat: <strong>{String(zirve.hour).padStart(2, '0')}:00</strong> ({zirve.records} işlem)
          </p>
        )}
      </div>

      {toplam === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500">Bu aralıkta işlem yok.</p>
      ) : (
        <>
          <div className="flex h-28 items-end gap-[3px]">
            {veri.map(v => (
              <div key={v.hour} className="group relative flex-1" title={`${String(v.hour).padStart(2, '0')}:00 — ${v.records} işlem`}>
                <div
                  className="w-full rounded-t bg-[#2a78d6] transition-colors hover:bg-[#1b5cab] dark:bg-[#3987e5]"
                  style={{ height: `${Math.max(2, (v.records / enYuksek) * 100)}%` }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex justify-between text-[10px] text-zinc-400">
            {[0, 6, 12, 18, 23].map(h => <span key={h}>{String(h).padStart(2, '0')}:00</span>)}
          </div>
        </>
      )}
    </div>
  )
}

export function WorkstationPanel() {
  const [kirilim, setKirilim] = useState<Kirilim>('module')
  const [gun, setGun] = useState(7)
  const [ozelAralik, setOzelAralik] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState(todayInput())

  const params = new URLSearchParams({ group_by: kirilim })
  if (ozelAralik && from) {
    params.set('from', from)
    params.set('to', to || todayInput())
  } else {
    params.set('days', String(gun))
  }

  const { data, isLoading, isError } = useQuery({
    queryKey: ['workstation', kirilim, gun, ozelAralik, from, to],
    queryFn: () => get<{ data: Rapor }>(`/modules/stock/workstation?${params}`).then(r => r.data),
  })

  if (isLoading) {
    return <BrandLoaderBlock size={64} />
  }
  if (isError || !data) {
    return <p className="py-12 text-center text-sm text-zinc-500">Rapor yüklenemedi.</p>
  }

  const { rows, totals, period } = data
  const enCok = Math.max(1, ...rows.map(r => r.records))

  const kartlar = [
    { label: 'Toplam işlem', deger: formatQty(totals.records), fark: degisim(totals.records, totals.records_prev), Icon: Activity },
    { label: 'Taşınan miktar', deger: formatQty(totals.quantity), fark: null, Icon: Boxes },
    {
      label: 'Ortalama işlem süresi',
      deger: totals.avg_minutes === null ? '—' : `${formatQty(totals.avg_minutes)} dk`,
      fark: null, Icon: Timer,
    },
    { label: 'Çalışan birim', deger: String(rows.filter(r => r.records > 0).length), fark: null, Icon: Building2 },
  ]

  return (
    <div className="space-y-4">
      {/* Kırılım ve dönem */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5">
          {KIRILIMLAR.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setKirilim(id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                kirilim === id
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700',
              )}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>

        <span className="mx-1 h-5 w-px bg-zinc-200 dark:bg-zinc-700" />

        <div className="flex flex-wrap gap-1.5">
          {ARALIKLAR.map(a => (
            <button
              key={a.gun}
              onClick={() => { setGun(a.gun); setOzelAralik(false) }}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                !ozelAralik && gun === a.gun
                  ? 'bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700',
              )}
            >
              {a.label}
            </button>
          ))}
          <button
            onClick={() => setOzelAralik(v => !v)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
              ozelAralik
                ? 'bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700',
            )}
          >
            Tarih seç
          </button>
        </div>

        {ozelAralik && (
          <div className="flex items-center gap-1.5">
            <input type="date" max={todayInput()} value={from} onChange={e => setFrom(e.target.value)} className={inputCls} />
            <span className="text-xs text-zinc-400">—</span>
            <input type="date" max={todayInput()} value={to} onChange={e => setTo(e.target.value)} className={inputCls} />
          </div>
        )}
      </div>

      <p className="text-[11px] text-zinc-400">
        {period.from} – {period.to} ({period.days} gün) · karşılaştırma: {period.previous_from} – {period.previous_to}
      </p>

      {/* Özet kartları */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kartlar.map(({ label, deger, fark, Icon }) => (
          <div key={label} className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4 text-zinc-400" />
              <p className="text-xs text-zinc-500">{label}</p>
            </div>
            <p className="mt-1 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              {deger}<Fark pct={fark} />
            </p>
          </div>
        ))}
      </div>

      <SaatlikGrafik veri={data.hourly} />

      {/* Kırılım tablosu */}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-800/60">
              <tr>
                <th className="px-3 py-2.5 text-left">{KIRILIMLAR.find(k => k.id === kirilim)?.label}</th>
                <th className="px-3 py-2.5 text-left">Pay</th>
                <th className="px-3 py-2.5 text-right">İşlem</th>
                <th className="px-3 py-2.5 text-right">Taşınan miktar</th>
                <th className="px-3 py-2.5 text-right">Ort. süre</th>
                <th className="px-3 py-2.5 text-left">Son işlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 tabular-nums dark:divide-zinc-800">
              {rows.length === 0 ? (
                <tr><td colSpan={6} className="py-10 text-center text-zinc-400">Bu aralıkta işlem yok.</td></tr>
              ) : rows.map(r => (
                <tr key={r.key} className={cn(r.records === 0 && 'opacity-50')}>
                  <td className="px-3 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">{r.label}</td>
                  <td className="px-3 py-2.5">
                    {/* Pay çubuğu: en çok çalışan birime göre oran */}
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                      <div
                        className="h-full rounded-full bg-[#2a78d6] dark:bg-[#3987e5]"
                        style={{ width: `${(r.records / enCok) * 100}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="font-medium">{formatQty(r.records)}</span>
                    <Fark pct={degisim(r.records, r.records_prev)} />
                    <span className="block text-[11px] text-zinc-400">önceki {formatQty(r.records_prev)}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {r.supports_quantity ? (
                      <>
                        {formatQty(r.quantity ?? 0)}
                        <Fark pct={degisim(r.quantity, r.quantity_prev)} />
                      </>
                    ) : <span className="text-zinc-400" title="Bu bölümde miktar tutulmuyor">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {r.avg_minutes === null ? (
                      <span className="text-zinc-400" title="Tamamlanma zamanı tutulmayan kayıtlar">—</span>
                    ) : (
                      <>
                        {formatQty(r.avg_minutes)} dk
                        {/* Sürede artış kötü */}
                        <Fark pct={degisim(r.avg_minutes, r.avg_minutes_prev)} tersi />
                      </>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-zinc-500">
                    {r.last_activity ? (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3 text-zinc-400" />{formatDateTime(r.last_activity)}
                      </span>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {data.notes.map((n, i) => (
        <p key={i} className="text-[11px] text-zinc-400">{n}</p>
      ))}
    </div>
  )
}
