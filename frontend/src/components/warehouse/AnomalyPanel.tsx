'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, RefreshCw, RotateCcw, Siren, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { get, patch, post } from '@/lib/api'
import { cn, formatDate, formatDateTime } from '@/lib/utils'
import { apiErrorMessage } from './stock'
import { AsyncActionButton } from '@/components/common/AsyncActionButton'

type AnomalyStatus = 'open' | 'acknowledged' | 'dismissed'

interface Anomaly {
  id: string
  type: string
  type_label: string
  severity: number
  message: string
  detected_for: string
  status: AnomalyStatus
  product: string | null
  warehouse: string | null
  user: string | null
  record_number: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  review_note: string | null
}

interface AnomalyResponse {
  data: Anomaly[]
  summary: { open: number; open_high: number; last_7_days: number; by_type: Record<string, number> }
  types: Record<string, string>
}

const STATUS_TABS: { value: AnomalyStatus | 'all'; label: string }[] = [
  { value: 'open', label: 'Açık' },
  { value: 'acknowledged', label: 'Sorun var' },
  { value: 'dismissed', label: 'Normal' },
  { value: 'all', label: 'Tümü' },
]

function severityCls(s: number) {
  if (s >= 80) return 'bg-red-600 text-white'
  if (s >= 60) return 'bg-orange-500 text-white'
  if (s >= 40) return 'bg-amber-400 text-amber-950'
  return 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200'
}

/** Stok anomalileri: tarama, filtre, inceleme (normal / sorun var / yeniden aç). */
export function AnomalyPanel() {
  const qc = useQueryClient()
  const [status, setStatus] = useState<AnomalyStatus | 'all'>('open')
  const [type, setType] = useState('')
  const [notes, setNotes] = useState<Record<string, string>>({})

  const { data, isLoading } = useQuery({
    queryKey: ['stock-anomalies', status, type],
    queryFn: () => get<AnomalyResponse>(`/modules/stock/anomalies?status=${status}${type ? `&type=${type}` : ''}`),
  })

  const refresh = () => qc.invalidateQueries({ queryKey: ['stock-anomalies'] })

  const scanMutation = useMutation({
    mutationFn: () => post<{ message: string }>('/modules/stock/anomalies/scan'),
    onSuccess: (r) => { toast.success(r.message); refresh() },
    onError: (e) => toast.error(apiErrorMessage(e, 'Tarama yapılamadı.')),
  })

  const reviewMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: AnomalyStatus }) =>
      patch<{ message: string }>(`/modules/stock/anomalies/${id}`, { status, note: notes[id] || null }),
    onSuccess: (r) => { toast.success(r.message); refresh() },
    onError: (e) => toast.error(apiErrorMessage(e, 'Güncellenemedi.')),
  })

  const items = data?.data ?? []
  const s = data?.summary

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {([
          ['Açık anomali', s?.open ?? '—', 'incelenmeyi bekliyor'],
          ['Yüksek önemli', s?.open_high ?? '—', 'önem ≥ 70'],
          ['Son 7 gün', s?.last_7_days ?? '—', 'yeni tespit'],
        ] as const).map(([label, value, sub]) => (
          <div key={label} className="rounded-xl border border-zinc-200 dark:border-zinc-800 px-4 py-3">
            <p className="text-xs text-zinc-500">{label}</p>
            <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{value}</p>
            <p className="text-[11px] text-zinc-500">{sub}</p>
          </div>
        ))}
        <button
          onClick={() => scanMutation.mutate()}
          disabled={scanMutation.isPending}
          className="rounded-xl border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30 px-4 py-3 text-left hover:bg-blue-100 dark:hover:bg-blue-950/50 disabled:opacity-60"
        >
          <p className="text-xs text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
            <RefreshCw className={cn('h-3.5 w-3.5', scanMutation.isPending && 'animate-spin')} /> Şimdi tara
          </p>
          <p className="text-[11px] text-blue-600/80 dark:text-blue-400/80 mt-1">Otomatik tarama her sabah 06:00&apos;da çalışır.</p>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_TABS.map(t => (
          <button
            key={t.value}
            onClick={() => setStatus(t.value)}
            className={cn('px-3 py-1.5 text-xs font-medium rounded-full border', status === t.value ? 'bg-blue-600 border-blue-600 text-white' : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400')}
          >
            {t.label}
          </button>
        ))}
        <select value={type} onChange={e => setType(e.target.value)} className="ml-auto px-3 py-1.5 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
          <option value="">Tüm türler</option>
          {Object.entries(data?.types ?? {}).map(([k, v]) => (
            <option key={k} value={k}>{v}{s?.by_type?.[k] ? ` (${s.by_type[k]})` : ''}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin text-zinc-400 inline" /></div>
      ) : items.length === 0 ? (
        <div className="py-12 text-center space-y-1">
          <Siren className="h-6 w-6 text-zinc-300 inline" />
          <p className="text-sm text-zinc-500">{status === 'open' ? 'Açık anomali yok.' : 'Kayıt yok.'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(a => (
            <div key={a.id} className={cn('rounded-xl border px-4 py-3', a.status === 'open' ? 'border-zinc-200 dark:border-zinc-800' : 'border-zinc-100 dark:border-zinc-900 opacity-80')}>
              <div className="flex flex-col lg:flex-row lg:items-start gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <span className={cn('shrink-0 w-10 text-center text-xs font-bold rounded-md py-1', severityCls(a.severity))} title="Önem (0-100)">{a.severity}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-zinc-500">{a.type_label} · {formatDate(a.detected_for)}</p>
                    <p className="text-sm text-zinc-800 dark:text-zinc-200">{a.message}</p>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      {[a.product, a.warehouse, a.user && `Kullanıcı: ${a.user}`, a.record_number && `Kayıt: ${a.record_number}`].filter(Boolean).join(' · ')}
                    </p>
                    {a.status !== 'open' && (
                      <p className="text-[11px] mt-1 text-zinc-500">
                        {a.status === 'dismissed' ? 'Normal' : 'Sorun var'} — {a.reviewed_by} · {a.reviewed_at && formatDateTime(a.reviewed_at)}
                        {a.review_note && <>: <em>{a.review_note}</em></>}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  {a.status === 'open' ? (<>
                    <input
                      value={notes[a.id] ?? ''}
                      onChange={e => setNotes(n => ({ ...n, [a.id]: e.target.value }))}
                      placeholder="Not (isteğe bağlı)"
                      className="w-44 px-2 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                    />
                    <AsyncActionButton
                      label="Normal"
                      width={96}
                      onAction={() => reviewMutation.mutateAsync({ id: a.id, status: 'dismissed' })}
                    />
                    <button onClick={() => reviewMutation.mutate({ id: a.id, status: 'acknowledged' })} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30">
                      <XCircle className="h-3.5 w-3.5" /> Sorun var
                    </button>
                  </>) : (
                    <button onClick={() => reviewMutation.mutate({ id: a.id, status: 'open' })} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-500">
                      <RotateCcw className="h-3.5 w-3.5" /> Yeniden aç
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-zinc-400">
        Anomaliler sadece uyarıdır; stok verisini değiştirmez. &quot;Normal&quot; olarak işaretlenen anomali sonraki taramalarda tekrar açılmaz. Önem ≥ 70 olan yeni anomaliler depo yetkililerine bildirim olarak gönderilir.
      </p>
    </div>
  )
}
