'use client'

/** Banka ve kasa: hesaplar, bakiye, mutabakat, ekstre, kasa sayımı. */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Upload } from 'lucide-react'
import { toast } from 'sonner'
import { BrandLoaderBlock } from '@/components/common/BrandLoader'
import { cn } from '@/lib/utils'
import { A, apiError, dateTR, get, money, params, post, type BankAccount } from './api'
import { Badge, Notice, Section, Table, Td, Th } from './ui'

export function BankingPanel() {
  const [gorunum, setGorunum] = useState<'hesaplar' | 'ekstre'>('hesaplar')

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-lg border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-900">
        {([['hesaplar', 'Hesaplar & mutabakat'], ['ekstre', 'Ekstre & eşleştirme']] as const).map(([id, l]) => (
          <button key={id} onClick={() => setGorunum(id)}
            className={cn('rounded-md px-3 py-1.5 text-sm transition-colors',
              gorunum === id ? 'bg-blue-600 text-white' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800')}>
            {l}
          </button>
        ))}
      </div>
      {gorunum === 'hesaplar' ? <Hesaplar /> : <Ekstreler />}
    </div>
  )
}

function Hesaplar() {
  const qc = useQueryClient()
  const [sayim, setSayim] = useState<Record<string, string>>({})

  const { data, isLoading } = useQuery({
    queryKey: ['acc', 'bank', 'accounts'],
    queryFn: () => get<{ data: BankAccount[] }>(`${A}/banking/accounts`, { params: { with_balance: 1 } }).then(r => r.data),
  })

  const kasaSay = useMutation({
    mutationFn: ({ id, tutar }: { id: string; tutar: number }) =>
      post<{ message: string }>(`${A}/banking/accounts/${id}/cash-counts`, { counted_amount: tutar }),
    onSuccess: (r) => { toast.success(r.message); qc.invalidateQueries({ queryKey: ['acc'] }); setSayim({}) },
    onError: (e) => toast.error(apiError(e)),
  })

  if (isLoading) return <BrandLoaderBlock />
  const hesaplar = data ?? []

  return (
    <div className="space-y-4">
      <Section title="Banka ve kasa hesapları" description={`${hesaplar.length} hesap`}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {hesaplar.map(h => (
            <div key={h.id} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{h.name}</p>
                  <p className="text-xs text-zinc-400">{h.iban ?? h.code} · {h.account_code}</p>
                </div>
                <Badge label={h.type === 'cash' ? 'Kasa' : h.type === 'pos' ? 'POS' : 'Banka'} color={h.type === 'cash' ? 'amber' : 'blue'} />
              </div>
              <p className="mt-2 text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                {money(h.ledger_balance)} <span className="text-xs font-normal text-zinc-400">{h.currency}</span>
              </p>

              {h.type === 'cash' && (
                <div className="mt-2 flex gap-1.5">
                  <input
                    type="number" step="0.01" placeholder="Sayılan"
                    value={sayim[h.id] ?? ''}
                    onChange={e => setSayim(s => ({ ...s, [h.id]: e.target.value }))}
                    className="w-full rounded-md border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                  <button
                    onClick={() => kasaSay.mutate({ id: h.id, tutar: Number(sayim[h.id]) })}
                    disabled={!sayim[h.id] || kasaSay.isPending}
                    className="shrink-0 rounded-md bg-amber-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
                  >
                    Say
                  </button>
                </div>
              )}

              {h.type !== 'cash' && <Mutabakat hesapId={h.id} />}
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}

function Mutabakat({ hesapId }: { hesapId: string }) {
  const { data } = useQuery({
    queryKey: ['acc', 'bank', 'reconcile', hesapId],
    queryFn: () => get<{ data: { ledger_balance: number; statement_balance: number | null; difference: number | null
      unmatched_count: number; unmatched_total: number; reconciled: boolean } }>(`${A}/banking/accounts/${hesapId}/reconcile`).then(r => r.data),
  })

  if (!data || data.statement_balance === null) {
    return <p className="mt-2 text-[11px] text-zinc-400">Ekstre yüklenmemiş; mutabakat yapılamıyor.</p>
  }

  return (
    <div className="mt-2 space-y-0.5 text-[11px]">
      <p className="text-zinc-500">Ekstre: <span className="tabular-nums">{money(data.statement_balance)}</span></p>
      <p className={cn('tabular-nums', data.reconciled ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400')}>
        Fark: {money(data.difference)}
        {data.unmatched_count > 0 && ` · ${data.unmatched_count} eşleşmeyen`}
      </p>
    </div>
  )
}

interface Hareket {
  id: string
  booking_date: string
  amount: string
  direction: 'in' | 'out'
  remittance: string | null
  counterparty_name: string | null
  match_status: string
  match_confidence: number | null
  payment_number?: string | null
}

const ESLESME_ADLARI: Record<string, string> = {
  unmatched: 'Eşleşmedi', suggested: 'Öneri var', matched: 'Eşleşti', ignored: 'Göz ardı',
}

function Ekstreler() {
  const qc = useQueryClient()
  const [hesapId, setHesapId] = useState('')
  const [icerik, setIcerik] = useState('')
  const [bicim, setBicim] = useState('csv')
  const [acikSatir, setAcikSatir] = useState<string | null>(null)

  const hesaplar = useQuery({
    queryKey: ['acc', 'bank', 'accounts', 'picker'],
    queryFn: () => get<{ data: BankAccount[] }>(`${A}/banking/accounts`).then(r => r.data),
  })

  const hareketler = useQuery({
    queryKey: ['acc', 'bank', 'transactions', hesapId],
    queryFn: () => get<{ data: Hareket[] | { data: Hareket[] } }>(`${A}/banking/transactions`, { params: params({ bank_account_id: hesapId, per_page: 100 }) })
      .then(r => (Array.isArray(r.data) ? r.data : r.data.data)),
  })

  const yukle = useMutation({
    mutationFn: () => post<{ message: string }>(`${A}/banking/statements/import`, { bank_account_id: hesapId, format: bicim, content: icerik }),
    onSuccess: (r) => { toast.success(r.message); qc.invalidateQueries({ queryKey: ['acc', 'bank'] }); setIcerik('') },
    onError: (e) => toast.error(apiError(e)),
  })

  const liste = hareketler.data ?? []
  const alan = 'rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100'

  return (
    <div className="space-y-4">
      <Section title="Ekstre yükle" description="CSV ya da CAMT.053 (SEPA XML)">
        <div className="grid gap-3 sm:grid-cols-3">
          <select value={hesapId} onChange={e => setHesapId(e.target.value)} className={alan}>
            <option value="">Hesap seçin</option>
            {(hesaplar.data ?? []).map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
          <select value={bicim} onChange={e => setBicim(e.target.value)} className={alan}>
            <option value="csv">CSV</option>
            <option value="camt053">CAMT.053 XML</option>
          </select>
          <button onClick={() => yukle.mutate()} disabled={!hesapId || !icerik.trim() || yukle.isPending}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            <Upload className="h-4 w-4" /> Yükle
          </button>
        </div>
        <textarea
          value={icerik} onChange={e => setIcerik(e.target.value)}
          rows={4}
          placeholder="Ekstre içeriğini buraya yapıştırın"
          className={`${alan} mt-3 w-full font-mono text-xs`}
        />
        <Notice tone="info">
          Aynı dosya iki kez yüklenemez; dosya özeti ve satır kimliği mükerrer kaydı engeller.
        </Notice>
      </Section>

      <Section title="Ekstre satırları" description={`${liste.length} hareket`}>
        {hareketler.isLoading ? <BrandLoaderBlock /> : (
          <Table
            empty={liste.length === 0}
            head={
              <tr>
                <Th className="w-24">Tarih</Th>
                <Th className="w-28" align="right">Tutar</Th>
                <Th>Açıklama</Th>
                <Th className="w-40">Karşı taraf</Th>
                <Th className="w-32">Durum</Th>
                <Th className="w-24" />
              </tr>
            }
          >
            {liste.map(h => (
              <>
                <tr key={h.id}>
                  <Td className="text-xs">{dateTR(h.booking_date)}</Td>
                  <Td align="right" className={cn('tabular-nums font-medium', h.direction === 'in' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
                    {money(h.amount)}
                  </Td>
                  <Td className="truncate text-xs">{h.remittance ?? '—'}</Td>
                  <Td className="truncate text-xs">{h.counterparty_name ?? '—'}</Td>
                  <Td>
                    <Badge
                      label={ESLESME_ADLARI[h.match_status] ?? h.match_status}
                      color={h.match_status === 'matched' ? 'emerald' : h.match_status === 'suggested' ? 'amber' : h.match_status === 'ignored' ? 'gray' : 'rose'}
                    />
                    {h.payment_number && <div className="mt-0.5 font-mono text-[11px] text-zinc-400">{h.payment_number}</div>}
                  </Td>
                  <Td>
                    {h.match_status !== 'matched' && (
                      <button onClick={() => setAcikSatir(a => a === h.id ? null : h.id)}
                        className="text-xs text-blue-600 hover:underline dark:text-blue-400">
                        {acikSatir === h.id ? 'Kapat' : 'Eşleştir'}
                      </button>
                    )}
                  </Td>
                </tr>
                {acikSatir === h.id && (
                  <tr key={`${h.id}-oneri`}>
                    <Td colSpan={6} className="bg-zinc-50 dark:bg-zinc-800/40">
                      <Oneriler satirId={h.id} onDone={() => { setAcikSatir(null); qc.invalidateQueries({ queryKey: ['acc', 'bank'] }) }} />
                    </Td>
                  </tr>
                )}
              </>
            ))}
          </Table>
        )}
      </Section>
    </div>
  )
}

function Oneriler({ satirId, onDone }: { satirId: string; onDone: () => void }) {
  const [gerekce, setGerekce] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['acc', 'bank', 'suggestions', satirId],
    queryFn: () => get<{ data: { candidates: { type: string; id: string; label: string; date: string; amount: number; partner: string | null; confidence: number; reasons: string[] }[] } }>(
      `${A}/banking/transactions/${satirId}/suggestions`).then(r => r.data),
  })

  const esle = useMutation({
    mutationFn: ({ type, id }: { type: string; id: string }) =>
      post<{ message: string }>(`${A}/banking/transactions/${satirId}/match`, { type, target_id: id }),
    onSuccess: (r) => { toast.success(r.message); onDone() },
    onError: (e) => toast.error(apiError(e)),
  })

  const gozArdi = useMutation({
    mutationFn: () => post<{ message: string }>(`${A}/banking/transactions/${satirId}/ignore`, { reason: gerekce }),
    onSuccess: (r) => { toast.success(r.message); onDone() },
    onError: (e) => toast.error(apiError(e)),
  })

  if (isLoading) return <BrandLoaderBlock size={48} text={null} className="py-3" />

  const adaylar = data?.candidates ?? []

  return (
    <div className="space-y-2 py-2">
      {adaylar.length === 0 ? (
        <p className="text-xs text-zinc-500">Eşleşme adayı bulunamadı.</p>
      ) : adaylar.map(a => (
        <div key={`${a.type}-${a.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
          <div className="min-w-0">
            <p className="text-sm text-zinc-900 dark:text-zinc-100">
              {a.label} <span className="text-xs text-zinc-400">· {dateTR(a.date)} · {money(a.amount)}</span>
            </p>
            <p className="text-[11px] text-zinc-500">{a.reasons.join(' · ')}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn('text-xs font-medium tabular-nums',
              a.confidence >= 70 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400')}>
              %{a.confidence}
            </span>
            <button onClick={() => esle.mutate({ type: a.type, id: a.id })} disabled={esle.isPending}
              className="rounded-md bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              Eşleştir
            </button>
          </div>
        </div>
      ))}

      <div className="flex flex-wrap gap-2 pt-1">
        <input value={gerekce} onChange={e => setGerekce(e.target.value)} placeholder="Göz ardı etme gerekçesi"
          className="min-w-[200px] flex-1 rounded-md border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100" />
        <button onClick={() => gozArdi.mutate()} disabled={gerekce.trim().length < 3 || gozArdi.isPending}
          className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-600 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300">
          Göz ardı et
        </button>
      </div>
    </div>
  )
}
