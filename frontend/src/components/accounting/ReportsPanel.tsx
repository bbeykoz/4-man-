'use client'

/** Defter raporları: mizan, büyük defter, hesap ekstresi, yevmiye defteri. */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BrandLoaderBlock } from '@/components/common/BrandLoader'
import { cn } from '@/lib/utils'
import { A, dateTR, get, money, params } from './api'
import { DateRange, Money, Notice, Section, Table, Td, Th } from './ui'

type Rapor = 'mizan' | 'buyuk-defter' | 'ekstre' | 'yevmiye'

const RAPORLAR: { id: Rapor; label: string; hint: string }[] = [
  { id: 'mizan',        label: 'Mizan',           hint: 'Açılış, dönem hareketi, kapanış' },
  { id: 'buyuk-defter', label: 'Büyük defter',    hint: 'Hesap hesap hareketler' },
  { id: 'ekstre',       label: 'Hesap ekstresi',  hint: 'Tek hesabın yürüyen bakiyesi' },
  { id: 'yevmiye',      label: 'Yevmiye defteri', hint: 'Fişler tarih sırasıyla' },
]

export function ReportsPanel() {
  const yil = new Date().getFullYear()
  const [rapor, setRapor] = useState<Rapor>('mizan')
  const [from, setFrom] = useState(`${yil}-01-01`)
  const [to, setTo] = useState(`${yil}-12-31`)
  const [hesapId, setHesapId] = useState('')
  const [bosGoster, setBosGoster] = useState(false)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-lg border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-900">
          {RAPORLAR.map(r => (
            <button
              key={r.id}
              onClick={() => setRapor(r.id)}
              title={r.hint}
              className={cn('rounded-md px-3 py-1.5 text-sm transition-colors',
                rapor === r.id
                  ? 'bg-blue-600 text-white'
                  : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800')}
            >
              {r.label}
            </button>
          ))}
        </div>
        <DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t) }} />
      </div>

      {rapor === 'mizan'        && <Mizan from={from} to={to} bosGoster={bosGoster} setBosGoster={setBosGoster} />}
      {rapor === 'buyuk-defter' && <BuyukDefter from={from} to={to} />}
      {rapor === 'ekstre'       && <Ekstre from={from} to={to} hesapId={hesapId} setHesapId={setHesapId} />}
      {rapor === 'yevmiye'      && <Yevmiye from={from} to={to} />}
    </div>
  )
}

interface MizanSatiri {
  account_id: string
  code: string
  name: string
  type_label: string
  opening_balance: number
  period_debit: number
  period_credit: number
  closing_balance: number
  closing_debit: number
  closing_credit: number
  unusual_balance: boolean
}

function Mizan({ from, to, bosGoster, setBosGoster }: { from: string; to: string; bosGoster: boolean; setBosGoster: (v: boolean) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['acc', 'report', 'trial', from, to, bosGoster],
    queryFn: () => get<{ data: { accounts: MizanSatiri[]; totals: Record<string, number>; balanced: boolean; meta: { currency: string; generated_at: string } } }>(
      `${A}/reports/trial-balance`, { params: params({ from, to, include_empty: bosGoster }) },
    ).then(r => r.data),
  })

  if (isLoading) return <BrandLoaderBlock />
  if (!data) return null

  return (
    <Section
      title="Mizan"
      description={`${data.accounts.length} hesap · ${data.meta.currency}`}
      action={
        <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
          <input type="checkbox" checked={bosGoster} onChange={e => setBosGoster(e.target.checked)} className="rounded" />
          Hareketsiz hesapları göster
        </label>
      }
    >
      {!data.balanced && <Notice tone="danger">Mizan dengeli değil. Borç ve alacak toplamları eşit olmalı.</Notice>}

      <Table
        empty={data.accounts.length === 0}
        head={
          <tr>
            <Th className="w-20">Kod</Th>
            <Th>Hesap</Th>
            <Th className="w-28" align="right">Açılış</Th>
            <Th className="w-28" align="right">Borç</Th>
            <Th className="w-28" align="right">Alacak</Th>
            <Th className="w-28" align="right">Kapanış B.</Th>
            <Th className="w-28" align="right">Kapanış A.</Th>
          </tr>
        }
      >
        {data.accounts.map(h => (
          <tr key={h.account_id} className={h.unusual_balance ? 'bg-amber-50/60 dark:bg-amber-950/20' : undefined}>
            <Td className="font-mono text-xs">{h.code}</Td>
            <Td>
              {h.name}
              {h.unusual_balance && <span className="ml-2 text-[11px] text-amber-600 dark:text-amber-400">ters bakiye</span>}
            </Td>
            <Td align="right"><Money value={h.opening_balance} /></Td>
            <Td align="right"><Money value={h.period_debit} /></Td>
            <Td align="right"><Money value={h.period_credit} /></Td>
            <Td align="right"><Money value={h.closing_debit} /></Td>
            <Td align="right"><Money value={h.closing_credit} /></Td>
          </tr>
        ))}
        <tr className="bg-zinc-50 font-medium dark:bg-zinc-800/50">
          <Td colSpan={2} className="text-xs uppercase tracking-wide text-zinc-500">Toplam</Td>
          <Td align="right">—</Td>
          <Td align="right"><Money value={data.totals.period_debit} /></Td>
          <Td align="right"><Money value={data.totals.period_credit} /></Td>
          <Td align="right"><Money value={data.totals.closing_debit} /></Td>
          <Td align="right"><Money value={data.totals.closing_credit} /></Td>
        </tr>
      </Table>

      <p className="mt-2 text-[11px] text-zinc-400">
        Üretim: {new Date(data.meta.generated_at).toLocaleString('tr-TR')}
      </p>
    </Section>
  )
}

interface DefterHesabi {
  account_id: string
  code: string
  name: string
  opening_balance: number
  period_debit: number
  period_credit: number
  closing_balance: number
  movements: { journal_no: string; posting_date: string; description: string; debit: number; credit: number; running_balance: number }[]
}

function BuyukDefter({ from, to }: { from: string; to: string }) {
  const [acik, setAcik] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['acc', 'report', 'gl', from, to],
    queryFn: () => get<{ data: { accounts: DefterHesabi[] } }>(`${A}/reports/general-ledger`, { params: { from, to } })
      .then(r => r.data),
  })

  if (isLoading) return <BrandLoaderBlock />
  const hesaplar = data?.accounts ?? []

  return (
    <Section title="Büyük defter" description={`${hesaplar.length} hareketli hesap`}>
      {hesaplar.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500">Bu aralıkta hareket yok.</p>
      ) : (
        <div className="space-y-2">
          {hesaplar.map(h => (
            <div key={h.account_id} className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
              <button
                onClick={() => setAcik(a => a === h.account_id ? null : h.account_id)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
              >
                <span className="min-w-0">
                  <span className="font-mono text-xs text-zinc-500">{h.code}</span>
                  <span className="ml-2 text-sm text-zinc-900 dark:text-zinc-100">{h.name}</span>
                  <span className="ml-2 text-xs text-zinc-400">{h.movements.length} hareket</span>
                </span>
                <span className="shrink-0 text-sm tabular-nums text-zinc-700 dark:text-zinc-300">
                  {money(h.closing_balance)}
                </span>
              </button>

              {acik === h.account_id && (
                <div className="border-t border-zinc-200 dark:border-zinc-800">
                  <Table
                    head={
                      <tr>
                        <Th className="w-28">Fiş</Th>
                        <Th className="w-24">Tarih</Th>
                        <Th>Açıklama</Th>
                        <Th className="w-28" align="right">Borç</Th>
                        <Th className="w-28" align="right">Alacak</Th>
                        <Th className="w-28" align="right">Bakiye</Th>
                      </tr>
                    }
                  >
                    <tr className="bg-zinc-50 text-xs dark:bg-zinc-800/50">
                      <Td colSpan={5} className="text-zinc-500">Açılış bakiyesi</Td>
                      <Td align="right"><Money value={h.opening_balance} /></Td>
                    </tr>
                    {h.movements.map((m, i) => (
                      <tr key={i}>
                        <Td className="font-mono text-xs">{m.journal_no}</Td>
                        <Td className="text-xs">{dateTR(m.posting_date)}</Td>
                        <Td className="truncate">{m.description}</Td>
                        <Td align="right"><Money value={m.debit} /></Td>
                        <Td align="right"><Money value={m.credit} /></Td>
                        <Td align="right" className="font-medium"><Money value={m.running_balance} /></Td>
                      </tr>
                    ))}
                  </Table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

function Ekstre({ from, to, hesapId, setHesapId }: { from: string; to: string; hesapId: string; setHesapId: (v: string) => void }) {
  const hesaplar = useQuery({
    queryKey: ['acc', 'chart', 'all'],
    queryFn: () => get<{ data: { id: string; code: string; name: string }[] }>(`${A}/chart-accounts`, { params: { all: 1 } }).then(r => r.data),
  })

  const { data, isLoading } = useQuery({
    enabled: !!hesapId,
    queryKey: ['acc', 'report', 'statement', hesapId, from, to],
    queryFn: () => get<{ data: {
      account: { code: string; name: string }
      opening_balance: number; period_debit: number; period_credit: number; closing_balance: number
      movements: { journal_no: string; posting_date: string; description: string; debit: number; credit: number; running_balance: number }[]
    } }>(`${A}/reports/account-statement/${hesapId}`, { params: { from, to } }).then(r => r.data),
  })

  return (
    <Section
      title="Hesap ekstresi"
      action={
        <select
          value={hesapId}
          onChange={e => setHesapId(e.target.value)}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        >
          <option value="">Hesap seçin</option>
          {(hesaplar.data ?? []).map(h => <option key={h.id} value={h.id}>{h.code} — {h.name}</option>)}
        </select>
      }
    >
      {!hesapId ? (
        <p className="py-8 text-center text-sm text-zinc-500">Ekstresini görmek istediğiniz hesabı seçin.</p>
      ) : isLoading ? <BrandLoaderBlock /> : data && (
        <>
          <div className="mb-3 grid gap-3 sm:grid-cols-4">
            <StatMini label="Açılış" value={money(data.opening_balance)} />
            <StatMini label="Dönem borç" value={money(data.period_debit)} />
            <StatMini label="Dönem alacak" value={money(data.period_credit)} />
            <StatMini label="Kapanış" value={money(data.closing_balance)} />
          </div>

          <Table
            empty={data.movements.length === 0}
            head={
              <tr>
                <Th className="w-28">Fiş</Th>
                <Th className="w-24">Tarih</Th>
                <Th>Açıklama</Th>
                <Th className="w-28" align="right">Borç</Th>
                <Th className="w-28" align="right">Alacak</Th>
                <Th className="w-28" align="right">Bakiye</Th>
              </tr>
            }
          >
            {data.movements.map((m, i) => (
              <tr key={i}>
                <Td className="font-mono text-xs">{m.journal_no}</Td>
                <Td className="text-xs">{dateTR(m.posting_date)}</Td>
                <Td className="truncate">{m.description}</Td>
                <Td align="right"><Money value={m.debit} /></Td>
                <Td align="right"><Money value={m.credit} /></Td>
                <Td align="right" className="font-medium"><Money value={m.running_balance} /></Td>
              </tr>
            ))}
          </Table>
        </>
      )}
    </Section>
  )
}

function Yevmiye({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['acc', 'report', 'journal-book', from, to],
    queryFn: () => get<{ data: {
      entries: { id: string; journal_no: string; posting_date: string; description: string; total_debit: number; is_reversal: boolean
        lines: { account_code: string; account_name: string; description: string; debit: number; credit: number }[] }[]
      totals: { entries: number; debit: number; credit: number }
    } }>(`${A}/reports/journal-book`, { params: { from, to } }).then(r => r.data),
  })

  if (isLoading) return <BrandLoaderBlock />
  if (!data) return null

  return (
    <Section title="Yevmiye defteri" description={`${data.totals.entries} fiş · toplam ${money(data.totals.debit)}`}>
      {data.entries.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500">Bu aralıkta deftere işlenmiş fiş yok.</p>
      ) : (
        <div className="space-y-3">
          {data.entries.map(f => (
            <div key={f.id} className="rounded-lg border border-zinc-200 dark:border-zinc-800">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
                <span className="flex items-center gap-2">
                  <span className="font-mono text-xs text-zinc-500">{f.journal_no}</span>
                  <span className="text-sm text-zinc-900 dark:text-zinc-100">{f.description}</span>
                  {f.is_reversal && <span className="text-[11px] text-rose-600 dark:text-rose-400">ters kayıt</span>}
                </span>
                <span className="text-xs text-zinc-400">{dateTR(f.posting_date)}</span>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                  {f.lines.map((l, i) => (
                    <tr key={i}>
                      <td className="w-24 px-3 py-1.5 font-mono text-xs text-zinc-500">{l.account_code}</td>
                      <td className="px-3 py-1.5 text-zinc-700 dark:text-zinc-300">{l.description || l.account_name}</td>
                      <td className="w-28 px-3 py-1.5 text-right tabular-nums">{l.debit ? money(l.debit) : ''}</td>
                      <td className="w-28 px-3 py-1.5 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{l.credit ? money(l.credit) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

function StatMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-0.5 text-sm font-medium tabular-nums text-zinc-900 dark:text-zinc-100">{value}</p>
    </div>
  )
}
