'use client'

/** KDV merkezi: defterler, VIES, beyan hazırlama ve gönderim. */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { BrandLoaderBlock } from '@/components/common/BrandLoader'
import { cn } from '@/lib/utils'
import { A, apiError, dateTR, get, money, periodLabel, post } from './api'
import { Badge, Money, Notice, Section, Stat, Table, Td, Th } from './ui'

type Gorunum = 'beyanlar' | 'satis' | 'alis' | 'vies'

export function VatPanel() {
  const bugun = new Date()
  const varsayilanDonem = `${bugun.getFullYear()}-${String(bugun.getMonth() + 1).padStart(2, '0')}`

  const [gorunum, setGorunum] = useState<Gorunum>('beyanlar')
  const [donem, setDonem] = useState(varsayilanDonem)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-900">
          {([['beyanlar', 'Beyanlar'], ['satis', 'Satış defteri'], ['alis', 'Alış defteri'], ['vies', 'VIES']] as const).map(([id, l]) => (
            <button key={id} onClick={() => setGorunum(id)}
              className={cn('rounded-md px-3 py-1.5 text-sm transition-colors',
                gorunum === id ? 'bg-blue-600 text-white' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800')}>
              {l}
            </button>
          ))}
        </div>
        <input
          type="month" value={donem} onChange={e => setDonem(e.target.value)}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>

      {gorunum === 'beyanlar' && <Beyanlar donem={donem} />}
      {gorunum === 'satis'    && <Defter tip="sales-book" donem={donem} baslik="Satış defteri" />}
      {gorunum === 'alis'     && <Defter tip="purchase-book" donem={donem} baslik="Alış defteri" />}
      {gorunum === 'vies'     && <Vies donem={donem} />}
    </div>
  )
}

interface Beyan {
  id: string
  period_key: string
  due_date: string
  days_to_due: number
  output_tax: number
  input_tax: number
  net_payable: number
  is_payable: boolean
  sales_count: number
  purchase_count: number
  status: string
  status_label: string
  journal_entry_id: string | null
  boxes?: Record<string, { base: number; tax: number }>
  validation_issues?: { errors: { code: string; message: string }[]; warnings: { code: string; message: string }[]; ok: boolean }
  drift?: { needs_correction: boolean; output_drift: number; input_drift: number; declared_output: number; current_output: number }
}

function Beyanlar({ donem }: { donem: string }) {
  const qc = useQueryClient()
  const [secili, setSecili] = useState<string | null>(null)
  const [referans, setReferans] = useState('')

  const liste = useQuery({
    queryKey: ['acc', 'vat', 'returns'],
    queryFn: () => get<{ data: Beyan[] | { data: Beyan[] } }>(`${A}/vat/returns`)
      .then(r => (Array.isArray(r.data) ? r.data : r.data.data)),
  })

  const detay = useQuery({
    enabled: !!secili,
    queryKey: ['acc', 'vat', 'return', secili],
    queryFn: () => get<{ data: Beyan }>(`${A}/vat/returns/${secili}`).then(r => r.data),
  })

  const hazirla = useMutation({
    mutationFn: () => post<{ data: Beyan; message: string }>(`${A}/vat/returns`, { period_key: donem }),
    onSuccess: (r) => {
      toast.success(r.message)
      qc.invalidateQueries({ queryKey: ['acc', 'vat'] })
      setSecili(r.data.id)
    },
    onError: (e) => toast.error(apiError(e)),
  })

  const gonder = useMutation({
    mutationFn: (id: string) => post<{ message: string }>(`${A}/vat/returns/${id}/submit`, { reference: referans || undefined }),
    onSuccess: (r) => { toast.success(r.message); qc.invalidateQueries({ queryKey: ['acc', 'vat'] }); setReferans('') },
    onError: (e) => toast.error(apiError(e)),
  })

  const beyanlar = liste.data ?? []
  const d = detay.data

  return (
    <div className="space-y-4">
      <Section
        title="KDV beyanları"
        description={`${beyanlar.length} dönem`}
        action={
          <button onClick={() => hazirla.mutate()} disabled={hazirla.isPending}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {periodLabel(donem)} beyanını hazırla
          </button>
        }
      >
        {liste.isLoading ? <BrandLoaderBlock /> : (
          <Table
            empty={beyanlar.length === 0}
            head={
              <tr>
                <Th className="w-32">Dönem</Th>
                <Th className="w-28">Son tarih</Th>
                <Th className="w-28" align="right">Hesaplanan</Th>
                <Th className="w-28" align="right">İndirilecek</Th>
                <Th className="w-28" align="right">Net</Th>
                <Th className="w-28">Durum</Th>
              </tr>
            }
          >
            {beyanlar.map(b => (
              <tr key={b.id} onClick={() => setSecili(b.id)}
                className={cn('cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50', secili === b.id && 'bg-blue-50/60 dark:bg-blue-950/20')}>
                <Td className="font-medium">{periodLabel(b.period_key)}</Td>
                <Td className="text-xs">
                  {dateTR(b.due_date)}
                  {b.days_to_due < 0 && b.status === 'draft' && <span className="ml-1 text-rose-600 dark:text-rose-400">geçti</span>}
                </Td>
                <Td align="right"><Money value={b.output_tax} /></Td>
                <Td align="right"><Money value={b.input_tax} /></Td>
                <Td align="right" className={cn('font-medium', b.is_payable ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400')}>
                  {money(b.net_payable)}
                </Td>
                <Td><Badge label={b.status_label} color={b.status === 'submitted' || b.status === 'accepted' ? 'emerald' : b.status === 'rejected' ? 'rose' : 'amber'} /></Td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      {secili && (detay.isLoading ? <BrandLoaderBlock /> : d && (
        <Section title={`${periodLabel(d.period_key)} beyanı`} description={`${d.sales_count} satış · ${d.purchase_count} alış belgesi`}>
          {d.drift?.needs_correction && (
            <Notice tone="warning">
              Beyan gönderildikten sonra defter değişti. Beyan edilen hesaplanan KDV {money(d.drift.declared_output)},
              güncel defter {money(d.drift.current_output)} ({money(d.drift.output_drift)} fark). Düzeltme beyanı gerekebilir.
            </Notice>
          )}

          {d.validation_issues && (
            <div className="mb-3 space-y-2">
              {d.validation_issues.errors.map((h, i) => <Notice key={i} tone="danger">{h.message}</Notice>)}
              {d.validation_issues.warnings.map((u, i) => <Notice key={i} tone="warning">{u.message}</Notice>)}
              {d.validation_issues.ok && d.validation_issues.warnings.length === 0 && (
                <Notice tone="info">Kontroller temiz; beyan gönderilebilir.</Notice>
              )}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Hesaplanan KDV" value={money(d.output_tax)} />
            <Stat label="İndirilecek KDV" value={money(d.input_tax)} />
            <Stat label="Net" value={money(d.net_payable)} tone={d.is_payable ? 'negative' : 'positive'}
              hint={d.is_payable ? 'Ödenecek' : 'Devreden'} />
            <Stat label="Son tarih" value={dateTR(d.due_date)} tone={d.days_to_due < 0 ? 'negative' : 'default'} />
          </div>

          {d.boxes && Object.keys(d.boxes).length > 0 && (
            <div className="mt-4">
              <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Beyan kutuları</h4>
              <Table head={<tr><Th>Kutu</Th><Th className="w-32" align="right">Matrah</Th><Th className="w-32" align="right">Vergi</Th></tr>}>
                {Object.entries(d.boxes).map(([kod, v]) => (
                  <tr key={kod}>
                    <Td className="font-mono text-xs">{kod}</Td>
                    <Td align="right"><Money value={v.base} /></Td>
                    <Td align="right"><Money value={v.tax} /></Td>
                  </tr>
                ))}
              </Table>
            </div>
          )}

          {d.status === 'draft' || d.status === 'validated' ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <input
                value={referans} onChange={e => setReferans(e.target.value)}
                placeholder="Kurum makbuz / referans no"
                className="min-w-[220px] flex-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
              <button
                onClick={() => gonder.mutate(d.id)}
                disabled={gonder.isPending || !d.validation_issues?.ok}
                className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                title={d.validation_issues?.ok ? undefined : 'Önce kontrol hatalarını giderin'}
              >
                Gönderildi olarak işaretle
              </button>
            </div>
          ) : (
            <p className="mt-4 text-xs text-zinc-500">
              Beyan {d.status_label.toLowerCase()}. {d.journal_entry_id && 'Tahakkuk fişi üretildi.'}
            </p>
          )}
        </Section>
      ))}
    </div>
  )
}

function Defter({ tip, donem, baslik }: { tip: 'sales-book' | 'purchase-book'; donem: string; baslik: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['acc', 'vat', tip, donem],
    queryFn: () => get<{ data: {
      lines: { document_number: string; tax_date: string; partner_name: string | null; tax_code: string | null; treatment_label: string | null; report_box: string | null; base: number; tax: number; is_correction: boolean }[]
      totals: { base: number; tax: number; deductible: number; line_count: number; document_count: number }
      boxes: Record<string, { base: number; tax: number }>
      currency: string
    } }>(`${A}/vat/${tip}`, { params: { period_key: donem } }).then(r => r.data),
  })

  if (isLoading) return <BrandLoaderBlock />
  if (!data) return null

  return (
    <Section title={`${baslik} — ${periodLabel(donem)}`}
      description={`${data.totals.document_count} belge · ${data.totals.line_count} satır · matrah ${money(data.totals.base)} ${data.currency}`}>
      <Table
        empty={data.lines.length === 0}
        head={
          <tr>
            <Th className="w-32">Belge</Th>
            <Th className="w-24">Vergi tarihi</Th>
            <Th>Cari</Th>
            <Th className="w-32">Vergi kodu</Th>
            <Th className="w-24">Kutu</Th>
            <Th className="w-28" align="right">Matrah</Th>
            <Th className="w-28" align="right">Vergi</Th>
          </tr>
        }
      >
        {data.lines.map((l, i) => (
          <tr key={i} className={l.is_correction ? 'bg-amber-50/50 dark:bg-amber-950/10' : undefined}>
            <Td className="font-mono text-xs">{l.document_number}</Td>
            <Td className="text-xs">{dateTR(l.tax_date)}</Td>
            <Td className="truncate">{l.partner_name ?? '—'}</Td>
            <Td className="text-xs">{l.tax_code ?? '—'}<div className="text-[11px] text-zinc-400">{l.treatment_label}</div></Td>
            <Td className="font-mono text-[11px]">{l.report_box ?? '—'}</Td>
            <Td align="right"><Money value={l.base} /></Td>
            <Td align="right"><Money value={l.tax} /></Td>
          </tr>
        ))}
        <tr className="bg-zinc-50 font-medium dark:bg-zinc-800/50">
          <Td colSpan={5} className="text-xs uppercase tracking-wide text-zinc-500">Toplam</Td>
          <Td align="right"><Money value={data.totals.base} /></Td>
          <Td align="right"><Money value={data.totals.tax} /></Td>
        </tr>
      </Table>
    </Section>
  )
}

function Vies({ donem }: { donem: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['acc', 'vat', 'vies', donem],
    queryFn: () => get<{ data: {
      entries: { direction: string; partner_name: string | null; vat_number: string | null; country: string | null; base: number; document_count: number; issues: string[] }[]
      totals: { sales_base: number; purchase_base: number; partner_count: number }
      issues: number
    } }>(`${A}/vat/vies`, { params: { period_key: donem } }).then(r => r.data),
  })

  if (isLoading) return <BrandLoaderBlock />
  if (!data) return null

  return (
    <Section title={`VIES — ${periodLabel(donem)}`}
      description={`${data.totals.partner_count} cari · AB teslim ${money(data.totals.sales_base)} · AB alım ${money(data.totals.purchase_base)}`}>
      {data.issues > 0 && <Notice tone="danger">{data.issues} kayıtta eksik bilgi var; bildirim reddedilebilir.</Notice>}

      <Table
        empty={data.entries.length === 0}
        head={
          <tr>
            <Th className="w-24">Yön</Th>
            <Th>Cari</Th>
            <Th className="w-36">KDV numarası</Th>
            <Th className="w-20" align="center">Ülke</Th>
            <Th className="w-28" align="right">Matrah</Th>
            <Th>Sorun</Th>
          </tr>
        }
      >
        {data.entries.map((e, i) => (
          <tr key={i}>
            <Td className="text-xs">{e.direction === 'sales' ? 'Teslim' : 'Alım'}</Td>
            <Td>{e.partner_name ?? '—'}</Td>
            <Td className="font-mono text-xs">{e.vat_number ?? '—'}</Td>
            <Td align="center" className="text-xs">{e.country ?? '—'}</Td>
            <Td align="right"><Money value={e.base} /></Td>
            <Td className="text-xs text-rose-600 dark:text-rose-400">{e.issues.join(' ')}</Td>
          </tr>
        ))}
      </Table>
    </Section>
  )
}
