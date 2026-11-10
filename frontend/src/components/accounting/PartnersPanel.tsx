'use client'

/** Cari hesaplar: liste, kart, ekstre, açık kalem, yaşlandırma, mahsup. */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { BrandLoaderBlock } from '@/components/common/BrandLoader'
import { cn } from '@/lib/utils'
import { A, apiError, dateTR, get, money, params, post, type Partner } from './api'
import { Badge, Money, Notice, Section, Table, Td, Th } from './ui'

export function PartnersPanel() {
  const [secili, setSecili] = useState<string | null>(null)
  const [gorunum, setGorunum] = useState<'liste' | 'yaslandirma'>('liste')

  if (secili) return <CariDetay id={secili} onBack={() => setSecili(null)} />

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-lg border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-900">
        {([['liste', 'Cari listesi'], ['yaslandirma', 'Yaşlandırma']] as const).map(([id, l]) => (
          <button
            key={id}
            onClick={() => setGorunum(id)}
            className={cn('rounded-md px-3 py-1.5 text-sm transition-colors',
              gorunum === id ? 'bg-blue-600 text-white' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800')}
          >
            {l}
          </button>
        ))}
      </div>

      {gorunum === 'liste' ? <CariListesi onSelect={setSecili} /> : <Yaslandirma />}
    </div>
  )
}

function CariListesi({ onSelect }: { onSelect: (id: string) => void }) {
  const [arama, setArama] = useState('')
  const [rol, setRol] = useState('')
  const [formAcik, setFormAcik] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['acc', 'partners', arama, rol],
    queryFn: () => get<{ data: Partner[] | { data: Partner[] } }>(`${A}/partners`, {
      params: params({ search: arama, customers: rol === 'customer', suppliers: rol === 'supplier', per_page: 50 }),
    }).then(r => (Array.isArray(r.data) ? r.data : r.data.data)),
  })

  const cariler = data ?? []

  return (
    <Section
      title="Cari hesaplar"
      description={`${cariler.length} kayıt`}
      action={
        <button onClick={() => setFormAcik(v => !v)} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">
          <Plus className="h-3.5 w-3.5" /> Cari ekle
        </button>
      }
    >
      {formAcik && <CariFormu onClose={() => setFormAcik(false)} />}

      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            value={arama}
            onChange={e => setArama(e.target.value)}
            placeholder="Unvan, kod, KDV numarası"
            className="w-full rounded-lg border border-zinc-200 bg-white py-2 pl-9 pr-3 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>
        <select value={rol} onChange={e => setRol(e.target.value)} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
          <option value="">Tüm cariler</option>
          <option value="customer">Müşteriler</option>
          <option value="supplier">Tedarikçiler</option>
        </select>
      </div>

      {isLoading ? <BrandLoaderBlock /> : (
        <Table
          empty={cariler.length === 0}
          head={
            <tr>
              <Th className="w-24">Kod</Th>
              <Th>Unvan</Th>
              <Th className="w-32">Vergi no</Th>
              <Th className="w-32">Rol</Th>
              <Th className="w-24" align="center">Vade</Th>
            </tr>
          }
        >
          {cariler.map(c => (
            <tr key={c.id} onClick={() => onSelect(c.id)} className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
              <Td className="font-mono text-xs text-blue-600 dark:text-blue-400">{c.code}</Td>
              <Td>
                <div className="text-zinc-900 dark:text-zinc-100">{c.display_name}</div>
                {c.trade_name && c.trade_name !== c.legal_name && <div className="text-xs text-zinc-400">{c.legal_name}</div>}
              </Td>
              <Td className="font-mono text-xs">{c.vat_number ?? '—'}</Td>
              <Td>
                <div className="flex flex-wrap gap-1">
                  {c.is_customer && <Badge label="Müşteri" color="blue" />}
                  {c.is_supplier && <Badge label="Tedarikçi" color="amber" />}
                  {c.is_blocked && <Badge label="Bloke" color="rose" />}
                </div>
              </Td>
              <Td align="center" className="text-xs">{c.payment_days ? `${c.payment_days} gün` : '—'}</Td>
            </tr>
          ))}
        </Table>
      )}
    </Section>
  )
}

function CariFormu({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    legal_name: '', vat_number: '', registration_number: '',
    is_customer: true, is_supplier: false, payment_days: '',
  })

  const kaydet = useMutation({
    mutationFn: () => post(`${A}/partners`, {
      ...form,
      payment_days: form.payment_days ? Number(form.payment_days) : undefined,
    }),
    onSuccess: () => {
      toast.success('Cari oluşturuldu.')
      qc.invalidateQueries({ queryKey: ['acc', 'partners'] })
      onClose()
    },
    onError: (e) => toast.error(apiError(e)),
  })

  const alan = 'w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100'

  return (
    <form onSubmit={e => { e.preventDefault(); kaydet.mutate() }}
      className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800/40">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">Resmi unvan</span>
          <input required value={form.legal_name} onChange={e => setForm(f => ({ ...f, legal_name: e.target.value }))} className={alan} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">Sicil / vergi no</span>
          <input value={form.registration_number} onChange={e => setForm(f => ({ ...f, registration_number: e.target.value }))} className={alan} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">KDV numarası</span>
          <input value={form.vat_number} onChange={e => setForm(f => ({ ...f, vat_number: e.target.value }))} className={alan} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">Vade (gün)</span>
          <input type="number" min={0} value={form.payment_days} onChange={e => setForm(f => ({ ...f, payment_days: e.target.value }))} className={alan} />
        </label>
        <div className="flex items-end gap-4 sm:col-span-2">
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input type="checkbox" checked={form.is_customer} onChange={e => setForm(f => ({ ...f, is_customer: e.target.checked }))} className="rounded" />
            Müşteri
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input type="checkbox" checked={form.is_supplier} onChange={e => setForm(f => ({ ...f, is_supplier: e.target.checked }))} className="rounded" />
            Tedarikçi
          </label>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <button type="submit" disabled={kaydet.isPending} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {kaydet.isPending ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
        <button type="button" onClick={onClose} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm dark:border-zinc-700 dark:text-zinc-300">Vazgeç</button>
      </div>
    </form>
  )
}

function CariDetay({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient()
  const [mahsupTutar, setMahsupTutar] = useState('')
  const [mahsupGerekce, setMahsupGerekce] = useState('')

  const kart = useQuery({
    queryKey: ['acc', 'partner', id],
    queryFn: () => get<{ data: Partner; balance: { balance: number; receivable: number; payable: number; currency: string }
      credit: { credit_limit: number | null; open_receivable: number; available: number | null; exceeds_limit: boolean } }>(`${A}/partners/${id}`),
  })

  const ekstre = useQuery({
    queryKey: ['acc', 'partner', id, 'statement'],
    queryFn: () => get<{ data: { opening_balance: number; closing_balance: number
      movements: { date: string; journal_no: string; document_number?: string | null; description: string; debit: number; credit: number; running_balance: number }[] } }>(
      `${A}/partners/${id}/statement`).then(r => r.data),
  })

  const acik = useQuery({
    queryKey: ['acc', 'partner', id, 'open'],
    queryFn: () => get<{ data: { items: { document_id: string; number: string; doc_type: string; due_date: string | null; gross_amount: number; outstanding: number; days_overdue: number; is_overdue: boolean }[] } }>(
      `${A}/partners/${id}/open-items`).then(r => r.data),
  })

  const mahsupOneri = useQuery({
    queryKey: ['acc', 'partner', id, 'offset'],
    queryFn: () => get<{ data: { receivable_total: number; payable_total: number; offsettable: number; possible: boolean; currency: string } }>(
      `${A}/partners/${id}/offset-proposal`).then(r => r.data),
  })

  const mahsupYap = useMutation({
    mutationFn: () => post(`${A}/partners/${id}/offset`, { amount: Number(mahsupTutar), reason: mahsupGerekce }),
    onSuccess: () => {
      toast.success('Mahsup kaydedildi.')
      qc.invalidateQueries({ queryKey: ['acc'] })
      setMahsupTutar(''); setMahsupGerekce('')
    },
    onError: (e) => toast.error(apiError(e)),
  })

  if (kart.isLoading) return <BrandLoaderBlock />
  const c = kart.data?.data
  const b = kart.data?.balance
  const k = kart.data?.credit
  if (!c) return null

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
        <ChevronLeft className="h-4 w-4" /> Cari listesine dön
      </button>

      <Section
        title={c.display_name}
        description={`${c.code} · ${c.vat_number ?? 'KDV numarası yok'} · ${c.country_code}`}
        action={
          <div className="flex gap-1">
            {c.is_customer && <Badge label="Müşteri" color="blue" />}
            {c.is_supplier && <Badge label="Tedarikçi" color="amber" />}
            {c.is_blocked && <Badge label="Bloke" color="rose" />}
          </div>
        }
      >
        {c.is_blocked && <Notice tone="danger">Bu cari bloke; yeni belge kesilemez.</Notice>}

        <div className="grid gap-3 sm:grid-cols-4">
          <StatMini label="Bakiye" value={`${money(b?.balance)} ${b?.currency ?? ''}`} />
          <StatMini label="Alacak" value={money(b?.receivable)} />
          <StatMini label="Borç" value={money(b?.payable)} />
          <StatMini
            label="Kredi limiti"
            value={k?.credit_limit ? `${money(k.available)} / ${money(k.credit_limit)}` : '—'}
            tone={k?.exceeds_limit ? 'negative' : undefined}
          />
        </div>
      </Section>

      {mahsupOneri.data?.possible && (
        <Section title="Mahsup" description={`Alacak ${money(mahsupOneri.data.receivable_total)} · Borç ${money(mahsupOneri.data.payable_total)}`}>
          <Notice tone="info">
            Bu carinin hem alacağı hem borcu var. En fazla <strong>{money(mahsupOneri.data.offsettable)} {mahsupOneri.data.currency}</strong> mahsup edilebilir.
          </Notice>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              type="number" step="0.01" value={mahsupTutar}
              onChange={e => setMahsupTutar(e.target.value)}
              placeholder="Tutar"
              className="w-32 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <input
              value={mahsupGerekce} onChange={e => setMahsupGerekce(e.target.value)}
              placeholder="Gerekçe"
              className="min-w-[200px] flex-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <button
              onClick={() => mahsupYap.mutate()}
              disabled={mahsupYap.isPending || !mahsupTutar || mahsupGerekce.trim().length < 3}
              className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Mahsup et
            </button>
          </div>
        </Section>
      )}

      <Section title="Açık kalemler" description={`${acik.data?.items.length ?? 0} belge`}>
        {acik.isLoading ? <BrandLoaderBlock size={48} text={null} /> : (
          <Table
            empty={(acik.data?.items.length ?? 0) === 0}
            head={
              <tr>
                <Th className="w-36">Belge</Th>
                <Th className="w-24">Vade</Th>
                <Th className="w-28" align="right">Tutar</Th>
                <Th className="w-28" align="right">Kalan</Th>
                <Th className="w-28" align="center">Gecikme</Th>
              </tr>
            }
          >
            {(acik.data?.items ?? []).map(i => (
              <tr key={i.document_id} className={i.is_overdue ? 'bg-rose-50/60 dark:bg-rose-950/20' : undefined}>
                <Td className="font-mono text-xs">{i.number}</Td>
                <Td className="text-xs">{dateTR(i.due_date)}</Td>
                <Td align="right"><Money value={i.gross_amount} /></Td>
                <Td align="right" className="font-medium"><Money value={i.outstanding} /></Td>
                <Td align="center" className="text-xs">
                  {i.is_overdue ? <span className="text-rose-600 dark:text-rose-400">{i.days_overdue} gün</span> : '—'}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title="Cari ekstresi">
        {ekstre.isLoading ? <BrandLoaderBlock size={48} text={null} /> : ekstre.data && (
          <Table
            empty={ekstre.data.movements.length === 0}
            head={
              <tr>
                <Th className="w-24">Tarih</Th>
                <Th className="w-28">Fiş / belge</Th>
                <Th>Açıklama</Th>
                <Th className="w-28" align="right">Borç</Th>
                <Th className="w-28" align="right">Alacak</Th>
                <Th className="w-28" align="right">Bakiye</Th>
              </tr>
            }
          >
            <tr className="bg-zinc-50 text-xs dark:bg-zinc-800/50">
              <Td colSpan={5} className="text-zinc-500">Açılış bakiyesi</Td>
              <Td align="right"><Money value={ekstre.data.opening_balance} /></Td>
            </tr>
            {ekstre.data.movements.map((m, i) => (
              <tr key={i}>
                <Td className="text-xs">{dateTR(m.date)}</Td>
                <Td className="font-mono text-xs">{m.document_number ?? m.journal_no}</Td>
                <Td className="truncate">{m.description}</Td>
                <Td align="right"><Money value={m.debit} /></Td>
                <Td align="right"><Money value={m.credit} /></Td>
                <Td align="right" className="font-medium"><Money value={m.running_balance} /></Td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </div>
  )
}

function Yaslandirma() {
  const [yon, setYon] = useState('customer')

  const { data, isLoading } = useQuery({
    queryKey: ['acc', 'ageing', yon],
    queryFn: () => get<{ data: {
      partners: { partner_id: string; partner_code: string; partner_name: string; not_due: number; d_0_30: number; d_31_60: number; d_61_90: number; d_90_plus: number; total: number; overdue_total: number }[]
      totals: Record<string, number>; currency: string; buckets: Record<string, string>
    } }>(`${A}/partners/ageing`, { params: { direction: yon } }).then(r => r.data),
  })

  if (isLoading) return <BrandLoaderBlock />
  if (!data) return null

  return (
    <Section
      title="Yaşlandırma"
      description={`${data.partners.length} cari · toplam ${money(data.totals.total)} ${data.currency}`}
      action={
        <select value={yon} onChange={e => setYon(e.target.value)} className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
          <option value="customer">Müşteri alacakları</option>
          <option value="supplier">Tedarikçi borçları</option>
        </select>
      }
    >
      <Table
        empty={data.partners.length === 0}
        head={
          <tr>
            <Th className="w-24">Kod</Th>
            <Th>Cari</Th>
            <Th className="w-28" align="right">Vadesi gelmedi</Th>
            <Th className="w-24" align="right">0–30</Th>
            <Th className="w-24" align="right">31–60</Th>
            <Th className="w-24" align="right">61–90</Th>
            <Th className="w-24" align="right">90+</Th>
            <Th className="w-28" align="right">Toplam</Th>
          </tr>
        }
      >
        {data.partners.map(p => (
          <tr key={p.partner_id}>
            <Td className="font-mono text-xs">{p.partner_code}</Td>
            <Td>{p.partner_name}</Td>
            <Td align="right"><Money value={p.not_due} /></Td>
            <Td align="right"><Money value={p.d_0_30} /></Td>
            <Td align="right"><Money value={p.d_31_60} /></Td>
            <Td align="right" className="text-amber-600 dark:text-amber-400"><Money value={p.d_61_90} /></Td>
            <Td align="right" className="text-rose-600 dark:text-rose-400"><Money value={p.d_90_plus} /></Td>
            <Td align="right" className="font-medium"><Money value={p.total} /></Td>
          </tr>
        ))}
        <tr className="bg-zinc-50 font-medium dark:bg-zinc-800/50">
          <Td colSpan={2} className="text-xs uppercase tracking-wide text-zinc-500">Toplam</Td>
          <Td align="right"><Money value={data.totals.not_due} /></Td>
          <Td align="right"><Money value={data.totals.d_0_30} /></Td>
          <Td align="right"><Money value={data.totals.d_31_60} /></Td>
          <Td align="right"><Money value={data.totals.d_61_90} /></Td>
          <Td align="right"><Money value={data.totals.d_90_plus} /></Td>
          <Td align="right"><Money value={data.totals.total} /></Td>
        </tr>
      </Table>
    </Section>
  )
}

function StatMini({ label, value, tone }: { label: string; value: string; tone?: 'negative' }) {
  return (
    <div className="rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className={cn('mt-0.5 text-sm font-medium tabular-nums', tone === 'negative' ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-900 dark:text-zinc-100')}>{value}</p>
    </div>
  )
}
