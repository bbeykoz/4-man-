'use client'

/**
 * Yevmiye fişleri: liste, detay, durum geçişleri, ters kayıt.
 *
 * Durum geçişleri ayrı düğmeler; tek bir "kaydet" yok çünkü her geçişin
 * kendi kuralı ve denetim kaydı var.
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, RotateCcw, Search } from 'lucide-react'
import { toast } from 'sonner'
import { BrandLoaderBlock } from '@/components/common/BrandLoader'
import { A, apiError, dateTR, dateTimeTR, get, params, post, type JournalEntry } from './api'
import { Badge, Money, Notice, Section, Table, Td, Th } from './ui'

const DURUMLAR = [
  { v: '',                 l: 'Tüm durumlar' },
  { v: 'draft',            l: 'Taslak' },
  { v: 'validated',        l: 'Doğrulandı' },
  { v: 'pending_approval', l: 'Onay bekliyor' },
  { v: 'approved',         l: 'Onaylandı' },
  { v: 'posted',           l: 'Deftere işlendi' },
  { v: 'reversed',         l: 'Ters kayıtlı' },
  { v: 'cancelled',        l: 'İptal' },
]

export function JournalPanel() {
  const [secili, setSecili] = useState<string | null>(null)

  return secili
    ? <FisDetay id={secili} onBack={() => setSecili(null)} />
    : <FisListesi onSelect={setSecili} />
}

function FisListesi({ onSelect }: { onSelect: (id: string) => void }) {
  const [filtre, setFiltre] = useState({ status: '', search: '', date_from: '', date_to: '' })

  const { data, isLoading } = useQuery({
    queryKey: ['acc', 'journal', filtre],
    queryFn: () => get<{ data: JournalEntry[] }>(`${A}/journal-entries`, { params: params(filtre) })
      .then(r => (Array.isArray(r.data) ? r.data : (r.data as { data?: JournalEntry[] })?.data ?? [])),
  })

  const fisler = data ?? []
  const alan = 'rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100'

  return (
    <Section title="Yevmiye fişleri" description={`${fisler.length} kayıt`}>
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            value={filtre.search}
            onChange={e => setFiltre(f => ({ ...f, search: e.target.value }))}
            placeholder="Açıklama ya da referans"
            className={`${alan} w-full pl-9`}
          />
        </div>
        <select value={filtre.status} onChange={e => setFiltre(f => ({ ...f, status: e.target.value }))} className={alan}>
          {DURUMLAR.map(d => <option key={d.v} value={d.v}>{d.l}</option>)}
        </select>
        <input type="date" value={filtre.date_from} onChange={e => setFiltre(f => ({ ...f, date_from: e.target.value }))} className={alan} />
        <input type="date" value={filtre.date_to} onChange={e => setFiltre(f => ({ ...f, date_to: e.target.value }))} className={alan} />
      </div>

      {isLoading ? <BrandLoaderBlock /> : (
        <Table
          empty={fisler.length === 0}
          head={
            <tr>
              <Th className="w-32">Fiş no</Th>
              <Th className="w-24">Tarih</Th>
              <Th>Açıklama</Th>
              <Th className="w-28">Tür</Th>
              <Th className="w-32" align="right">Tutar</Th>
              <Th className="w-32">Durum</Th>
            </tr>
          }
        >
          {fisler.map(f => (
            <tr
              key={f.id}
              onClick={() => onSelect(f.id)}
              className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
            >
              <Td className="font-mono text-xs text-blue-600 dark:text-blue-400">{f.label}</Td>
              <Td className="text-xs">{dateTR(f.posting_date)}</Td>
              <Td>
                <div className="truncate text-zinc-900 dark:text-zinc-100">{f.description}</div>
                {f.reference && <div className="text-xs text-zinc-400">{f.reference}</div>}
              </Td>
              <Td className="text-xs">{f.type_label}</Td>
              <Td align="right"><Money value={f.total_debit} currency={f.currency} /></Td>
              <Td><Badge label={f.status_label} color={f.status_color} /></Td>
            </tr>
          ))}
        </Table>
      )}
    </Section>
  )
}

function FisDetay({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient()
  const [gerekce, setGerekce] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['acc', 'journal', id],
    queryFn: () => get<{ data: JournalEntry; audit: { action: string; occurred_at: string; reason?: string }[] }>(`${A}/journal-entries/${id}`),
  })

  const gecis = useMutation({
    mutationFn: ({ yol, govde }: { yol: string; govde?: Record<string, unknown> }) =>
      post<{ message?: string }>(`${A}/journal-entries/${id}/${yol}`, govde ?? {}),
    onSuccess: (r) => {
      toast.success(r.message ?? 'İşlem tamamlandı.')
      qc.invalidateQueries({ queryKey: ['acc'] })
      setGerekce('')
    },
    onError: (e) => toast.error(apiError(e)),
  })

  if (isLoading) return <BrandLoaderBlock />
  if (!data) return null

  const f = data.data
  const denetim = data.audit ?? []

  const dugme = 'rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50'

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
        <ChevronLeft className="h-4 w-4" /> Fiş listesine dön
      </button>

      <Section
        title={f.label}
        description={`${f.type_label} · ${dateTR(f.posting_date)} · ${f.description}`}
        action={<Badge label={f.status_label} color={f.status_color} />}
      >
        <div className="mb-4 grid gap-3 sm:grid-cols-4">
          <Stat2 label="Belge tarihi" value={dateTR(f.document_date)} />
          <Stat2 label="Deftere giriş" value={dateTR(f.posting_date)} />
          <Stat2 label="Dönem" value={f.period_name ?? '—'} />
          <Stat2 label="Kaynak" value={f.source_type} />
        </div>

        {!f.is_balanced && <Notice tone="danger">Fiş dengeli değil; borç ve alacak toplamları eşit olmalı.</Notice>}

        {(f.reversal_of_no || f.reversed_by_no) && (
          <Notice tone="warning">
            {f.reversal_of_no && <>Bu fiş <strong>{f.reversal_of_no}</strong> numaralı fişin ters kaydıdır.</>}
            {f.reversed_by_no && <>Bu fiş <strong>{f.reversed_by_no}</strong> numaralı ters kayıtla kapatılmıştır.</>}
          </Notice>
        )}

        <Table
          head={
            <tr>
              <Th className="w-12" align="center">#</Th>
              <Th className="w-24">Hesap</Th>
              <Th>Açıklama</Th>
              <Th className="w-32" align="right">Borç</Th>
              <Th className="w-32" align="right">Alacak</Th>
            </tr>
          }
        >
          {(f.lines ?? []).map(l => (
            <tr key={l.id ?? l.line_no}>
              <Td align="center" className="text-xs text-zinc-400">{l.line_no}</Td>
              <Td className="font-mono text-xs">{l.account_code}</Td>
              <Td>
                <div className="text-zinc-900 dark:text-zinc-100">{l.description || l.account_name}</div>
                {l.dimensions && Object.keys(l.dimensions).length > 0 && (
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {Object.entries(l.dimensions).map(([k, v]) => (
                      <Badge key={k} label={`${k}: ${String(v).slice(0, 8)}`} color="gray" />
                    ))}
                  </div>
                )}
              </Td>
              <Td align="right"><Money value={l.debit} /></Td>
              <Td align="right"><Money value={l.credit} /></Td>
            </tr>
          ))}
          <tr className="bg-zinc-50 font-medium dark:bg-zinc-800/50">
            <Td colSpan={3} className="text-xs uppercase tracking-wide text-zinc-500">Toplam</Td>
            <Td align="right"><Money value={f.total_debit} /></Td>
            <Td align="right"><Money value={f.total_credit} /></Td>
          </tr>
        </Table>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {f.status === 'draft' && (
            <button onClick={() => gecis.mutate({ yol: 'submit-approval' })} disabled={gecis.isPending}
              className={`${dugme} bg-blue-600 text-white hover:bg-blue-700`}>Onaya gönder</button>
          )}
          {f.status === 'pending_approval' && (
            <button onClick={() => gecis.mutate({ yol: 'approve' })} disabled={gecis.isPending}
              className={`${dugme} bg-indigo-600 text-white hover:bg-indigo-700`}>Onayla</button>
          )}
          {f.status === 'approved' && (
            <button onClick={() => gecis.mutate({ yol: 'post' })} disabled={gecis.isPending}
              className={`${dugme} bg-emerald-600 text-white hover:bg-emerald-700`}>Deftere işle</button>
          )}
          {f.status === 'posted' && (
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <input
                value={gerekce}
                onChange={e => setGerekce(e.target.value)}
                placeholder="Ters kayıt gerekçesi"
                className="min-w-[200px] flex-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
              <button
                onClick={() => gecis.mutate({ yol: 'reverse', govde: { reason: gerekce } })}
                disabled={gecis.isPending || gerekce.trim().length < 3}
                className={`${dugme} inline-flex items-center gap-1 bg-rose-600 text-white hover:bg-rose-700`}
              >
                <RotateCcw className="h-3.5 w-3.5" /> Ters kayıt
              </button>
            </div>
          )}
        </div>
      </Section>

      {denetim.length > 0 && (
        <Section title="Denetim kaydı" description={`${denetim.length} olay`}>
          <ul className="divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            {denetim.map((d, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2">
                <span className="font-mono text-xs text-zinc-600 dark:text-zinc-400">{d.action}</span>
                <span className="flex items-center gap-3">
                  {d.reason && <span className="text-xs text-zinc-500">{d.reason}</span>}
                  <span className="text-xs text-zinc-400">{dateTimeTR(d.occurred_at)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}

function Stat2({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-0.5 text-sm text-zinc-900 dark:text-zinc-100">{value}</p>
    </div>
  )
}
