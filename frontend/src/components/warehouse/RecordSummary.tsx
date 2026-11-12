'use client'

/**
 * Kayit listesinin ustundeki "Raporlar" penceresi.
 *
 * Rakamlar sayfadaki 15 satirdan degil, ayni suzgeclerle tum sonuc kumesinden
 * geliyor: /modules/warehouse/summary listenin filtrelerini aynen uyguluyor.
 */
import { useQuery } from '@tanstack/react-query'
import { BarChart3 } from 'lucide-react'
import { get } from '@/lib/api'
import { cn } from '@/lib/utils'
import { RECORD_TYPES, formatQty } from './stock'

interface Ozet {
  total: number
  by_type: { type: string; count: number; quantity: number | null }[]
  by_status: { status: string; count: number }[]
  quantity_in: number
  quantity_out: number
  quantity_net: number
  pending: number
  unposted: number
  qc_pending: number
}

const TUR_ETIKET: Record<string, string> = Object.fromEntries(RECORD_TYPES.map(t => [t.value, t.label]))

/** Tek hucre: ustte etiket, altta rakam. Referans duzen: etiket solda, deger sagda. */
function Hucre({ etiket, deger, renk }: { etiket: string; deger: string; renk?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-r border-zinc-200 px-4 py-2.5 last:border-r-0 dark:border-zinc-800">
      <span className="text-xs text-zinc-500 dark:text-zinc-400">{etiket}</span>
      <span className={cn('text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100', renk)}>{deger}</span>
    </div>
  )
}

export function RecordSummary({ params }: { params: Record<string, unknown> }) {
  const { data, isLoading } = useQuery({
    queryKey: ['warehouse-summary', params],
    queryFn: () => get<{ data: Ozet }>('/modules/warehouse/summary', { params }).then(r => r.data),
    staleTime: 10_000,
  })

  const sayi = (n: number) => n.toLocaleString('tr-TR')

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <header className="flex items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/60">
        <BarChart3 className="h-4 w-4 text-zinc-400" />
        <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Raporlar</h3>
        <span className="ml-auto text-xs text-zinc-500">Filtrelenmiş sonucun tamamı</span>
      </header>

      {isLoading || !data ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="border-b border-r border-zinc-200 px-4 py-2.5 last:border-r-0 dark:border-zinc-800">
              <div className="h-4 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
            <Hucre etiket="Toplam kayıt" deger={sayi(data.total)} />
            <Hucre etiket="Giren miktar" deger={formatQty(data.quantity_in)} renk="text-emerald-600 dark:text-emerald-400" />
            <Hucre etiket="Çıkan miktar" deger={formatQty(data.quantity_out)} renk="text-rose-600 dark:text-rose-400" />
            <Hucre
              etiket="Net miktar"
              deger={formatQty(data.quantity_net)}
              renk={data.quantity_net < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}
            />
            <Hucre etiket="Onay bekleyen" deger={sayi(data.pending)} renk={data.pending ? 'text-amber-600 dark:text-amber-400' : undefined} />
            <Hucre etiket="Stoğa işlenmemiş" deger={sayi(data.unposted)} renk={data.unposted ? 'text-amber-600 dark:text-amber-400' : undefined} />
            <Hucre etiket="QC bekleyen" deger={sayi(data.qc_pending)} renk={data.qc_pending ? 'text-amber-600 dark:text-amber-400' : undefined} />
            <Hucre etiket="Hareket tipi" deger={sayi(data.by_type.length)} />
          </div>

          {data.by_type.length > 0 && (
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 px-4 py-2.5 text-xs text-zinc-600 dark:text-zinc-400">
              {data.by_type.map(t => (
                <span key={t.type} className="whitespace-nowrap">
                  {TUR_ETIKET[t.type] ?? t.type}:{' '}
                  <strong className="tabular-nums text-zinc-900 dark:text-zinc-100">{sayi(t.count)}</strong>
                  {t.quantity != null && <span className="text-zinc-400"> · {formatQty(t.quantity)}</span>}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}
