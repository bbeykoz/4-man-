'use client'

/** Muhasebe özeti: kurulum durumu, dönem, KDV takvimi, bekleyen işler. */
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { BrandLoaderBlock } from '@/components/common/BrandLoader'
import { A, dateTR, get, money, periodLabel } from './api'
import { Badge, Notice, Section, Stat } from './ui'

interface SetupStatus {
  country_code: string
  functional_currency: string
  timezone: string
  chart_accounts: number
  periods: number
  tax_codes: number
  tax_codes_approved: number
  document_series: number
  missing_roles: string[]
  ready_for_documents: boolean
}

interface BridgeStatus {
  pending: number
  needs_attention: number
  oldest_pending: string | null
}

interface VatOverview {
  vat_registered: boolean
  vat_term: string
  current_period: string
  returns: { period_key: string; status_label: string; net_payable: number; days_to_due: number; currency: string }[]
  missing_periods: { period_key: string; due_date: string }[]
}

export function OverviewPanel({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const kurulum = useQuery({
    queryKey: ['acc', 'setup', 'status'],
    queryFn: () => get<{ data: SetupStatus }>(`${A}/setup/status`).then(r => r.data),
  })

  const kopru = useQuery({
    queryKey: ['acc', 'bridge', 'status'],
    queryFn: () => get<{ data: BridgeStatus }>(`${A}/inventory-bridge/status`).then(r => r.data),
  })

  const kdv = useQuery({
    queryKey: ['acc', 'vat', 'overview'],
    queryFn: () => get<{ data: VatOverview }>(`${A}/vat/overview`).then(r => r.data),
  })

  if (kurulum.isLoading) return <BrandLoaderBlock />

  const s = kurulum.data
  const b = kopru.data
  const v = kdv.data

  return (
    <div className="space-y-4">
      {s && !s.ready_for_documents && (
        <Notice tone="warning">
          <p className="font-medium">Muhasebe kurulumu tamamlanmamış.</p>
          <p className="mt-0.5 text-xs">
            {s.missing_roles.length > 0
              ? `Eksik hesap rolleri: ${s.missing_roles.join(', ')}.`
              : 'Numara serisi tanımlı değil.'}{' '}
            <button onClick={() => onNavigate('kurulum')} className="underline underline-offset-2">
              Kurulum sekmesine git
            </button>
          </p>
        </Notice>
      )}

      {s && (
        <Section title="Kurulum durumu" description={`${s.country_code} · ${s.functional_currency} · ${s.timezone}`}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Stat label="Hesap planı" value={s.chart_accounts} suffix="hesap" />
            <Stat label="Muhasebe dönemi" value={s.periods} suffix="dönem" />
            <Stat
              label="Vergi kodu"
              value={`${s.tax_codes_approved}/${s.tax_codes}`}
              suffix="onaylı"
              tone={s.tax_codes > 0 && s.tax_codes_approved < s.tax_codes ? 'warning' : 'default'}
              hint={s.tax_codes_approved < s.tax_codes ? 'Onaysız kod fişte kullanılamaz' : undefined}
            />
            <Stat label="Numara serisi" value={s.document_series} suffix="seri" />
            <Stat
              label="Belge kesilebilir"
              value={s.ready_for_documents ? 'Evet' : 'Hayır'}
              tone={s.ready_for_documents ? 'positive' : 'negative'}
            />
          </div>
        </Section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Section
          title="Depo köprüsü"
          description="Depo hareketlerinin muhasebeye yansıması"
          action={
            <button onClick={() => onNavigate('depo-koprusu')} className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400">
              Ayrıntı <ArrowRight className="h-3 w-3" />
            </button>
          }
        >
          {kopru.isLoading ? <BrandLoaderBlock size={48} className="py-4" text={null} /> : b && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Bekleyen olay" value={b.pending} tone={b.pending > 0 ? 'warning' : 'positive'} />
              <Stat
                label="Müdahale gereken"
                value={b.needs_attention}
                tone={b.needs_attention > 0 ? 'negative' : 'positive'}
                hint={b.needs_attention > 0 ? 'Kapalı dönem ya da eksik eşleme' : undefined}
              />
              <Stat label="En eski bekleyen" value={dateTR(b.oldest_pending)} />
            </div>
          )}
        </Section>

        <Section
          title="KDV"
          description={v?.vat_registered ? `${v.vat_term} mükellefi` : 'KDV mükellefi değil'}
          action={
            <button onClick={() => onNavigate('kdv')} className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400">
              KDV merkezi <ArrowRight className="h-3 w-3" />
            </button>
          }
        >
          {kdv.isLoading ? <BrandLoaderBlock size={48} className="py-4" text={null} /> : v && (
            <div className="space-y-2">
              {v.missing_periods.length > 0 && (
                <Notice tone="warning">
                  {v.missing_periods.length} dönemin beyanı hazırlanmamış:{' '}
                  {v.missing_periods.slice(0, 3).map(m => periodLabel(m.period_key)).join(', ')}
                  {v.missing_periods.length > 3 && ` ve ${v.missing_periods.length - 3} tane daha`}
                </Notice>
              )}

              {v.returns.length === 0 ? (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">Henüz beyan hazırlanmamış.</p>
              ) : (
                <ul className="divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
                  {v.returns.slice(0, 4).map(r => (
                    <li key={r.period_key} className="flex items-center justify-between gap-2 py-2">
                      <span className="text-zinc-700 dark:text-zinc-300">{periodLabel(r.period_key)}</span>
                      <span className="flex items-center gap-2">
                        <span className="tabular-nums text-zinc-600 dark:text-zinc-400">
                          {money(r.net_payable)} {r.currency}
                        </span>
                        <Badge
                          label={r.status_label}
                          color={r.status_label === 'Gönderildi' || r.status_label === 'Kabul edildi' ? 'emerald' : 'amber'}
                        />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Section>
      </div>

      {s?.ready_for_documents && b?.needs_attention === 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4" />
          Muhasebe çalışır durumda; bekleyen müdahale yok.
        </div>
      )}
    </div>
  )
}
