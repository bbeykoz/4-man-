'use client'

/** Belgeler: satış/alış faturaları, kesme, deftere işleme, iade. */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { BrandLoaderBlock } from '@/components/common/BrandLoader'
import { A, apiError, dateTR, get, money, params, post, type AccountingDocument, type Partner, type TaxCode } from './api'
import { Badge, Money, Notice, Section, Table, Td, Th } from './ui'

const TURLER = [
  { v: 'sales_invoice',      l: 'Satış faturası' },
  { v: 'purchase_invoice',   l: 'Alış faturası' },
  { v: 'sales_credit_note',  l: 'Satış iadesi' },
  { v: 'purchase_credit_note', l: 'Alış iadesi' },
  { v: 'expense',            l: 'Masraf belgesi' },
  { v: 'proforma',           l: 'Proforma' },
]

export function DocumentsPanel() {
  const [secili, setSecili] = useState<string | null>(null)

  return secili
    ? <BelgeDetay id={secili} onBack={() => setSecili(null)} />
    : <BelgeListesi onSelect={setSecili} />
}

function BelgeListesi({ onSelect }: { onSelect: (id: string) => void }) {
  const [filtre, setFiltre] = useState({ direction: '', status: '', number: '', partner_name: '' })
  const [formAcik, setFormAcik] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['acc', 'documents', filtre],
    queryFn: () => get<{ data: AccountingDocument[] | { data: AccountingDocument[] } }>(`${A}/documents`, { params: params({ ...filtre, per_page: 50 }) })
      .then(r => (Array.isArray(r.data) ? r.data : r.data.data)),
  })

  const belgeler = data ?? []
  const alan = 'rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100'

  return (
    <Section
      title="Belgeler"
      description={`${belgeler.length} kayıt`}
      action={
        <button onClick={() => setFormAcik(v => !v)} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">
          <Plus className="h-3.5 w-3.5" /> Belge oluştur
        </button>
      }
    >
      {formAcik && <BelgeFormu onClose={() => setFormAcik(false)} onCreated={onSelect} />}

      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input value={filtre.partner_name} onChange={e => setFiltre(f => ({ ...f, partner_name: e.target.value }))}
            placeholder="Cari unvanı" className={`${alan} w-full pl-9`} />
        </div>
        <input value={filtre.number} onChange={e => setFiltre(f => ({ ...f, number: e.target.value }))}
          placeholder="Belge no" className={`${alan} w-36`} />
        <select value={filtre.direction} onChange={e => setFiltre(f => ({ ...f, direction: e.target.value }))} className={alan}>
          <option value="">Tümü</option>
          <option value="sale">Satış</option>
          <option value="purchase">Alış</option>
        </select>
        <select value={filtre.status} onChange={e => setFiltre(f => ({ ...f, status: e.target.value }))} className={alan}>
          <option value="">Tüm durumlar</option>
          <option value="draft">Taslak</option>
          <option value="issued">Kesildi</option>
          <option value="posted">Deftere işlendi</option>
          <option value="partially_settled">Kısmen kapandı</option>
          <option value="settled">Kapandı</option>
          <option value="cancelled">İptal</option>
        </select>
      </div>

      {isLoading ? <BrandLoaderBlock /> : (
        <Table
          empty={belgeler.length === 0}
          head={
            <tr>
              <Th className="w-36">Belge no</Th>
              <Th className="w-24">Tarih</Th>
              <Th>Cari</Th>
              <Th className="w-28" align="right">Net</Th>
              <Th className="w-28" align="right">KDV</Th>
              <Th className="w-28" align="right">Toplam</Th>
              <Th className="w-28" align="right">Kalan</Th>
              <Th className="w-32">Durum</Th>
            </tr>
          }
        >
          {belgeler.map(b => (
            <tr key={b.id} onClick={() => onSelect(b.id)} className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
              <Td>
                <span className="font-mono text-xs text-blue-600 dark:text-blue-400">{b.full_number}</span>
                <div className="text-[11px] text-zinc-400">{b.type_label}</div>
              </Td>
              <Td className="text-xs">{dateTR(b.issue_date)}</Td>
              <Td className="truncate">{b.partner_name ?? '—'}</Td>
              <Td align="right"><Money value={b.net_amount} /></Td>
              <Td align="right"><Money value={b.tax_amount} /></Td>
              <Td align="right" className="font-medium"><Money value={b.gross_amount} currency={b.currency} /></Td>
              <Td align="right" className={b.is_overdue ? 'text-rose-600 dark:text-rose-400' : undefined}>
                <Money value={b.outstanding} />
              </Td>
              <Td><Badge label={b.status_label} color={b.status_color} /></Td>
            </tr>
          ))}
        </Table>
      )}
    </Section>
  )
}

function BelgeFormu({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const qc = useQueryClient()
  const [baslik, setBaslik] = useState({ doc_type: 'sales_invoice', issue_date: new Date().toISOString().slice(0, 10), partner_id: '', due_date: '' })
  const [satirlar, setSatirlar] = useState([{ description: '', quantity: '1', unit_price: '', tax_code_id: '' }])

  const cariler = useQuery({
    queryKey: ['acc', 'partners', 'picker'],
    queryFn: () => get<{ data: Partner[] | { data: Partner[] } }>(`${A}/partners`, { params: { per_page: 200, active_only: 1 } })
      .then(r => (Array.isArray(r.data) ? r.data : r.data.data)),
  })

  const vergiler = useQuery({
    queryKey: ['acc', 'taxcodes', 'picker'],
    queryFn: () => get<{ data: TaxCode[] }>(`${A}/tax-codes`).then(r => r.data.filter(t => t.is_approved)),
  })

  const olustur = useMutation({
    mutationFn: () => {
      const cari = (cariler.data ?? []).find(c => c.id === baslik.partner_id)
      return post<{ data: AccountingDocument }>(`${A}/documents`, {
        ...baslik,
        due_date: baslik.due_date || undefined,
        partner_name: cari?.legal_name,
        partner_vat_number: cari?.vat_number ?? undefined,
        lines: satirlar.filter(s => s.description && s.unit_price).map(s => ({
          description: s.description,
          quantity: Number(s.quantity || 1),
          unit_price: Number(s.unit_price),
          tax_code_id: s.tax_code_id || undefined,
        })),
      })
    },
    onSuccess: (r) => {
      toast.success('Taslak belge oluşturuldu.')
      qc.invalidateQueries({ queryKey: ['acc', 'documents'] })
      onCreated(r.data.id)
      onClose()
    },
    onError: (e) => toast.error(apiError(e)),
  })

  const alan = 'w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100'

  return (
    <form onSubmit={e => { e.preventDefault(); olustur.mutate() }}
      className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800/40">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">Belge türü</span>
          <select value={baslik.doc_type} onChange={e => setBaslik(b => ({ ...b, doc_type: e.target.value }))} className={alan}>
            {TURLER.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">Belge tarihi</span>
          <input type="date" value={baslik.issue_date} onChange={e => setBaslik(b => ({ ...b, issue_date: e.target.value }))} className={alan} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">Vade</span>
          <input type="date" value={baslik.due_date} onChange={e => setBaslik(b => ({ ...b, due_date: e.target.value }))} className={alan} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">Cari</span>
          <select required value={baslik.partner_id} onChange={e => setBaslik(b => ({ ...b, partner_id: e.target.value }))} className={alan}>
            <option value="">Seçin</option>
            {(cariler.data ?? []).map(c => <option key={c.id} value={c.id}>{c.code} — {c.display_name}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-4 space-y-2">
        {satirlar.map((s, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-12">
            <input placeholder="Açıklama" value={s.description}
              onChange={e => setSatirlar(l => l.map((x, j) => j === i ? { ...x, description: e.target.value } : x))}
              className={`${alan} sm:col-span-5`} />
            <input type="number" step="0.001" placeholder="Miktar" value={s.quantity}
              onChange={e => setSatirlar(l => l.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))}
              className={`${alan} sm:col-span-2`} />
            <input type="number" step="0.01" placeholder="Birim fiyat" value={s.unit_price}
              onChange={e => setSatirlar(l => l.map((x, j) => j === i ? { ...x, unit_price: e.target.value } : x))}
              className={`${alan} sm:col-span-2`} />
            <select value={s.tax_code_id}
              onChange={e => setSatirlar(l => l.map((x, j) => j === i ? { ...x, tax_code_id: e.target.value } : x))}
              className={`${alan} sm:col-span-3`}>
              <option value="">KDV yok</option>
              {(vergiler.data ?? []).map(t => <option key={t.id} value={t.id}>{t.code} (%{t.rate})</option>)}
            </select>
          </div>
        ))}
        <button type="button" onClick={() => setSatirlar(l => [...l, { description: '', quantity: '1', unit_price: '', tax_code_id: '' }])}
          className="text-xs text-blue-600 hover:underline dark:text-blue-400">
          + Satır ekle
        </button>
      </div>

      <Notice tone="info">
        Belge taslak olarak oluşur. Numara, kesme adımında atanır — iptal edilen taslaklar numara atlatmasın diye.
      </Notice>

      <div className="mt-3 flex gap-2">
        <button type="submit" disabled={olustur.isPending}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {olustur.isPending ? 'Oluşturuluyor…' : 'Taslak oluştur'}
        </button>
        <button type="button" onClick={onClose} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm dark:border-zinc-700 dark:text-zinc-300">Vazgeç</button>
      </div>
    </form>
  )
}

function BelgeDetay({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient()
  const [gerekce, setGerekce] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['acc', 'document', id],
    queryFn: () => get<{ data: AccountingDocument }>(`${A}/documents/${id}`).then(r => r.data),
  })

  const eylem = useMutation({
    mutationFn: ({ yol, govde }: { yol: string; govde?: Record<string, unknown> }) =>
      post<{ message: string }>(`${A}/documents/${id}/${yol}`, govde ?? {}),
    onSuccess: (r) => { toast.success(r.message); qc.invalidateQueries({ queryKey: ['acc'] }); setGerekce('') },
    onError: (e) => toast.error(apiError(e)),
  })

  if (isLoading) return <BrandLoaderBlock />
  if (!data) return null
  const b = data
  const dugme = 'rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50'

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
        <ChevronLeft className="h-4 w-4" /> Belge listesine dön
      </button>

      <Section
        title={`${b.type_label} ${b.full_number}`}
        description={`${dateTR(b.issue_date)} · ${b.partner_name ?? 'cari yok'}`}
        action={<Badge label={b.status_label} color={b.status_color} />}
      >
        {b.journal_no && (
          <Notice tone="info">Muhasebe fişi: <strong>{b.journal_no}</strong></Notice>
        )}

        <Table
          head={
            <tr>
              <Th className="w-12" align="center">#</Th>
              <Th>Açıklama</Th>
              <Th className="w-24" align="right">Miktar</Th>
              <Th className="w-28" align="right">Birim fiyat</Th>
              <Th className="w-28" align="right">Net</Th>
              <Th className="w-20" align="right">KDV %</Th>
              <Th className="w-28" align="right">KDV</Th>
              <Th className="w-28" align="right">Toplam</Th>
            </tr>
          }
        >
          {(b.lines ?? []).map(l => (
            <tr key={l.id ?? l.line_no}>
              <Td align="center" className="text-xs text-zinc-400">{l.line_no}</Td>
              <Td>{l.description}</Td>
              <Td align="right" className="tabular-nums">{money(l.quantity, 3)}</Td>
              <Td align="right"><Money value={l.unit_price} /></Td>
              <Td align="right"><Money value={l.net_amount} /></Td>
              <Td align="right" className="text-xs">{l.tax_rate ? `%${l.tax_rate}` : '—'}</Td>
              <Td align="right"><Money value={l.tax_amount} /></Td>
              <Td align="right" className="font-medium"><Money value={l.gross_amount} /></Td>
            </tr>
          ))}
          <tr className="bg-zinc-50 font-medium dark:bg-zinc-800/50">
            <Td colSpan={4} className="text-xs uppercase tracking-wide text-zinc-500">Toplam</Td>
            <Td align="right"><Money value={b.net_amount} /></Td>
            <Td align="right" />
            <Td align="right"><Money value={b.tax_amount} /></Td>
            <Td align="right"><Money value={b.gross_amount} currency={b.currency} /></Td>
          </tr>
        </Table>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {b.status === 'draft' && (
            <>
              <button onClick={() => eylem.mutate({ yol: 'issue' })} disabled={eylem.isPending}
                className={`${dugme} bg-blue-600 text-white hover:bg-blue-700`}>Belgeyi kes</button>
              <button onClick={() => eylem.mutate({ yol: 'post' })} disabled={eylem.isPending}
                className={`${dugme} bg-emerald-600 text-white hover:bg-emerald-700`}>Kes ve deftere işle</button>
            </>
          )}
          {b.status === 'issued' && (
            <button onClick={() => eylem.mutate({ yol: 'post' })} disabled={eylem.isPending}
              className={`${dugme} bg-emerald-600 text-white hover:bg-emerald-700`}>Deftere işle</button>
          )}
          {(b.status === 'draft' || b.status === 'issued') && (
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <input value={gerekce} onChange={e => setGerekce(e.target.value)} placeholder="İptal gerekçesi"
                className="min-w-[180px] flex-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100" />
              <button onClick={() => eylem.mutate({ yol: 'cancel', govde: { reason: gerekce } })}
                disabled={eylem.isPending || gerekce.trim().length < 3}
                className={`${dugme} border border-rose-300 text-rose-700 dark:border-rose-800 dark:text-rose-400`}>
                İptal et
              </button>
            </div>
          )}
          {['posted', 'partially_settled', 'settled'].includes(b.status) && (
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <input value={gerekce} onChange={e => setGerekce(e.target.value)} placeholder="İade gerekçesi"
                className="min-w-[180px] flex-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100" />
              <button onClick={() => eylem.mutate({ yol: 'correct', govde: { reason: gerekce } })}
                disabled={eylem.isPending || gerekce.trim().length < 3}
                className={`${dugme} bg-amber-600 text-white hover:bg-amber-700`}>
                İade belgesi düzenle
              </button>
            </div>
          )}
        </div>
      </Section>
    </div>
  )
}
