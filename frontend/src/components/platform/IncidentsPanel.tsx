'use client'

/**
 * Kiracı şirketlerde oluşan hatalar.
 *
 * Bu kayıtlar yalnız platform panelinde görünür; şirketin kendi aktivite
 * logunda yer almaz. Amaç, müşteri aramadan önce sorunu görüp çözmek.
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Bug, CheckCircle2, ChevronRight, Repeat2, ShieldAlert, X } from 'lucide-react'
import { toast } from 'sonner'
import { BrandLoaderBlock } from '@/components/common/BrandLoader'
import { get, patch } from '@/lib/api'
import { cn, formatDateTime, timeAgo } from '@/lib/utils'

interface Incident {
  id: string
  level: 'critical' | 'error' | 'warning'
  level_label: string
  source: string
  source_label: string
  status: 'open' | 'investigating' | 'resolved' | 'ignored'
  status_label: string
  company_id: string | null
  company_name: string | null
  user_name: string | null
  user_email: string | null
  exception_class: string | null
  message: string
  request_method: string | null
  request_path: string | null
  status_code: number | null
  ip_address: string | null
  occurrences: number
  first_seen_at: string | null
  last_seen_at: string | null
  suggested_fix: string | null
  resolution_note: string | null
  resolved_at: string | null
}

interface IncidentDetail extends Incident {
  trace: string | null
  request_payload: Record<string, unknown> | null
  user_agent: string | null
  file: string | null
  line: number | null
  resolver_name: string | null
}

interface Ozet {
  open: number
  critical_open: number
  resolved: number
  total: number
  occurrences: number
}

const SEVIYE_STIL: Record<Incident['level'], string> = {
  critical: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
  error: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  warning: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
}

const DURUM_STIL: Record<Incident['status'], string> = {
  open: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  investigating: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
  resolved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  ignored: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700/50 dark:text-zinc-300',
}

const DURUMLAR: { v: Incident['status']; l: string }[] = [
  { v: 'open', l: 'Açık' },
  { v: 'investigating', l: 'İnceleniyor' },
  { v: 'resolved', l: 'Çözüldü' },
  { v: 'ignored', l: 'Yok sayıldı' },
]

export function IncidentsPanel() {
  const [durum, setDurum] = useState('')
  const [seviye, setSeviye] = useState('')
  const [arama, setArama] = useState('')
  const [secili, setSecili] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['platform-incidents', durum, seviye, arama],
    queryFn: () => get<{ data: Incident[]; meta: { total: number }; summary: Ozet }>('/admin/incidents', {
      params: {
        per_page: 50,
        ...(durum ? { status: durum } : {}),
        ...(seviye ? { level: seviye } : {}),
        ...(arama ? { search: arama } : {}),
      },
    }),
    refetchInterval: 60_000,
  })

  const kayitlar = data?.data ?? []
  const ozet = data?.summary

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <OzetKart etiket="Açık olay" deger={ozet?.open ?? 0} ikon={<AlertTriangle className="h-4 w-4" />}
          vurgu={(ozet?.open ?? 0) > 0 ? 'text-amber-600 dark:text-amber-400' : undefined} />
        <OzetKart etiket="Kritik açık" deger={ozet?.critical_open ?? 0} ikon={<ShieldAlert className="h-4 w-4" />}
          vurgu={(ozet?.critical_open ?? 0) > 0 ? 'text-rose-600 dark:text-rose-400' : undefined} />
        <OzetKart etiket="Çözülen" deger={ozet?.resolved ?? 0} ikon={<CheckCircle2 className="h-4 w-4" />} />
        <OzetKart etiket="Toplam tekrar" deger={ozet?.occurrences ?? 0} ikon={<Repeat2 className="h-4 w-4" />} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={arama}
          onChange={e => setArama(e.target.value)}
          placeholder="Mesaj, yol, şirket ara…"
          className="w-56 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <Secim deger={durum} onChange={setDurum} bos="Tüm durumlar" secenekler={DURUMLAR.map(d => ({ v: d.v, l: d.l }))} />
        <Secim deger={seviye} onChange={setSeviye} bos="Tüm seviyeler" secenekler={[
          { v: 'critical', l: 'Kritik' }, { v: 'error', l: 'Hata' }, { v: 'warning', l: 'Uyarı' },
        ]} />
      </div>

      {isLoading ? (
        <BrandLoaderBlock size={72} text="Olay kayıtları yükleniyor" />
      ) : kayitlar.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 py-16 text-center dark:border-zinc-800">
          <Bug className="mx-auto mb-2 h-8 w-8 text-zinc-300 dark:text-zinc-600" />
          <p className="text-sm text-zinc-500">Kayıtlı olay yok.</p>
        </div>
      ) : (
        <ul className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {kayitlar.map(k => (
            <li key={k.id}>
              <button
                onClick={() => setSecili(k.id)}
                className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
              >
                <span className={cn('mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium', SEVIYE_STIL[k.level])}>
                  {k.level_label}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-zinc-800 dark:text-zinc-200">{k.message}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-zinc-500">
                    <span className="font-medium text-zinc-600 dark:text-zinc-400">{k.company_name ?? 'Şirketsiz'}</span>
                    {k.request_path && (
                      <span className="font-mono">{k.request_method} {k.request_path}{k.status_code ? ` · ${k.status_code}` : ''}</span>
                    )}
                    {k.user_name && <span>{k.user_name}</span>}
                    <span>{timeAgo(k.last_seen_at ?? '')}</span>
                  </span>
                </span>

                <span className="flex shrink-0 items-center gap-2">
                  {k.occurrences > 1 && (
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] tabular-nums text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      ×{k.occurrences}
                    </span>
                  )}
                  <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', DURUM_STIL[k.status])}>
                    {k.status_label}
                  </span>
                  <ChevronRight className="h-4 w-4 text-zinc-300 dark:text-zinc-600" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {secili && <DetayModal id={secili} onClose={() => setSecili(null)} />}
    </div>
  )
}

function OzetKart({ etiket, deger, ikon, vurgu }: { etiket: string; deger: number; ikon: React.ReactNode; vurgu?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-2 text-xs text-zinc-500">{ikon} {etiket}</div>
      <p className={cn('mt-1 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100', vurgu)}>
        {deger.toLocaleString('tr-TR')}
      </p>
    </div>
  )
}

function Secim({ deger, onChange, bos, secenekler }: {
  deger: string
  onChange: (v: string) => void
  bos: string
  secenekler: { v: string; l: string }[]
}) {
  return (
    <select
      value={deger}
      onChange={e => onChange(e.target.value)}
      className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
    >
      <option value="">{bos}</option>
      {secenekler.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  )
}

function DetayModal({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['platform-incident', id],
    queryFn: () => get<{ data: IncidentDetail }>(`/admin/incidents/${id}`).then(r => r.data),
  })

  const [not, setNot] = useState<string | null>(null)
  const kayit = data
  const notDegeri = not ?? kayit?.resolution_note ?? ''

  const kaydet = useMutation({
    mutationFn: (govde: { status?: string; resolution_note?: string }) =>
      patch<{ message: string }>(`/admin/incidents/${id}`, govde),
    onSuccess: (r) => {
      toast.success(r.message)
      qc.invalidateQueries({ queryKey: ['platform-incidents'] })
      qc.invalidateQueries({ queryKey: ['platform-incident', id] })
    },
    onError: () => toast.error('Kaydedilemedi.'),
  })

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm">
      <div className="my-8 w-full max-w-3xl rounded-2xl bg-white shadow-xl dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Olay detayı</h2>
            {kayit && (
              <p className="mt-0.5 truncate text-xs text-zinc-500">
                {kayit.company_name ?? 'Şirketsiz'} · {kayit.source_label} · {kayit.occurrences} kez
              </p>
            )}
          </div>
          <button onClick={onClose} aria-label="Kapat"
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        {isLoading || !kayit ? (
          <div className="p-8"><BrandLoaderBlock size={64} text={null} /></div>
        ) : (
          <div className="space-y-5 p-5">
            <div>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{kayit.message}</p>
              {kayit.exception_class && (
                <p className="mt-1 font-mono text-xs text-zinc-500">{kayit.exception_class}</p>
              )}
            </div>

            <dl className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
              <Satir etiket="İstek" deger={`${kayit.request_method ?? '—'} ${kayit.request_path ?? ''}`.trim()} mono />
              <Satir etiket="Durum kodu" deger={kayit.status_code?.toString() ?? '—'} />
              <Satir etiket="Kullanıcı" deger={kayit.user_name ? `${kayit.user_name} · ${kayit.user_email ?? ''}` : '—'} />
              <Satir etiket="IP" deger={kayit.ip_address ?? '—'} mono />
              <Satir etiket="İlk görülme" deger={kayit.first_seen_at ? formatDateTime(kayit.first_seen_at) : '—'} />
              <Satir etiket="Son görülme" deger={kayit.last_seen_at ? formatDateTime(kayit.last_seen_at) : '—'} />
              {kayit.file && <Satir etiket="Kaynak" deger={`${kayit.file}:${kayit.line ?? '?'}`} mono />}
              {kayit.resolver_name && <Satir etiket="Çözen" deger={kayit.resolver_name} />}
            </dl>

            {kayit.suggested_fix && (
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide opacity-80">Önerilen çözüm</p>
                {kayit.suggested_fix}
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Çözüm notu
              </label>
              <textarea
                value={notDegeri}
                onChange={e => setNot(e.target.value)}
                rows={4}
                placeholder="Sorunu nasıl çözdünüz? Aynı olay tekrarlarsa buradan okunacak."
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => kaydet.mutate({ resolution_note: notDegeri })}
                  disabled={kaydet.isPending}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  Notu kaydet
                </button>
                {DURUMLAR.map(d => (
                  <button
                    key={d.v}
                    onClick={() => kaydet.mutate({ status: d.v, resolution_note: notDegeri })}
                    disabled={kaydet.isPending || kayit.status === d.v}
                    className={cn(
                      'rounded-lg border px-3 py-1.5 text-sm transition-colors disabled:opacity-40',
                      kayit.status === d.v
                        ? 'border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                        : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800',
                    )}
                  >
                    {d.l}
                  </button>
                ))}
              </div>
            </div>

            {kayit.request_payload && Object.keys(kayit.request_payload).length > 0 && (
              <Katlanir baslik="Gönderilen veri">
                <pre className="overflow-x-auto rounded-lg bg-zinc-50 p-3 text-[11px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  {JSON.stringify(kayit.request_payload, null, 2)}
                </pre>
              </Katlanir>
            )}

            {kayit.trace && (
              <Katlanir baslik="Hata izi">
                <pre className="max-h-72 overflow-auto rounded-lg bg-zinc-50 p-3 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                  {kayit.trace}
                </pre>
              </Katlanir>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Satir({ etiket, deger, mono }: { etiket: string; deger: string; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-zinc-500">{etiket}:</dt>
      <dd className={cn('min-w-0 break-words text-zinc-800 dark:text-zinc-200', mono && 'font-mono')}>{deger}</dd>
    </div>
  )
}

function Katlanir({ baslik, children }: { baslik: string; children: React.ReactNode }) {
  const [acik, setAcik] = useState(false)
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800">
      <button onClick={() => setAcik(v => !v)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left text-xs font-medium text-zinc-600 dark:text-zinc-400">
        {baslik}
        <ChevronRight className={cn('h-4 w-4 transition-transform', acik && 'rotate-90')} />
      </button>
      {acik && <div className="px-4 pb-3">{children}</div>}
    </div>
  )
}
