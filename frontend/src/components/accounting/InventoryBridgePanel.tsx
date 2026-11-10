'use client'

/** Depo köprüsü: olay kuyruğu, istisna çözümü, fiş bağlantısı. */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Play, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { BrandLoaderBlock } from '@/components/common/BrandLoader'
import { A, apiError, dateTR, get, money, params, post } from './api'
import { Badge, Money, Notice, Section, Stat, Table, Td, Th } from './ui'

interface Olay {
  id: string
  event_type: string
  event_label: string
  source_number: string | null
  accounting_date: string
  status: string
  total_value: number
  journal_no: string | null
  skip_reason: string | null
  last_error: string | null
  attempts: number
}

const DURUM_RENKLERI: Record<string, string> = {
  pending: 'amber', processed: 'emerald', skipped: 'gray', exception: 'rose', failed: 'red',
}

const DURUM_ADLARI: Record<string, string> = {
  pending: 'Bekliyor', processed: 'İşlendi', skipped: 'Atlandı', exception: 'İstisna', failed: 'Hata',
}

export function InventoryBridgePanel() {
  const qc = useQueryClient()
  const [durum, setDurum] = useState('')
  const [yeniTarih, setYeniTarih] = useState<Record<string, string>>({})

  const ozet = useQuery({
    queryKey: ['acc', 'bridge', 'status'],
    queryFn: () => get<{ data: { by_status: Record<string, { count: number; value: number }>; pending: number; needs_attention: number; oldest_pending: string | null } }>(
      `${A}/inventory-bridge/status`).then(r => r.data),
  })

  const olaylar = useQuery({
    queryKey: ['acc', 'bridge', 'events', durum],
    queryFn: () => get<{ data: Olay[] | { data: Olay[] } }>(`${A}/inventory-bridge/events`, { params: params({ status: durum, per_page: 50 }) })
      .then(r => (Array.isArray(r.data) ? r.data : r.data.data)),
  })

  const isle = useMutation({
    mutationFn: () => post<{ message: string }>(`${A}/inventory-bridge/process`, {}),
    onSuccess: (r) => { toast.success(r.message); qc.invalidateQueries({ queryKey: ['acc'] }) },
    onError: (e) => toast.error(apiError(e)),
  })

  const tekrar = useMutation({
    mutationFn: ({ id, tarih }: { id: string; tarih?: string }) =>
      post<{ message: string }>(`${A}/inventory-bridge/events/${id}/retry`, tarih ? { accounting_date: tarih } : {}),
    onSuccess: (r) => { toast.success(r.message); qc.invalidateQueries({ queryKey: ['acc'] }) },
    onError: (e) => toast.error(apiError(e)),
  })

  const o = ozet.data
  const liste = olaylar.data ?? []

  return (
    <div className="space-y-4">
      <Section
        title="Depo → muhasebe kuyruğu"
        description="Depo hareketleri fişe burada dönüşüyor"
        action={
          <button onClick={() => isle.mutate()} disabled={isle.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            <Play className="h-3.5 w-3.5" /> Bekleyenleri işle
          </button>
        }
      >
        {ozet.isLoading ? <BrandLoaderBlock size={48} text={null} /> : o && (
          <>
            {o.needs_attention > 0 && (
              <Notice tone="danger">
                {o.needs_attention} olay müdahale bekliyor. Genellikle kapalı dönem ya da eksik hesap eşlemesi.
              </Notice>
            )}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {(['pending', 'processed', 'skipped', 'exception', 'failed'] as const).map(d => (
                <Stat
                  key={d}
                  label={DURUM_ADLARI[d]}
                  value={o.by_status[d]?.count ?? 0}
                  tone={d === 'exception' || d === 'failed' ? (o.by_status[d]?.count ? 'negative' : 'default')
                    : d === 'pending' ? (o.by_status[d]?.count ? 'warning' : 'default') : 'default'}
                  hint={o.by_status[d]?.value ? `${money(o.by_status[d].value)} değer` : undefined}
                />
              ))}
            </div>
          </>
        )}
      </Section>

      <Section
        title="Olaylar"
        action={
          <select value={durum} onChange={e => setDurum(e.target.value)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
            <option value="">Tüm durumlar</option>
            {Object.entries(DURUM_ADLARI).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        }
      >
        {olaylar.isLoading ? <BrandLoaderBlock /> : (
          <Table
            empty={liste.length === 0}
            head={
              <tr>
                <Th className="w-32">Depo kaydı</Th>
                <Th className="w-32">Olay</Th>
                <Th className="w-24">Tarih</Th>
                <Th className="w-28" align="right">Değer</Th>
                <Th className="w-24">Durum</Th>
                <Th>Fiş / açıklama</Th>
              </tr>
            }
          >
            {liste.map(e => (
              <tr key={e.id}>
                <Td className="font-mono text-xs">{e.source_number ?? '—'}</Td>
                <Td className="text-xs">{e.event_label}</Td>
                <Td className="text-xs">{dateTR(e.accounting_date)}</Td>
                <Td align="right"><Money value={e.total_value} /></Td>
                <Td><Badge label={DURUM_ADLARI[e.status] ?? e.status} color={DURUM_RENKLERI[e.status]} /></Td>
                <Td>
                  {e.journal_no && <span className="font-mono text-xs text-blue-600 dark:text-blue-400">{e.journal_no}</span>}
                  {e.skip_reason && <p className="text-xs text-zinc-500">{e.skip_reason}</p>}
                  {e.last_error && (
                    <div className="space-y-1">
                      <p className="text-xs text-rose-600 dark:text-rose-400">{e.last_error}</p>
                      {(e.status === 'exception' || e.status === 'failed') && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <input
                            type="date"
                            value={yeniTarih[e.id] ?? ''}
                            onChange={ev => setYeniTarih(t => ({ ...t, [e.id]: ev.target.value }))}
                            className="rounded-md border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                          />
                          <button
                            onClick={() => tekrar.mutate({ id: e.id, tarih: yeniTarih[e.id] || undefined })}
                            disabled={tekrar.isPending}
                            className="inline-flex items-center gap-1 rounded-md bg-amber-600 px-2 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                          >
                            <RefreshCw className="h-3 w-3" /> Yeniden dene
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </div>
  )
}
