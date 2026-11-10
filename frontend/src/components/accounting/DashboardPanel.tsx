'use client'

/**
 * Muhasebe özeti (dashboard).
 *
 * Hem muhasebe modülünün "Özet" sekmesi hem Muhasebe Müdürü sayfası bunu
 * kullanıyor; ikisinde de aynı rakamlar görünsün diye tek bileşen.
 *
 * Grafik renkleri: gelir #2563eb, gider #d97706. İkisi de kategorik — biri
 * "iyi" diğeri "kötü" değil, iki ayrı ölçüm. Emerald/rose yalnız kârın
 * işareti için kullanılıyor (artı/eksi), seri rengi olarak değil.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { AlertTriangle, ArrowRight, Wallet } from 'lucide-react'
import { BrandLoaderBlock } from '@/components/common/BrandLoader'
import { cn } from '@/lib/utils'
import { A, dateTR, get, money, params } from './api'
import { Badge, Money, Notice, Section, Stat, Table, Td, Th } from './ui'

/** Doğrulanmış kategorik çift; açık ve koyu temada aynı. */
const RENK = { income: '#2563eb', expense: '#d97706' }

interface Ozet {
  period: { from: string; to: string; label: string }
  currency: string
  cash: {
    accounts: { id: string; code: string; name: string; type: string; currency: string; balance: number; cash_limit: number | null; exceeds_limit: boolean }[]
    total: number; cash_total: number; bank_total: number; account_count: number
  }
  income_expense: {
    income: number; expense: number; profit: number; margin: number | null
    top_income: { code: string; name: string; amount: number }[]
    top_expense: { code: string; name: string; amount: number }[]
  }
  quick_periods: Record<string, { label: string; from: string; to: string; income: number; expense: number; profit: number }>
  receivables: {
    receivable: number; payable: number; net: number
    overdue_receivable: number; overdue_payable: number
    open_sales_count: number; open_purchase_count: number
    ageing: Record<string, number>; ageing_buckets: Record<string, string>
    top_overdue: { partner_name: string; overdue_total: number; total: number }[]
  }
  advances: { customer_advance: number; supplier_advance: number; unallocated_in: number; unallocated_out: number; unallocated_count: number }
  vat: { registered: boolean; period?: string; output_tax?: number; input_tax?: number; net_payable?: number
    sales_base?: number; purchase_base?: number; non_deductible?: number; due_date?: string
    last_return?: { period_key: string; status: string; net_payable: number; due_date: string } | null }
  documents: { sales: { count: number; amount: number }; purchases: { count: number; amount: number }; unposted: number }
  trend: { period: string; label: string; income: number; expense: number; profit: number }[]
  pending: Record<string, number>
}

const BEKLEYEN_ADLARI: Record<string, string> = {
  journal_entries: 'Deftere işlenmemiş fiş',
  documents: 'İşlenmemiş belge',
  payments: 'Bekleyen ödeme',
  inventory_events: 'Depo olayı',
  bank_transactions: 'Eşleşmemiş ekstre satırı',
  unapproved_tax_codes: 'Onaysız vergi kodu',
}

export function DashboardPanel({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const bugun = new Date()
  const [aralik, setAralik] = useState({
    from: new Date(bugun.getFullYear(), 0, 1).toISOString().slice(0, 10),
    to: new Date(bugun.getFullYear(), 11, 31).toISOString().slice(0, 10),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['acc', 'dashboard', aralik],
    queryFn: () => get<{ data: Ozet }>(`${A}/dashboard`, { params: params(aralik) }).then(r => r.data),
  })

  if (isLoading) return <BrandLoaderBlock />
  if (!data) return null

  const d = data
  const pb = d.currency
  const alan = 'rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100'

  return (
    <div className="space-y-4">
      {/* Filtre — tüm rakamlar bu aralığa göre */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Dönem</span>
          <input type="date" value={aralik.from} onChange={e => setAralik(a => ({ ...a, from: e.target.value }))} className={alan} />
          <span className="text-xs text-zinc-400">–</span>
          <input type="date" value={aralik.to} onChange={e => setAralik(a => ({ ...a, to: e.target.value }))} className={alan} />
        </div>
        <div className="flex flex-wrap gap-1">
          {Object.entries(d.quick_periods).map(([k, q]) => (
            <button
              key={k}
              onClick={() => setAralik({ from: q.from, to: q.to })}
              className={cn('rounded-md px-2.5 py-1 text-xs transition-colors',
                aralik.from === q.from && aralik.to === q.to
                  ? 'bg-blue-600 text-white'
                  : 'border border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800')}
            >
              {q.label}
            </button>
          ))}
        </div>
      </div>

      {/* Hero rakamlar */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <HeroCard
          label="Güncel kasa + banka"
          value={`${money(d.cash.total)} ${pb}`}
          hint={`Kasa ${money(d.cash.cash_total)} · Banka ${money(d.cash.bank_total)}`}
          icon={Wallet}
        />
        <HeroCard label="Gelir" value={`${money(d.income_expense.income)} ${pb}`} hint={d.period.label} accent={RENK.income} />
        <HeroCard label="Gider" value={`${money(d.income_expense.expense)} ${pb}`} hint={d.period.label} accent={RENK.expense} />
        <HeroCard
          label="Kâr"
          value={`${money(d.income_expense.profit)} ${pb}`}
          hint={d.income_expense.margin !== null ? `Marj %${d.income_expense.margin}` : undefined}
          tone={d.income_expense.profit >= 0 ? 'positive' : 'negative'}
        />
      </div>

      {/* Haftalık / aylık kırılım */}
      <Section title="Dönem karşılaştırması" description="Gelir ve gider defterden; elle fişler ve depo hareketleri dahil">
        <Table
          head={
            <tr>
              <Th>Dönem</Th>
              <Th className="w-28">Aralık</Th>
              <Th className="w-32" align="right">Gelir</Th>
              <Th className="w-32" align="right">Gider</Th>
              <Th className="w-32" align="right">Kâr</Th>
            </tr>
          }
        >
          {Object.entries(d.quick_periods).map(([k, q]) => (
            <tr key={k} className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50" onClick={() => setAralik({ from: q.from, to: q.to })}>
              <Td className="font-medium">{q.label}</Td>
              <Td className="text-xs text-zinc-500">{dateTR(q.from)} – {dateTR(q.to)}</Td>
              <Td align="right"><Money value={q.income} /></Td>
              <Td align="right"><Money value={q.expense} /></Td>
              <Td align="right" className={cn('font-medium',
                q.profit > 0 ? 'text-emerald-600 dark:text-emerald-400' : q.profit < 0 ? 'text-rose-600 dark:text-rose-400' : '')}>
                {money(q.profit)}
              </Td>
            </tr>
          ))}
        </Table>
      </Section>

      {/* Trend grafiği */}
      <Section title="Son 6 ay" description={`Gelir ve gider, ${pb}`}>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={d.trend} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-zinc-200 dark:stroke-zinc-800" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} className="text-xs fill-zinc-500" />
              <YAxis
                tickLine={false} axisLine={false} width={70}
                className="text-xs fill-zinc-500"
                tickFormatter={(v) => money(Number(v), 0)}
              />
              <Tooltip
                formatter={(v, ad) => [`${money(Number(v))} ${pb}`, String(ad)]}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="income"  name="Gelir" fill={RENK.income}  radius={[4, 4, 0, 0]} maxBarSize={28} />
              <Bar dataKey="expense" name="Gider" fill={RENK.expense} radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Kasa ve banka hesapları */}
        <Section title="Kasa ve banka" description={`${d.cash.account_count} hesap`}>
          <Table
            empty={d.cash.accounts.length === 0}
            head={<tr><Th>Hesap</Th><Th className="w-20" align="center">Tür</Th><Th className="w-32" align="right">Bakiye</Th></tr>}
          >
            {d.cash.accounts.map(h => (
              <tr key={h.id} className={h.exceeds_limit ? 'bg-amber-50/60 dark:bg-amber-950/20' : undefined}>
                <Td>
                  {h.name}
                  {h.exceeds_limit && <div className="text-[11px] text-amber-600 dark:text-amber-400">Kasa limiti aşıldı ({money(h.cash_limit)})</div>}
                </Td>
                <Td align="center"><Badge label={h.type === 'cash' ? 'Kasa' : h.type === 'pos' ? 'POS' : 'Banka'} color={h.type === 'cash' ? 'amber' : 'blue'} /></Td>
                <Td align="right" className="font-medium"><Money value={h.balance} currency={h.currency} /></Td>
              </tr>
            ))}
            <tr className="bg-zinc-50 font-medium dark:bg-zinc-800/50">
              <Td colSpan={2} className="text-xs uppercase tracking-wide text-zinc-500">Toplam</Td>
              <Td align="right"><Money value={d.cash.total} currency={pb} /></Td>
            </tr>
          </Table>
        </Section>

        {/* KDV */}
        <Section
          title="KDV"
          description={d.vat.registered ? `Dönem ${d.vat.period} · son tarih ${dateTR(d.vat.due_date)}` : undefined}
          action={onNavigate && (
            <button onClick={() => onNavigate('kdv')} className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400">
              KDV merkezi <ArrowRight className="h-3 w-3" />
            </button>
          )}
        >
          {!d.vat.registered ? (
            <Notice tone="info">Şirket KDV mükellefi olarak işaretli değil.</Notice>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Stat label="Hesaplanan" value={money(d.vat.output_tax)} hint={`Matrah ${money(d.vat.sales_base)}`} />
                <Stat label="İndirilecek" value={money(d.vat.input_tax)} hint={`Matrah ${money(d.vat.purchase_base)}`} />
                <Stat
                  label={(d.vat.net_payable ?? 0) >= 0 ? 'Ödenecek' : 'Devreden'}
                  value={money(Math.abs(d.vat.net_payable ?? 0))}
                  tone={(d.vat.net_payable ?? 0) > 0 ? 'negative' : 'positive'}
                />
              </div>
              {(d.vat.non_deductible ?? 0) > 0 && (
                <p className="mt-2 text-xs text-zinc-500">İndirilemeyen KDV: {money(d.vat.non_deductible)} {pb}</p>
              )}
              {d.vat.last_return && (
                <p className="mt-2 text-xs text-zinc-500">
                  Son beyan: {d.vat.last_return.period_key} · {money(d.vat.last_return.net_payable)} {pb} · {d.vat.last_return.status}
                </p>
              )}
            </>
          )}
        </Section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Alacak / borç */}
        <Section
          title="Alacak ve borç"
          description={`${d.receivables.open_sales_count} açık satış · ${d.receivables.open_purchase_count} açık alış belgesi`}
          action={onNavigate && (
            <button onClick={() => onNavigate('cariler')} className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400">
              Cariler <ArrowRight className="h-3 w-3" />
            </button>
          )}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Alacak" value={money(d.receivables.receivable)}
              hint={d.receivables.overdue_receivable ? `${money(d.receivables.overdue_receivable)} gecikmiş` : undefined}
              tone={d.receivables.overdue_receivable ? 'warning' : 'default'} />
            <Stat label="Borç" value={money(d.receivables.payable)}
              hint={d.receivables.overdue_payable ? `${money(d.receivables.overdue_payable)} gecikmiş` : undefined} />
            <Stat label="Net" value={money(d.receivables.net)} tone={d.receivables.net >= 0 ? 'positive' : 'negative'} />
          </div>

          {/* Yaşlandırma — sıralı dilimler, basit yatay çubuk */}
          <div className="mt-4 space-y-1.5">
            {Object.entries(d.receivables.ageing_buckets).map(([k, etiket]) => {
              const v = d.receivables.ageing[k] ?? 0
              const enBuyuk = Math.max(...Object.keys(d.receivables.ageing_buckets).map(b => d.receivables.ageing[b] ?? 0), 1)
              const genislik = Math.max((v / enBuyuk) * 100, v > 0 ? 2 : 0)
              const gecikmis = k !== 'not_due'

              return (
                <div key={k} className="flex items-center gap-2">
                  <span className="w-28 shrink-0 text-xs text-zinc-500">{etiket}</span>
                  <div className="h-3 flex-1 overflow-hidden rounded-sm bg-zinc-100 dark:bg-zinc-800">
                    <div
                      className="h-full rounded-sm"
                      style={{ width: `${genislik}%`, background: gecikmis ? RENK.expense : RENK.income }}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-right text-xs tabular-nums text-zinc-700 dark:text-zinc-300">{money(v)}</span>
                </div>
              )
            })}
          </div>

          {d.receivables.top_overdue.length > 0 && (
            <div className="mt-4">
              <h4 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">En çok geciken cariler</h4>
              <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
                {d.receivables.top_overdue.map((p, i) => (
                  <li key={i} className="flex items-center justify-between py-1.5">
                    <span className="truncate text-zinc-700 dark:text-zinc-300">{p.partner_name}</span>
                    <span className="tabular-nums text-rose-600 dark:text-rose-400">{money(p.overdue_total)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>

        {/* Avanslar */}
        <Section
          title="Avanslar ve dağıtılmamış tutarlar"
          description="Defterdeki avans bakiyesi ile belgeye bağlanmamış tahsilat ayrı şeylerdir"
          action={onNavigate && (
            <button onClick={() => onNavigate('odemeler')} className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400">
              Ödemeler <ArrowRight className="h-3 w-3" />
            </button>
          )}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Stat label="Alınan avans" value={money(d.advances.customer_advance)} hint="Müşteriden alınıp fatura kesilmemiş" />
            <Stat label="Verilen avans" value={money(d.advances.supplier_advance)} hint="Tedarikçiye ödenip fatura gelmemiş" />
            <Stat label="Dağıtılmamış tahsilat" value={money(d.advances.unallocated_in)}
              tone={d.advances.unallocated_in ? 'warning' : 'default'} />
            <Stat label="Dağıtılmamış ödeme" value={money(d.advances.unallocated_out)}
              tone={d.advances.unallocated_out ? 'warning' : 'default'} />
          </div>

          {d.advances.unallocated_count > 0 && (
            <Notice tone="warning">
              {d.advances.unallocated_count} tahsilat/ödeme hiçbir belgeye bağlanmamış. Belgeye dağıtılana kadar avans olarak duruyor.
            </Notice>
          )}
        </Section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* En büyük gelir ve gider hesapları */}
        <Section title="Gelir ve gider dağılımı" description={d.period.label}>
          <div className="grid gap-4 sm:grid-cols-2">
            <KalemListesi baslik="Gelir" kalemler={d.income_expense.top_income} renk={RENK.income} />
            <KalemListesi baslik="Gider" kalemler={d.income_expense.top_expense} renk={RENK.expense} />
          </div>
        </Section>

        {/* Bekleyen işler */}
        <Section title="Bekleyen işler" description={d.pending.total ? `${d.pending.total} kayıt müdahale bekliyor` : 'Bekleyen iş yok'}>
          {d.pending.total === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500">Her şey işlenmiş.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
              {Object.entries(BEKLEYEN_ADLARI).map(([k, etiket]) => {
                const v = d.pending[k] ?? 0
                if (!v) return null

                return (
                  <li key={k} className="flex items-center justify-between py-2">
                    <span className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                      {etiket}
                    </span>
                    <span className="tabular-nums font-medium text-zinc-900 dark:text-zinc-100">{v}</span>
                  </li>
                )
              })}
            </ul>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Stat label="Satış belgesi" value={d.documents.sales.count} hint={`${money(d.documents.sales.amount)} ${pb}`} />
            <Stat label="Alış belgesi" value={d.documents.purchases.count} hint={`${money(d.documents.purchases.amount)} ${pb}`} />
            <Stat label="İşlenmemiş belge" value={d.documents.unposted} tone={d.documents.unposted ? 'warning' : 'default'} />
          </div>
        </Section>
      </div>
    </div>
  )
}

function HeroCard({
  label, value, hint, tone, accent, icon: Icon,
}: {
  label: string
  value: string
  hint?: string
  tone?: 'positive' | 'negative'
  accent?: string
  icon?: typeof Wallet
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
        {accent && <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: accent }} />}
        {Icon && <Icon className="h-4 w-4 shrink-0 text-zinc-400" />}
      </div>
      <p className={cn('mt-1.5 text-2xl font-semibold tabular-nums',
        tone === 'positive' ? 'text-emerald-600 dark:text-emerald-400'
          : tone === 'negative' ? 'text-rose-600 dark:text-rose-400'
          : 'text-zinc-900 dark:text-zinc-100')}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-zinc-400">{hint}</p>}
    </div>
  )
}

function KalemListesi({ baslik, kalemler, renk }: { baslik: string; kalemler: { code: string; name: string; amount: number }[]; renk: string }) {
  const enBuyuk = Math.max(...kalemler.map(k => k.amount), 1)

  return (
    <div>
      <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: renk }} />
        {baslik}
      </h4>
      {kalemler.length === 0 ? (
        <p className="text-xs text-zinc-400">Kayıt yok.</p>
      ) : (
        <ul className="space-y-1.5">
          {kalemler.map(k => (
            <li key={k.code}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-xs text-zinc-700 dark:text-zinc-300">
                  <span className="font-mono text-zinc-400">{k.code}</span> {k.name}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-zinc-900 dark:text-zinc-100">{money(k.amount)}</span>
              </div>
              <div className="mt-0.5 h-1.5 overflow-hidden rounded-sm bg-zinc-100 dark:bg-zinc-800">
                <div className="h-full rounded-sm" style={{ width: `${Math.max((k.amount / enBuyuk) * 100, 2)}%`, background: renk }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
