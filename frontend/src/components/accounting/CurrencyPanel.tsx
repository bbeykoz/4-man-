'use client'

/** Çoklu para: kur tablosu, çevrim, dönem sonu değerleme. */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { BrandLoaderBlock } from '@/components/common/BrandLoader'
import { cn } from '@/lib/utils'
import { A, apiError, dateTR, get, money, post } from './api'
import { Badge, Money, Notice, Section, Stat, Table, Td, Th } from './ui'

export function CurrencyPanel() {
  const [gorunum, setGorunum] = useState<'kurlar' | 'degerleme'>('kurlar')

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-lg border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-900">
        {([['kurlar', 'Kur tablosu'], ['degerleme', 'Dönem sonu değerleme']] as const).map(([id, l]) => (
          <button key={id} onClick={() => setGorunum(id)}
            className={cn('rounded-md px-3 py-1.5 text-sm transition-colors',
              gorunum === id ? 'bg-blue-600 text-white' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800')}>
            {l}
          </button>
        ))}
      </div>
      {gorunum === 'kurlar' ? <Kurlar /> : <Degerleme />}
    </div>
  )
}

interface Kur {
  id: string
  pair: string
  base: string
  quote: string
  rate_date: string
  rate: number
  inverse: number
  source: string
  is_fixed: boolean
  note: string | null
  reason: string | null
}

function Kurlar() {
  const [formAcik, setFormAcik] = useState(false)
  const [cevrim, setCevrim] = useState({ amount: '', currency: 'USD', date: '' })

  const ozet = useQuery({
    queryKey: ['acc', 'currency', 'overview'],
    queryFn: () => get<{ data: { book_currency: string; currencies_in_use: string[]
      legacy_currency: { code: string; fixed_rate: string; until: string } | null } }>(`${A}/currency/overview`).then(r => r.data),
  })

  const kurlar = useQuery({
    queryKey: ['acc', 'currency', 'rates'],
    queryFn: () => get<{ data: Kur[] }>(`${A}/currency/rates`).then(r => r.data),
  })

  const cevir = useMutation({
    mutationFn: () => post<{ data: { converted: number; rate: number; source: string; rate_date: string; method: string; to: string } }>(
      `${A}/currency/convert`, { amount: Number(cevrim.amount), currency: cevrim.currency, date: cevrim.date || undefined }),
    onError: (e) => toast.error(apiError(e)),
  })

  const o = ozet.data
  const alan = 'rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100'

  return (
    <div className="space-y-4">
      {o && (
        <Section title="Para birimleri" description={`Defter para birimi ${o.book_currency}`}>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Defter para birimi" value={o.book_currency} />
            <Stat label="Kullanılan dövizler" value={o.currencies_in_use.join(', ') || '—'} />
            <Stat label="Eski para" value={o.legacy_currency ? `${o.legacy_currency.code} (${o.legacy_currency.fixed_rate})` : '—'}
              hint={o.legacy_currency ? `${o.legacy_currency.until} tarihine kadar` : undefined} />
          </div>

          {o.legacy_currency && (
            <Notice tone="info">
              1 {o.book_currency} = {o.legacy_currency.fixed_rate} {o.legacy_currency.code} sabit dönüşüm kuru mevzuatla belirli
              ve değiştirilemez. {o.legacy_currency.code} dönemindeki kayıtlar kaynak para birimiyle korunur.
            </Notice>
          )}
        </Section>
      )}

      <Section title="Kur çevirici">
        <div className="flex flex-wrap items-end gap-2">
          <input type="number" step="0.01" value={cevrim.amount} onChange={e => setCevrim(c => ({ ...c, amount: e.target.value }))}
            placeholder="Tutar" className={`${alan} w-32`} />
          <input value={cevrim.currency} onChange={e => setCevrim(c => ({ ...c, currency: e.target.value.toUpperCase() }))}
            maxLength={3} placeholder="USD" className={`${alan} w-24 font-mono`} />
          <input type="date" value={cevrim.date} onChange={e => setCevrim(c => ({ ...c, date: e.target.value }))} className={alan} />
          <button onClick={() => cevir.mutate()} disabled={!cevrim.amount || cevir.isPending}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            Çevir
          </button>
          {cevir.data && (
            <span className="text-sm text-zinc-700 dark:text-zinc-300">
              = <strong className="tabular-nums">{money(cevir.data.data.converted)} {cevir.data.data.to}</strong>
              <span className="ml-2 text-xs text-zinc-400">
                kur {cevir.data.data.rate} · {cevir.data.data.source} · {dateTR(cevir.data.data.rate_date)}
                {cevir.data.data.method !== 'direct' && ` · ${cevir.data.data.method}`}
              </span>
            </span>
          )}
        </div>
      </Section>

      <Section
        title="Kur tablosu"
        description={`${kurlar.data?.length ?? 0} kayıt`}
        action={
          <button onClick={() => setFormAcik(v => !v)} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">
            <Plus className="h-3.5 w-3.5" /> Kur ekle
          </button>
        }
      >
        {formAcik && <KurFormu onClose={() => setFormAcik(false)} />}

        {kurlar.isLoading ? <BrandLoaderBlock /> : (
          <Table
            empty={(kurlar.data?.length ?? 0) === 0}
            head={
              <tr>
                <Th className="w-28">Çift</Th>
                <Th className="w-28">Tarih</Th>
                <Th className="w-32" align="right">Kur</Th>
                <Th className="w-32" align="right">Ters</Th>
                <Th className="w-28">Kaynak</Th>
                <Th>Not</Th>
              </tr>
            }
          >
            {(kurlar.data ?? []).map(k => (
              <tr key={k.id} className={k.is_fixed ? 'bg-blue-50/40 dark:bg-blue-950/20' : undefined}>
                <Td className="font-mono text-xs">{k.pair}</Td>
                <Td className="text-xs">{dateTR(k.rate_date)}</Td>
                <Td align="right" className="tabular-nums">{k.rate}</Td>
                <Td align="right" className="tabular-nums text-zinc-500">{k.inverse}</Td>
                <Td>
                  <Badge label={k.source} color={k.is_fixed ? 'blue' : k.source === 'MANUAL' ? 'amber' : 'gray'} />
                </Td>
                <Td className="text-xs text-zinc-500">{k.note ?? k.reason ?? '—'}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </div>
  )
}

function KurFormu({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    base_currency: 'USD', quote_currency: 'EUR',
    rate_date: new Date().toISOString().slice(0, 10), rate: '', source: 'BNB', reason: '',
  })

  const kaydet = useMutation({
    mutationFn: () => post<{ message: string }>(`${A}/currency/rates`, {
      ...form, rate: Number(form.rate), reason: form.reason || undefined,
    }),
    onSuccess: (r) => { toast.success(r.message); qc.invalidateQueries({ queryKey: ['acc', 'currency'] }); onClose() },
    onError: (e) => toast.error(apiError(e)),
  })

  const alan = 'w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100'
  const elle = form.source.toUpperCase() === 'MANUAL'

  return (
    <form onSubmit={e => { e.preventDefault(); kaydet.mutate() }}
      className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800/40">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="block">
          <span className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">Baz para</span>
          <input required maxLength={3} value={form.base_currency}
            onChange={e => setForm(f => ({ ...f, base_currency: e.target.value.toUpperCase() }))} className={`${alan} font-mono`} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">Karşı para</span>
          <input required maxLength={3} value={form.quote_currency}
            onChange={e => setForm(f => ({ ...f, quote_currency: e.target.value.toUpperCase() }))} className={`${alan} font-mono`} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">Tarih</span>
          <input required type="date" value={form.rate_date} onChange={e => setForm(f => ({ ...f, rate_date: e.target.value }))} className={alan} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">Kur</span>
          <input required type="number" step="0.0000000001" value={form.rate} onChange={e => setForm(f => ({ ...f, rate: e.target.value }))} className={alan} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">Kaynak</span>
          <input value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value.toUpperCase() }))}
            placeholder="BNB / TCMB / MANUAL" className={alan} />
        </label>
      </div>

      {elle && (
        <label className="mt-3 block">
          <span className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">Gerekçe (elle girilen kurda zorunlu)</span>
          <input required value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} className={alan} />
        </label>
      )}

      <Notice tone="info">
        1 {form.base_currency || 'X'} = kur × {form.quote_currency || 'Y'} olarak okunur. Kaydedilen kur geçmiş fişleri etkilemez;
        her fiş kendi kurunu satırında taşır.
      </Notice>

      <div className="mt-3 flex gap-2">
        <button type="submit" disabled={kaydet.isPending}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {kaydet.isPending ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
        <button type="button" onClick={onClose} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm dark:border-zinc-700 dark:text-zinc-300">Vazgeç</button>
      </div>
    </form>
  )
}

interface Degerlendirme {
  id: string
  valuation_date: string
  currency: string
  rate_used: number
  rate_source: string
  gain: number
  loss: number
  net_effect: number
  item_count: number
  is_reversed: boolean
}

function Degerleme() {
  const qc = useQueryClient()
  const [tarih, setTarih] = useState(new Date().toISOString().slice(0, 10))

  const onizleme = useQuery({
    queryKey: ['acc', 'currency', 'preview', tarih],
    queryFn: () => get<{ data: { currencies: { currency: string; rate: number; rate_source: string; gain: number; loss: number; net_effect: number; item_count: number
      items: { number: string; partner_name: string | null; outstanding_fc: number; booked_value: number; current_value: number; difference: number; is_gain: boolean }[] }[]
      total_gain: number; total_loss: number; net_effect: number; book_currency: string } }>(
      `${A}/currency/revaluations/preview`, { params: { valuation_date: tarih } }).then(r => r.data),
  })

  const gecmis = useQuery({
    queryKey: ['acc', 'currency', 'revaluations'],
    queryFn: () => get<{ data: Degerlendirme[] }>(`${A}/currency/revaluations`).then(r => r.data),
  })

  const calistir = useMutation({
    mutationFn: (currency: string) => post<{ message: string }>(`${A}/currency/revaluations`, { valuation_date: tarih, currency }),
    onSuccess: (r) => { toast.success(r.message); qc.invalidateQueries({ queryKey: ['acc'] }) },
    onError: (e) => toast.error(apiError(e)),
  })

  const tersCevir = useMutation({
    mutationFn: (id: string) => post<{ message: string }>(`${A}/currency/revaluations/${id}/reverse`, {}),
    onSuccess: (r) => { toast.success(r.message); qc.invalidateQueries({ queryKey: ['acc'] }) },
    onError: (e) => toast.error(apiError(e)),
  })

  const o = onizleme.data

  return (
    <div className="space-y-4">
      <Section
        title="Dönem sonu kur değerlemesi"
        description="Kapanmamış dövizli bakiyeler değerleme kuruyla yeniden hesaplanır"
        action={
          <input type="date" value={tarih} onChange={e => setTarih(e.target.value)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100" />
        }
      >
        <Notice tone="info">
          Buradaki fark <strong>gerçekleşmemiş</strong>tir; yalnız değerleme tarihindeki tahmindir. Fiş sonraki dönemin ilk günü
          ters çevrilmeli, yoksa bir sonraki değerleme aynı farkı ikinci kez yazar.
        </Notice>

        {onizleme.isLoading ? <BrandLoaderBlock /> : !o || o.currencies.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">Değerlenecek dövizli bakiye yok.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {o.currencies.map(c => (
              <div key={c.currency} className="rounded-lg border border-zinc-200 dark:border-zinc-800">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
                  <span className="flex items-center gap-3">
                    <span className="font-mono text-sm font-medium text-zinc-900 dark:text-zinc-100">{c.currency}</span>
                    <span className="text-xs text-zinc-400">kur {c.rate} · {c.rate_source} · {c.item_count} kalem</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className={cn('text-sm font-medium tabular-nums',
                      c.net_effect > 0 ? 'text-emerald-600 dark:text-emerald-400' : c.net_effect < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-500')}>
                      {money(c.net_effect)} {o.book_currency}
                    </span>
                    <button onClick={() => calistir.mutate(c.currency)} disabled={calistir.isPending || c.item_count === 0}
                      className="rounded-md bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                      Değerlemeyi kaydet
                    </button>
                  </span>
                </div>

                <Table
                  head={
                    <tr>
                      <Th className="w-32">Kalem</Th>
                      <Th>Cari</Th>
                      <Th className="w-28" align="right">Açık ({c.currency})</Th>
                      <Th className="w-28" align="right">Defterdeki</Th>
                      <Th className="w-28" align="right">Güncel</Th>
                      <Th className="w-28" align="right">Fark</Th>
                    </tr>
                  }
                >
                  {c.items.map((i, idx) => (
                    <tr key={idx}>
                      <Td className="font-mono text-xs">{i.number}</Td>
                      <Td className="truncate text-xs">{i.partner_name ?? '—'}</Td>
                      <Td align="right"><Money value={i.outstanding_fc} /></Td>
                      <Td align="right"><Money value={i.booked_value} /></Td>
                      <Td align="right"><Money value={i.current_value} /></Td>
                      <Td align="right" className={cn('font-medium', i.is_gain ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
                        {money(i.difference)}
                      </Td>
                    </tr>
                  ))}
                </Table>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Değerleme geçmişi" description={`${gecmis.data?.length ?? 0} kayıt`}>
        {gecmis.isLoading ? <BrandLoaderBlock size={48} text={null} /> : (
          <Table
            empty={(gecmis.data?.length ?? 0) === 0}
            head={
              <tr>
                <Th className="w-28">Tarih</Th>
                <Th className="w-20">Para</Th>
                <Th className="w-28" align="right">Kur</Th>
                <Th className="w-28" align="right">Kazanç</Th>
                <Th className="w-28" align="right">Kayıp</Th>
                <Th className="w-28" align="right">Net</Th>
                <Th className="w-40">Durum</Th>
              </tr>
            }
          >
            {(gecmis.data ?? []).map(d => (
              <tr key={d.id}>
                <Td className="text-xs">{dateTR(d.valuation_date)}</Td>
                <Td className="font-mono text-xs">{d.currency}</Td>
                <Td align="right" className="tabular-nums">{d.rate_used}</Td>
                <Td align="right"><Money value={d.gain} /></Td>
                <Td align="right"><Money value={d.loss} /></Td>
                <Td align="right" className="font-medium"><Money value={d.net_effect} /></Td>
                <Td>
                  {d.is_reversed
                    ? <Badge label="Ters çevrildi" color="gray" />
                    : (
                      <button onClick={() => tersCevir.mutate(d.id)} disabled={tersCevir.isPending}
                        className="inline-flex items-center gap-1 rounded-md border border-amber-300 px-2 py-1 text-xs text-amber-700 hover:bg-amber-50 disabled:opacity-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/30">
                        <RotateCcw className="h-3 w-3" /> Ters çevir
                      </button>
                    )}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </div>
  )
}
