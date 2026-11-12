'use client'

/**
 * Muhasebe Müdürü paneli.
 *
 * Müdürün yaptığı iş uzmanınkinden farklı: kayıt girmiyor, onaylıyor ve
 * takılanları çözüyor. Bu yüzden ekran liste değil, bekleyen iş kuyruğu.
 *
 * Her blok kendi API ucundan besleniyor; muhasebe modülündeki panellerin
 * aynısını tekrar yazmıyor, yalnız müdürün karar vereceği kısmı gösteriyor.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { ArrowRight, CheckCircle2, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { BrandLoaderBlock } from '@/components/common/BrandLoader'
import { cn } from '@/lib/utils'
import {
  A, apiError, dateTR, get, params, periodLabel, post,
  type AccountingDocument, type AccountingPeriod, type JournalEntry, type Payment,
} from './api'
import { Badge, Money, Notice, Section, Stat, Table, Td, Th } from './ui'

export function ManagerPanel() {
  return (
    <div className="space-y-4">
      <Onaylar />
      <div className="grid gap-4 lg:grid-cols-2">
        <Donemler />
        <KdvTakvimi />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Mudahale />
        <GorevAyriligi />
      </div>
    </div>
  )
}

/** Durum filtresiyle liste cek; API bazi uclarda sayfali, bazilarinda duz donuyor. */
async function liste<T>(yol: string, status: string): Promise<T[]> {
  const r = await get<{ data: T[] | { data: T[] } }>(yol, { params: { status, per_page: 20 } })
  return Array.isArray(r.data) ? r.data : r.data.data
}

/** Onay bekleyen, onaylanmış ama işlenmemiş fiş/ödeme ve kesilmiş belgeler. */
function Onaylar() {
  const qc = useQueryClient()

  // Onay ve deftere isleme iki ayri adim; ikisini de kuyrukta gosteriyoruz.
  const fisler = useQuery({
    queryKey: ['mgr', 'journals', 'queue'],
    queryFn: async () => {
      const [bekleyen, onayli] = await Promise.all([
        liste<JournalEntry>(`${A}/journal-entries`, 'pending_approval'),
        liste<JournalEntry>(`${A}/journal-entries`, 'approved'),
      ])
      return [
        ...bekleyen.map(x => ({ kayit: x, adim: 'approve' as const })),
        ...onayli.map(x => ({ kayit: x, adim: 'post' as const })),
      ]
    },
  })

  const odemeler = useQuery({
    queryKey: ['mgr', 'payments', 'queue'],
    queryFn: async () => {
      const [bekleyen, onayli] = await Promise.all([
        liste<Payment>(`${A}/banking/payments`, 'pending_approval'),
        liste<Payment>(`${A}/banking/payments`, 'approved'),
      ])
      return [
        ...bekleyen.map(x => ({ kayit: x, adim: 'approve' as const })),
        ...onayli.map(x => ({ kayit: x, adim: 'post' as const })),
      ]
    },
  })

  const belgeler = useQuery({
    queryKey: ['mgr', 'documents', 'issued'],
    queryFn: () => get<{ data: AccountingDocument[] | { data: AccountingDocument[] } }>(`${A}/documents`, {
      params: { status: 'issued', per_page: 20 },
    }).then(r => (Array.isArray(r.data) ? r.data : r.data.data)),
  })

  const eylem = useMutation({
    mutationFn: ({ yol }: { yol: string }) => post<{ message: string }>(`${A}/${yol}`, {}),
    onSuccess: (r) => {
      toast.success(r.message)
      qc.invalidateQueries({ queryKey: ['mgr'] })
      qc.invalidateQueries({ queryKey: ['acc'] })
    },
    onError: (e) => toast.error(apiError(e)),
  })

  const f = fisler.data ?? []
  const o = odemeler.data ?? []
  const b = belgeler.data ?? []
  const toplam = f.length + o.length + b.length

  const dugme = 'rounded-md px-2 py-1 text-xs font-medium disabled:opacity-50'

  return (
    <Section
      title="Onay bekleyenler"
      description={toplam ? `${toplam} kayıt kararınızı bekliyor` : 'Bekleyen onay yok'}
      action={
        <Link href="/modules/accounting?tab=fisler" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400">
          Muhasebe modülü <ArrowRight className="h-3 w-3" />
        </Link>
      }
    >
      {fisler.isLoading || odemeler.isLoading || belgeler.isLoading ? <BrandLoaderBlock size={56} text={null} /> : toplam === 0 ? (
        <div className="flex items-center gap-2 py-6 text-sm text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4" /> Onay kuyruğu boş.
        </div>
      ) : (
        <div className="space-y-4">
          {f.length > 0 && (
            <div>
              <h4 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">Yevmiye fişleri ({f.length})</h4>
              <Table head={<tr><Th className="w-32">Fiş no</Th><Th className="w-24">Tarih</Th><Th>Açıklama</Th><Th className="w-28" align="right">Tutar</Th><Th className="w-24" /></tr>}>
                {f.map(({ kayit: x, adim }) => (
                  <tr key={x.id}>
                    <Td className="font-mono text-xs">{x.journal_no ?? '—'}</Td>
                    <Td className="text-xs">{dateTR(x.posting_date)}</Td>
                    <Td className="truncate">{x.description}</Td>
                    <Td align="right"><Money value={x.total_debit} currency={x.currency} /></Td>
                    <Td>
                      <button onClick={() => eylem.mutate({ yol: `journal-entries/${x.id}/${adim}` })} disabled={eylem.isPending}
                        className={`${dugme} ${adim === 'approve' ? 'bg-indigo-600' : 'bg-emerald-600'} text-white`}>
                        {adim === 'approve' ? 'Onayla' : 'Deftere işle'}
                      </button>
                    </Td>
                  </tr>
                ))}
              </Table>
            </div>
          )}

          {o.length > 0 && (
            <div>
              <h4 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">Ödemeler ({o.length})</h4>
              <Table head={<tr><Th className="w-28">No</Th><Th className="w-24">Tarih</Th><Th>Cari / hesap</Th><Th className="w-28" align="right">Tutar</Th><Th className="w-24" /></tr>}>
                {o.map(({ kayit: x, adim }) => (
                  <tr key={x.id}>
                    <Td className="font-mono text-xs">{x.label}</Td>
                    <Td className="text-xs">{dateTR(x.payment_date)}</Td>
                    <Td className="truncate text-xs">
                      {x.partner_name ?? '—'}
                      <div className="text-[11px] text-zinc-400">{x.bank_account_name}</div>
                    </Td>
                    <Td align="right"><Money value={x.amount} currency={x.currency} /></Td>
                    <Td>
                      <button onClick={() => eylem.mutate({ yol: `banking/payments/${x.id}/${adim}` })} disabled={eylem.isPending}
                        className={`${dugme} ${adim === 'approve' ? 'bg-indigo-600' : 'bg-emerald-600'} text-white`}>
                        {adim === 'approve' ? 'Onayla' : 'Deftere işle'}
                      </button>
                    </Td>
                  </tr>
                ))}
              </Table>
            </div>
          )}

          {b.length > 0 && (
            <div>
              <h4 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
                Kesilmiş, deftere işlenmemiş belgeler ({b.length})
              </h4>
              <Table head={<tr><Th className="w-32">Belge</Th><Th className="w-24">Tarih</Th><Th>Cari</Th><Th className="w-28" align="right">Tutar</Th><Th className="w-24" /></tr>}>
                {b.map(x => (
                  <tr key={x.id}>
                    <Td className="font-mono text-xs">{x.full_number}</Td>
                    <Td className="text-xs">{dateTR(x.issue_date)}</Td>
                    <Td className="truncate">{x.partner_name ?? '—'}</Td>
                    <Td align="right"><Money value={x.gross_amount} currency={x.currency} /></Td>
                    <Td>
                      <button onClick={() => eylem.mutate({ yol: `documents/${x.id}/post` })} disabled={eylem.isPending}
                        className={`${dugme} bg-emerald-600 text-white`}>Deftere işle</button>
                    </Td>
                  </tr>
                ))}
              </Table>
            </div>
          )}
        </div>
      )}
    </Section>
  )
}

/** Dönem durumu: hangi ay açık, hangisi kapanmayı bekliyor. */
function Donemler() {
  const qc = useQueryClient()
  const yil = new Date().getFullYear()

  const { data, isLoading } = useQuery({
    queryKey: ['mgr', 'periods', yil],
    queryFn: () => get<{ data: AccountingPeriod[] }>(`${A}/periods`, { params: { year: yil } }).then(r => r.data),
  })

  const kapat = useMutation({
    mutationFn: (id: string) => post<{ message: string }>(`${A}/periods/${id}/close`, {}),
    onSuccess: (r) => { toast.success(r.message); qc.invalidateQueries({ queryKey: ['mgr'] }) },
    onError: (e) => toast.error(apiError(e)),
  })

  if (isLoading) return <Section title="Dönemler"><BrandLoaderBlock size={56} text={null} /></Section>

  const donemler = data ?? []
  const acik = donemler.filter(d => d.status === 'open')
  const bugun = new Date().toISOString().slice(0, 10)
  // Bitmiş ama hâlâ açık duran dönemler kapatılmayı bekliyor.
  const kapatilabilir = acik.filter(d => d.end_date < bugun)

  return (
    <Section
      title="Dönem durumu"
      description={`${yil} · ${donemler.length} dönem`}
      action={
        <Link href="/modules/accounting?tab=donemler" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400">
          Dönemler <ArrowRight className="h-3 w-3" />
        </Link>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Açık" value={acik.length} />
        <Stat label="Kapalı" value={donemler.filter(d => d.status === 'closed' || d.status === 'locked').length} />
        <Stat label="Kapatılmayı bekleyen" value={kapatilabilir.length}
          tone={kapatilabilir.length > 1 ? 'warning' : 'default'}
          hint={kapatilabilir.length > 1 ? 'Geçmiş dönemler açık kaldıkça rakamlar değişebilir' : undefined} />
      </div>

      {kapatilabilir.length > 0 && (
        <ul className="mt-3 divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
          {kapatilabilir.slice(0, 4).map(d => (
            <li key={d.id} className="flex items-center justify-between gap-2 py-2">
              <span className="text-zinc-700 dark:text-zinc-300">
                {d.name}
                <span className="ml-2 text-xs text-zinc-400">{d.entries_count ?? 0} fiş</span>
              </span>
              <button onClick={() => kapat.mutate(d.id)} disabled={kapat.isPending}
                className="rounded-md bg-zinc-800 px-2 py-1 text-xs font-medium text-white disabled:opacity-50 dark:bg-zinc-700">
                Kapat
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

/** KDV beyan takvimi: eksik dönemler ve son tarihler. */
function KdvTakvimi() {
  const { data, isLoading } = useQuery({
    queryKey: ['mgr', 'vat'],
    queryFn: () => get<{ data: {
      vat_registered: boolean; vat_term: string
      returns: { id: string; period_key: string; status: string; status_label: string; net_payable: number; days_to_due: number; currency: string }[]
      missing_periods: { period_key: string; due_date: string }[]
    } }>(`${A}/vat/overview`).then(r => r.data),
  })

  if (isLoading) return <Section title="KDV"><BrandLoaderBlock size={56} text={null} /></Section>
  const v = data
  if (!v) return null

  return (
    <Section
      title="KDV takvimi"
      description={v.vat_registered ? `${v.vat_term} mükellefi` : 'KDV mükellefi değil'}
      action={
        <Link href="/modules/accounting?tab=kdv" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400">
          KDV merkezi <ArrowRight className="h-3 w-3" />
        </Link>
      }
    >
      {!v.vat_registered ? (
        <Notice tone="info">Şirket KDV mükellefi olarak işaretli değil; beyan üretilmiyor.</Notice>
      ) : (
        <>
          {v.missing_periods.length > 0 && (
            <Notice tone="warning">
              {v.missing_periods.length} dönemin beyanı hazırlanmamış:{' '}
              {v.missing_periods.slice(0, 4).map(m => periodLabel(m.period_key)).join(', ')}
              {v.missing_periods.length > 4 && ` ve ${v.missing_periods.length - 4} tane daha`}
            </Notice>
          )}

          {v.returns.length === 0 ? (
            <p className="py-4 text-sm text-zinc-500">Henüz beyan hazırlanmamış.</p>
          ) : (
            <Table head={<tr><Th>Dönem</Th><Th className="w-28" align="right">Net</Th><Th className="w-28" align="center">Son tarih</Th><Th className="w-28">Durum</Th></tr>}>
              {v.returns.slice(0, 6).map(r => (
                <tr key={r.id}>
                  <Td>{periodLabel(r.period_key)}</Td>
                  <Td align="right"><Money value={r.net_payable} currency={r.currency} /></Td>
                  <Td align="center" className="text-xs">
                    {r.days_to_due < 0 && r.status === 'draft'
                      ? <span className="text-rose-600 dark:text-rose-400">{Math.abs(r.days_to_due)} gün geçti</span>
                      : r.days_to_due <= 7 && r.status === 'draft'
                        ? <span className="text-amber-600 dark:text-amber-400">{r.days_to_due} gün</span>
                        : '—'}
                  </Td>
                  <Td>
                    <Badge label={r.status_label}
                      color={r.status === 'submitted' || r.status === 'accepted' ? 'emerald' : r.status === 'rejected' ? 'rose' : 'amber'} />
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </>
      )}
    </Section>
  )
}

/** Takılanlar: depo köprüsü istisnaları, eşleşmemiş ekstre, onaysız vergi kodu. */
function Mudahale() {
  const qc = useQueryClient()

  const kopru = useQuery({
    queryKey: ['mgr', 'bridge'],
    queryFn: () => get<{ data: { pending: number; needs_attention: number; oldest_pending: string | null } }>(
      `${A}/inventory-bridge/status`).then(r => r.data),
  })

  const ekstre = useQuery({
    queryKey: ['mgr', 'bank', 'unmatched'],
    queryFn: () => get<{ data: unknown[]; meta?: { total?: number } }>(`${A}/banking/transactions`, {
      params: params({ unmatched_only: true, per_page: 1 }),
    }).then(r => r.meta?.total ?? r.data.length),
  })

  const vergi = useQuery({
    queryKey: ['mgr', 'taxcodes', 'draft'],
    queryFn: () => get<{ data: { id: string; is_approved: boolean }[] }>(`${A}/tax-codes`)
      .then(r => r.data.filter(t => !t.is_approved).length),
  })

  const isle = useMutation({
    mutationFn: () => post<{ message: string }>(`${A}/inventory-bridge/process`, {}),
    onSuccess: (r) => { toast.success(r.message); qc.invalidateQueries({ queryKey: ['mgr'] }) },
    onError: (e) => toast.error(apiError(e)),
  })

  const k = kopru.data
  const sorunVar = (k?.needs_attention ?? 0) > 0 || (ekstre.data ?? 0) > 0 || (vergi.data ?? 0) > 0

  return (
    <Section
      title="Müdahale gerekenler"
      description={sorunVar ? 'Takılan kayıtlar var' : 'Takılan kayıt yok'}
    >
      {kopru.isLoading ? <BrandLoaderBlock size={56} text={null} /> : (
        <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
          <SatirIs
            etiket="Depo olayı bekliyor"
            deger={k?.pending ?? 0}
            aciklama={k?.oldest_pending ? `En eski ${dateTR(k.oldest_pending)}` : undefined}
            eylem={(k?.pending ?? 0) > 0 ? { metin: 'Şimdi işle', calistir: () => isle.mutate(), bekliyor: isle.isPending } : undefined}
          />
          <SatirIs
            etiket="Depo olayı takıldı"
            deger={k?.needs_attention ?? 0}
            aciklama="Kapalı dönem ya da eksik hesap eşlemesi"
            link="/modules/accounting?tab=depo-koprusu"
            kritik
          />
          <SatirIs
            etiket="Eşleşmemiş ekstre satırı"
            deger={ekstre.data ?? 0}
            link="/modules/accounting?tab=banka"
          />
          <SatirIs
            etiket="Onaysız vergi kodu"
            deger={vergi.data ?? 0}
            aciklama="Onaysız kod fişte kullanılamaz"
            link="/modules/accounting?tab=kurulum"
          />
        </ul>
      )}
    </Section>
  )
}

function SatirIs({
  etiket, deger, aciklama, link, eylem, kritik,
}: {
  etiket: string
  deger: number
  aciklama?: string
  link?: string
  eylem?: { metin: string; calistir: () => void; bekliyor: boolean }
  kritik?: boolean
}) {
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <span className="min-w-0">
        <span className={cn('text-zinc-700 dark:text-zinc-300', deger > 0 && kritik && 'text-rose-700 dark:text-rose-400')}>
          {etiket}
        </span>
        {aciklama && deger > 0 && <span className="block text-[11px] text-zinc-400">{aciklama}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span className={cn('tabular-nums font-medium',
          deger === 0 ? 'text-zinc-300 dark:text-zinc-600'
            : kritik ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-900 dark:text-zinc-100')}>
          {deger}
        </span>
        {deger > 0 && eylem && (
          <button onClick={eylem.calistir} disabled={eylem.bekliyor}
            className="rounded-md bg-blue-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-50">
            {eylem.metin}
          </button>
        )}
        {deger > 0 && link && (
          <Link href={link} className="text-xs text-blue-600 hover:underline dark:text-blue-400">Aç</Link>
        )}
      </span>
    </li>
  )
}

/** Görev ayrılığı özeti; müdürün görmesi gereken kontrol. */
function GorevAyriligi() {
  const { data, isLoading } = useQuery({
    queryKey: ['mgr', 'duty'],
    queryFn: () => get<{ data: {
      users: { user_id: string; user_name: string; conflicts: { label: string; severity: string; excepted: boolean }[] }[]
      summary: { users_checked: number; users_with_conflicts: number; blocking?: number; warning?: number; excepted: number }
    } }>(`${A}/authorization/duty-report`).then(r => r.data),
  })

  if (isLoading) return <Section title="Görev ayrılığı"><BrandLoaderBlock size={56} text={null} /></Section>
  const d = data
  if (!d) return null

  const engelleyici = d.summary.blocking ?? 0

  return (
    <Section
      title="Görev ayrılığı"
      description={`${d.summary.users_checked} kullanıcı incelendi`}
      action={
        <Link href="/modules/accounting?tab=yetkiler" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400">
          Yetkiler <ArrowRight className="h-3 w-3" />
        </Link>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Çakışmalı kullanıcı" value={d.summary.users_with_conflicts}
          tone={d.summary.users_with_conflicts ? 'warning' : 'positive'} />
        <Stat label="Engelleyici" value={engelleyici} tone={engelleyici ? 'negative' : 'positive'} />
        <Stat label="İstisnalı" value={d.summary.excepted} />
      </div>

      {d.users.length === 0 ? (
        <div className="mt-3 flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4" /> Çakışma yok.
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
          {d.users.slice(0, 4).map(k => (
            <li key={k.user_id} className="flex items-start justify-between gap-2 py-2">
              <span className="min-w-0">
                <span className="text-zinc-700 dark:text-zinc-300">{k.user_name}</span>
                <span className="block text-[11px] text-zinc-400">
                  {k.conflicts.map(c => c.label).join(' · ')}
                </span>
              </span>
              {k.conflicts.some(c => c.severity === 'blocking' && !c.excepted) && (
                <ShieldAlert className="h-4 w-4 shrink-0 text-rose-500" />
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
