'use client'

/** Tahsilat ve ödemeler: oluşturma, belgeye dağıtma, onay, deftere işleme. */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { BrandLoaderBlock } from '@/components/common/BrandLoader'
import { A, apiError, dateTR, get, money, params, post, type AccountingDocument, type BankAccount, type Partner, type Payment } from './api'
import { Badge, Money, Notice, Section, Table, Td, Th } from './ui'

const DURUM_ADLARI: Record<string, string> = {
  draft: 'Taslak', pending_approval: 'Onay bekliyor', approved: 'Onaylandı',
  posted: 'Deftere işlendi', cancelled: 'İptal',
}

const DURUM_RENKLERI: Record<string, string> = {
  draft: 'gray', pending_approval: 'amber', approved: 'indigo', posted: 'emerald', cancelled: 'rose',
}

export function PaymentsPanel() {
  const qc = useQueryClient()
  const [yon, setYon] = useState('')
  const [formAcik, setFormAcik] = useState(false)
  const [acik, setAcik] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['acc', 'payments', yon],
    queryFn: () => get<{ data: Payment[] | { data: Payment[] } }>(`${A}/banking/payments`, { params: params({ direction: yon, per_page: 50 }) })
      .then(r => (Array.isArray(r.data) ? r.data : r.data.data)),
  })

  const eylem = useMutation({
    mutationFn: ({ id, yol }: { id: string; yol: string }) => post<{ message: string }>(`${A}/banking/payments/${id}/${yol}`, {}),
    onSuccess: (r) => { toast.success(r.message); qc.invalidateQueries({ queryKey: ['acc'] }) },
    onError: (e) => toast.error(apiError(e)),
  })

  const odemeler = data ?? []
  const dugme = 'rounded-md px-2 py-1 text-xs font-medium disabled:opacity-50'

  return (
    <Section
      title="Tahsilat ve ödemeler"
      description={`${odemeler.length} kayıt`}
      action={
        <div className="flex items-center gap-2">
          <select value={yon} onChange={e => setYon(e.target.value)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
            <option value="">Tümü</option>
            <option value="in">Tahsilat</option>
            <option value="out">Ödeme</option>
          </select>
          <button onClick={() => setFormAcik(v => !v)} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">
            <Plus className="h-3.5 w-3.5" /> Yeni
          </button>
        </div>
      }
    >
      {formAcik && <OdemeFormu onClose={() => setFormAcik(false)} />}

      {isLoading ? <BrandLoaderBlock /> : (
        <Table
          empty={odemeler.length === 0}
          head={
            <tr>
              <Th className="w-32">No</Th>
              <Th className="w-24">Tarih</Th>
              <Th className="w-24">Yön</Th>
              <Th>Cari / hesap</Th>
              <Th className="w-28" align="right">Tutar</Th>
              <Th className="w-28" align="right">Dağıtılmamış</Th>
              <Th className="w-32">Durum</Th>
              <Th className="w-40">İşlem</Th>
            </tr>
          }
        >
          {odemeler.map(o => (
            <tr key={o.id}>
              <Td className="font-mono text-xs">{o.label}</Td>
              <Td className="text-xs">{dateTR(o.payment_date)}</Td>
              <Td>
                <Badge label={o.direction_label} color={o.direction === 'in' ? 'emerald' : 'rose'} />
              </Td>
              <Td className="truncate text-xs">
                {o.partner_name ?? '—'}
                <div className="text-[11px] text-zinc-400">{o.bank_account_name}</div>
              </Td>
              <Td align="right"><Money value={o.amount} currency={o.currency} /></Td>
              <Td align="right" className={o.unallocated ? 'text-amber-600 dark:text-amber-400' : undefined}>
                <Money value={o.unallocated} />
              </Td>
              <Td>
                <Badge label={DURUM_ADLARI[o.status] ?? o.status} color={DURUM_RENKLERI[o.status]} />
                {o.journal_no && <div className="mt-0.5 font-mono text-[11px] text-zinc-400">{o.journal_no}</div>}
              </Td>
              <Td>
                <div className="flex flex-wrap gap-1.5">
                  {o.status === 'draft' && (
                    <>
                      <button onClick={() => setAcik(a => a === o.id ? null : o.id)} className={`${dugme} border border-zinc-200 dark:border-zinc-700 dark:text-zinc-300`}>
                        Dağıt
                      </button>
                      <button onClick={() => eylem.mutate({ id: o.id, yol: 'submit' })} disabled={eylem.isPending}
                        className={`${dugme} bg-blue-600 text-white`}>Onaya gönder</button>
                    </>
                  )}
                  {o.status === 'pending_approval' && (
                    <button onClick={() => eylem.mutate({ id: o.id, yol: 'approve' })} disabled={eylem.isPending}
                      className={`${dugme} bg-indigo-600 text-white`}>Onayla</button>
                  )}
                  {(o.status === 'approved' || o.status === 'draft') && (
                    <button onClick={() => eylem.mutate({ id: o.id, yol: 'post' })} disabled={eylem.isPending}
                      className={`${dugme} bg-emerald-600 text-white`}>Deftere işle</button>
                  )}
                </div>
                {acik === o.id && <Dagitim odemeId={o.id} onDone={() => setAcik(null)} />}
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </Section>
  )
}

function OdemeFormu({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    direction: 'in', bank_account_id: '', partner_id: '', counter_account_id: '',
    payment_date: new Date().toISOString().slice(0, 10), amount: '', bank_charge: '', reference: '',
  })

  const hesaplar = useQuery({
    queryKey: ['acc', 'bank', 'accounts', 'picker'],
    queryFn: () => get<{ data: BankAccount[] }>(`${A}/banking/accounts`, { params: { active_only: 1 } }).then(r => r.data),
  })

  const cariler = useQuery({
    queryKey: ['acc', 'partners', 'picker'],
    queryFn: () => get<{ data: Partner[] | { data: Partner[] } }>(`${A}/partners`, { params: { per_page: 200, active_only: 1 } })
      .then(r => (Array.isArray(r.data) ? r.data : r.data.data)),
  })

  const kaydet = useMutation({
    mutationFn: () => post(`${A}/banking/payments`, {
      ...form,
      amount: Number(form.amount),
      bank_charge: form.bank_charge ? Number(form.bank_charge) : undefined,
      partner_id: form.partner_id || undefined,
      counter_account_id: form.counter_account_id || undefined,
    }),
    onSuccess: () => { toast.success('Ödeme taslağı oluşturuldu.'); qc.invalidateQueries({ queryKey: ['acc', 'payments'] }); onClose() },
    onError: (e) => toast.error(apiError(e)),
  })

  const alan = 'w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100'

  return (
    <form onSubmit={e => { e.preventDefault(); kaydet.mutate() }}
      className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800/40">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">Yön</span>
          <select value={form.direction} onChange={e => setForm(f => ({ ...f, direction: e.target.value }))} className={alan}>
            <option value="in">Tahsilat (para girişi)</option>
            <option value="out">Ödeme (para çıkışı)</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">Hesap</span>
          <select required value={form.bank_account_id} onChange={e => setForm(f => ({ ...f, bank_account_id: e.target.value }))} className={alan}>
            <option value="">Seçin</option>
            {(hesaplar.data ?? []).map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">Tarih</span>
          <input type="date" value={form.payment_date} onChange={e => setForm(f => ({ ...f, payment_date: e.target.value }))} className={alan} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">Tutar</span>
          <input required type="number" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className={alan} />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">Cari (boş bırakılabilir)</span>
          <select value={form.partner_id} onChange={e => setForm(f => ({ ...f, partner_id: e.target.value }))} className={alan}>
            <option value="">Cari yok</option>
            {(cariler.data ?? []).map(c => <option key={c.id} value={c.id}>{c.code} — {c.display_name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">Banka masrafı</span>
          <input type="number" step="0.01" value={form.bank_charge} onChange={e => setForm(f => ({ ...f, bank_charge: e.target.value }))} className={alan} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">Referans</span>
          <input value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} className={alan} />
        </label>
      </div>

      <Notice tone="info">
        Cari seçilmezse ve tutar bir belgeye dağıtılmazsa karşı hesap seçmek gerekir. Kasaya sermaye koyma, banka faizi gibi hareketler böyledir.
      </Notice>

      <div className="mt-3 flex gap-2">
        <button type="submit" disabled={kaydet.isPending}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {kaydet.isPending ? 'Kaydediliyor…' : 'Taslak oluştur'}
        </button>
        <button type="button" onClick={onClose} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm dark:border-zinc-700 dark:text-zinc-300">Vazgeç</button>
      </div>
    </form>
  )
}

function Dagitim({ odemeId, onDone }: { odemeId: string; onDone: () => void }) {
  const qc = useQueryClient()
  const [tutarlar, setTutarlar] = useState<Record<string, string>>({})

  const odeme = useQuery({
    queryKey: ['acc', 'payment', odemeId],
    queryFn: () => get<{ data: Payment & { partner_id?: string | null } }>(`${A}/banking/payments/${odemeId}`).then(r => r.data),
  })

  const belgeler = useQuery({
    enabled: !!odeme.data?.partner_id,
    queryKey: ['acc', 'documents', 'open', odeme.data?.partner_id],
    queryFn: () => get<{ data: AccountingDocument[] | { data: AccountingDocument[] } }>(`${A}/documents`, {
      params: { partner_id: odeme.data?.partner_id, open_only: 1, per_page: 50 },
    }).then(r => (Array.isArray(r.data) ? r.data : r.data.data)),
  })

  const dagit = useMutation({
    mutationFn: () => post<{ message: string }>(`${A}/banking/payments/${odemeId}/allocate`, {
      allocations: Object.entries(tutarlar)
        .filter(([, v]) => Number(v) > 0)
        .map(([document_id, v]) => ({ document_id, amount: Number(v) })),
    }),
    onSuccess: (r) => { toast.success(r.message); qc.invalidateQueries({ queryKey: ['acc'] }); onDone() },
    onError: (e) => toast.error(apiError(e)),
  })

  if (!odeme.data?.partner_id) {
    return <p className="mt-2 text-[11px] text-zinc-500">Dağıtım için ödemede cari seçili olmalı.</p>
  }

  const liste = belgeler.data ?? []

  return (
    <div className="mt-2 space-y-1.5 rounded-md border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-900">
      {liste.length === 0 ? (
        <p className="text-[11px] text-zinc-500">Bu carinin açık belgesi yok.</p>
      ) : (
        <>
          {liste.map(b => (
            <div key={b.id} className="flex items-center gap-2">
              <span className="flex-1 truncate text-[11px] text-zinc-600 dark:text-zinc-400">
                {b.full_number} · kalan {money(b.outstanding)}
              </span>
              <input
                type="number" step="0.01" max={b.outstanding}
                value={tutarlar[b.id] ?? ''}
                onChange={e => setTutarlar(t => ({ ...t, [b.id]: e.target.value }))}
                className="w-24 rounded border border-zinc-200 px-2 py-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>
          ))}
          <button onClick={() => dagit.mutate()} disabled={dagit.isPending}
            className="w-full rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            Dağıtımı kaydet
          </button>
        </>
      )}
    </div>
  )
}
