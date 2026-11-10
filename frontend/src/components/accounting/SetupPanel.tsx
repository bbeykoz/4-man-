'use client'

/** Kurulum: tek adımda kurulum, hesap rolleri, numara serileri, vergi kodları. */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { BrandLoaderBlock } from '@/components/common/BrandLoader'
import { cn } from '@/lib/utils'
import { A, apiError, dateTR, get, post, type ChartAccount, type TaxCode } from './api'
import { Badge, Notice, Section, Table, Td, Th } from './ui'

export function SetupPanel() {
  const [gorunum, setGorunum] = useState<'genel' | 'roller' | 'seriler' | 'vergi'>('genel')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 rounded-lg border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-900">
        {([['genel', 'Genel kurulum'], ['roller', 'Hesap rolleri'], ['seriler', 'Numara serileri'], ['vergi', 'Vergi kodları']] as const).map(([id, l]) => (
          <button key={id} onClick={() => setGorunum(id)}
            className={cn('rounded-md px-3 py-1.5 text-sm transition-colors',
              gorunum === id ? 'bg-blue-600 text-white' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800')}>
            {l}
          </button>
        ))}
      </div>

      {gorunum === 'genel'   && <Genel />}
      {gorunum === 'roller'  && <Roller />}
      {gorunum === 'seriler' && <Seriler />}
      {gorunum === 'vergi'   && <VergiKodlari />}
    </div>
  )
}

function Genel() {
  const qc = useQueryClient()
  const [yil, setYil] = useState(new Date().getFullYear())

  const { data, isLoading } = useQuery({
    queryKey: ['acc', 'setup', 'status'],
    queryFn: () => get<{ data: { country_code: string; functional_currency: string; timezone: string
      chart_accounts: number; periods: number; tax_codes: number; tax_codes_approved: number
      document_series: number; missing_roles: string[]; ready_for_documents: boolean } }>(`${A}/setup/status`).then(r => r.data),
  })

  const kur = useMutation({
    mutationFn: () => post<{ message: string }>(`${A}/setup/bootstrap`, { year: yil }),
    onSuccess: (r) => { toast.success(r.message); qc.invalidateQueries({ queryKey: ['acc'] }) },
    onError: (e) => toast.error(apiError(e)),
  })

  if (isLoading) return <BrandLoaderBlock />
  const s = data
  if (!s) return null

  return (
    <Section
      title="Tek adımda kurulum"
      description={`${s.country_code} · ${s.functional_currency} · ${s.timezone}`}
      action={
        <div className="flex items-center gap-2">
          <input type="number" value={yil} onChange={e => setYil(Number(e.target.value))}
            className="w-24 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100" />
          <button onClick={() => kur.mutate()} disabled={kur.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            <Wand2 className="h-3.5 w-3.5" /> Kurulumu çalıştır
          </button>
        </div>
      }
    >
      <Notice tone="info">
        Kurulum hesap planını, dönemleri, vergi kodlarını, hesap rollerini, numara serilerini ve banka/kasa hesaplarını
        ülke paketinden kurar. Var olanlara dokunmaz, yalnız eksikleri tamamlar.
      </Notice>

      <div className="mt-3 grid gap-2 text-sm">
        {([
          ['Hesap planı', s.chart_accounts, 'hesap'],
          ['Muhasebe dönemi', s.periods, 'dönem'],
          ['Vergi kodu', `${s.tax_codes_approved}/${s.tax_codes}`, 'onaylı'],
          ['Numara serisi', s.document_series, 'seri'],
        ] as const).map(([l, v, suf]) => (
          <div key={l} className="flex items-center justify-between border-b border-zinc-100 py-1.5 dark:border-zinc-800">
            <span className="text-zinc-600 dark:text-zinc-400">{l}</span>
            <span className="tabular-nums text-zinc-900 dark:text-zinc-100">{v} <span className="text-xs text-zinc-400">{suf}</span></span>
          </div>
        ))}
      </div>

      {s.missing_roles.length > 0 && (
        <Notice tone="warning">
          Eksik hesap rolleri: {s.missing_roles.join(', ')}. Belge kesmeden önce eşlenmeli.
        </Notice>
      )}
    </Section>
  )
}

function Roller() {
  const qc = useQueryClient()
  const [secim, setSecim] = useState<Record<string, string>>({})

  const roller = useQuery({
    queryKey: ['acc', 'setup', 'roles'],
    queryFn: () => get<{ data: { role: string; label: string; account_id: string | null; account_code: string | null; account_name: string | null; required: boolean; mapped: boolean }[] }>(
      `${A}/setup/roles`).then(r => r.data),
  })

  const hesaplar = useQuery({
    queryKey: ['acc', 'chart', 'all'],
    queryFn: () => get<{ data: ChartAccount[] }>(`${A}/chart-accounts`, { params: { all: 1 } }).then(r => r.data),
  })

  const ata = useMutation({
    mutationFn: ({ role, account_id }: { role: string; account_id: string }) => post<{ message: string }>(`${A}/setup/roles`, { role, account_id }),
    onSuccess: (r) => { toast.success(r.message); qc.invalidateQueries({ queryKey: ['acc', 'setup'] }); setSecim({}) },
    onError: (e) => toast.error(apiError(e)),
  })

  if (roller.isLoading) return <BrandLoaderBlock />

  return (
    <Section title="Hesap rolleri" description="Kod hiçbir yerde hesap numarası bilmez; rolü sorar">
      <Table
        head={<tr><Th>Rol</Th><Th className="w-48">Eşlenen hesap</Th><Th className="w-64">Değiştir</Th></tr>}
      >
        {(roller.data ?? []).map(r => (
          <tr key={r.role} className={!r.mapped && r.required ? 'bg-rose-50/50 dark:bg-rose-950/20' : undefined}>
            <Td>
              {r.label}
              {r.required && <span className="ml-2 text-[11px] text-rose-600 dark:text-rose-400">zorunlu</span>}
            </Td>
            <Td className="text-xs">
              {r.account_code ? <span className="font-mono">{r.account_code}</span> : <span className="text-zinc-400">eşlenmemiş</span>}
              {r.account_name && <div className="text-zinc-400">{r.account_name}</div>}
            </Td>
            <Td>
              <div className="flex gap-1.5">
                <select
                  value={secim[r.role] ?? ''}
                  onChange={e => setSecim(s => ({ ...s, [r.role]: e.target.value }))}
                  className="min-w-0 flex-1 rounded-md border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                >
                  <option value="">Hesap seçin</option>
                  {(hesaplar.data ?? []).map(h => <option key={h.id} value={h.id}>{h.code} — {h.name}</option>)}
                </select>
                <button onClick={() => ata.mutate({ role: r.role, account_id: secim[r.role] })}
                  disabled={!secim[r.role] || ata.isPending}
                  className="shrink-0 rounded-md bg-blue-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-50">
                  Ata
                </button>
              </div>
            </Td>
          </tr>
        ))}
      </Table>
    </Section>
  )
}

function Seriler() {
  const { data, isLoading } = useQuery({
    queryKey: ['acc', 'setup', 'series'],
    queryFn: () => get<{ data: { id: string; doc_type: string; type_label: string; code: string; name: string; prefix: string; padding: number; reset_yearly: boolean; is_default: boolean; is_active: boolean; documents_count: number }[] }>(
      `${A}/setup/series`).then(r => r.data),
  })

  if (isLoading) return <BrandLoaderBlock />

  return (
    <Section title="Numara serileri" description="Numara belge kesilirken atanır; atlamasız sıra zorunlu">
      <Table
        head={<tr><Th>Belge türü</Th><Th className="w-20">Seri</Th><Th className="w-32">Ön ek</Th><Th className="w-24" align="center">Hane</Th><Th className="w-24" align="center">Belge</Th><Th className="w-32">Özellik</Th></tr>}
      >
        {(data ?? []).map(s => (
          <tr key={s.id}>
            <Td>{s.type_label}</Td>
            <Td className="font-mono text-xs">{s.code}</Td>
            <Td className="font-mono text-xs">{s.prefix}</Td>
            <Td align="center" className="text-xs">{s.padding}</Td>
            <Td align="center" className="text-xs">{s.documents_count}</Td>
            <Td>
              <div className="flex flex-wrap gap-1">
                {s.is_default && <Badge label="Varsayılan" color="blue" />}
                {s.reset_yearly && <Badge label="Yıllık sıfırlanır" color="gray" />}
                {!s.is_active && <Badge label="Pasif" color="rose" />}
              </div>
            </Td>
          </tr>
        ))}
      </Table>
    </Section>
  )
}

function VergiKodlari() {
  const qc = useQueryClient()
  const [tumSurumler, setTumSurumler] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['acc', 'taxcodes', tumSurumler],
    queryFn: () => get<{ data: TaxCode[] }>(`${A}/tax-codes`, { params: tumSurumler ? { all_versions: 1 } : {} }).then(r => r.data),
  })

  const onayla = useMutation({
    mutationFn: (id: string) => post<{ message: string }>(`${A}/tax-codes/${id}/approve`, {}),
    onSuccess: (r) => { toast.success(r.message); qc.invalidateQueries({ queryKey: ['acc', 'taxcodes'] }) },
    onError: (e) => toast.error(apiError(e)),
  })

  const kur = useMutation({
    mutationFn: () => post<{ message: string }>(`${A}/tax-codes/install-template`, {}),
    onSuccess: (r) => { toast.success(r.message); qc.invalidateQueries({ queryKey: ['acc', 'taxcodes'] }) },
    onError: (e) => toast.error(apiError(e)),
  })

  if (isLoading) return <BrandLoaderBlock />
  const kodlar = data ?? []
  const onaysiz = kodlar.filter(k => !k.is_approved).length

  return (
    <Section
      title="Vergi kodları"
      description={`${kodlar.length} kod · ${onaysiz} onay bekliyor`}
      action={
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
            <input type="checkbox" checked={tumSurumler} onChange={e => setTumSurumler(e.target.checked)} className="rounded" />
            Tüm sürümler
          </label>
          <button onClick={() => kur.mutate()} disabled={kur.isPending}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">
            Ülke şablonunu kur
          </button>
        </div>
      }
    >
      {onaysiz > 0 && (
        <Notice tone="warning">
          {onaysiz} vergi kodu onaylanmamış. Onaysız kod fişte kullanılamaz; oran ve kapsam yerel danışmanca doğrulanmalı.
        </Notice>
      )}

      <Table
        empty={kodlar.length === 0}
        head={<tr><Th className="w-40">Kod</Th><Th>Ad</Th><Th className="w-20" align="right">Oran</Th><Th className="w-32">Nitelik</Th><Th className="w-40">Geçerlilik</Th><Th className="w-28">Durum</Th></tr>}
      >
        {kodlar.map(k => (
          <tr key={k.id}>
            <Td className="font-mono text-xs">{k.code}</Td>
            <Td className="truncate">{k.name}</Td>
            <Td align="right" className="tabular-nums">%{k.rate}</Td>
            <Td className="text-xs">{k.treatment_label}</Td>
            <Td className="text-xs">{dateTR(k.valid_from)} – {k.valid_to ? dateTR(k.valid_to) : 'açık'}</Td>
            <Td>
              {k.is_approved
                ? <Badge label="Onaylı" color="emerald" />
                : (
                  <button onClick={() => onayla.mutate(k.id)} disabled={onayla.isPending}
                    className="rounded-md bg-amber-600 px-2 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50">
                    Onayla
                  </button>
                )}
            </Td>
          </tr>
        ))}
      </Table>
    </Section>
  )
}
