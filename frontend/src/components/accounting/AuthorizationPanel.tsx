'use client'

/** Yetkiler: muhasebe rolleri, görev ayrılığı raporu, onay matrisi. */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { BrandLoaderBlock } from '@/components/common/BrandLoader'
import { cn } from '@/lib/utils'
import { A, apiError, get, money, post } from './api'
import { Badge, Notice, Section, Stat, Table, Td, Th } from './ui'

export function AuthorizationPanel() {
  const [gorunum, setGorunum] = useState<'roller' | 'ayrilik' | 'matris'>('roller')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 rounded-lg border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-900">
        {([['roller', 'Roller'], ['ayrilik', 'Görev ayrılığı'], ['matris', 'Onay matrisi']] as const).map(([id, l]) => (
          <button key={id} onClick={() => setGorunum(id)}
            className={cn('rounded-md px-3 py-1.5 text-sm transition-colors',
              gorunum === id ? 'bg-blue-600 text-white' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800')}>
            {l}
          </button>
        ))}
      </div>

      {gorunum === 'roller'  && <Roller />}
      {gorunum === 'ayrilik' && <Ayrilik />}
      {gorunum === 'matris'  && <Matris />}
    </div>
  )
}

function Roller() {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['acc', 'auth', 'roles'],
    queryFn: () => get<{ data: { roles: { id: string; name: string; display_name: string; description: string | null; level: number; users_count: number; permissions_count: number; accounting_permissions: string[]; is_accounting_role: boolean }[] } }>(
      `${A}/authorization/roles`).then(r => r.data),
  })

  const kur = useMutation({
    mutationFn: () => post<{ message: string }>(`${A}/authorization/roles/install`, {}),
    onSuccess: (r) => { toast.success(r.message); qc.invalidateQueries({ queryKey: ['acc', 'auth'] }) },
    onError: (e) => toast.error(apiError(e)),
  })

  if (isLoading) return <BrandLoaderBlock />
  const roller = (data?.roles ?? []).filter(r => r.is_accounting_role)

  return (
    <Section
      title="Muhasebe rolleri"
      description={`${roller.length} rol · izinler Şirket → Roller ekranından düzenlenebilir`}
      action={
        <button onClick={() => kur.mutate()} disabled={kur.isPending}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          Rol şablonlarını kur
        </button>
      }
    >
      {roller.length === 0 ? (
        <Notice tone="info">
          Muhasebe rolü tanımlı değil. Şablonları kurunca iki rol gelir — Muhasebe Personeli ve
          Muhasebe Müdürü. İzinleri şirketinize göre değiştirebilir, farklı bir yapı gerekiyorsa
          Şirket → Roller ekranından kendi rolünüzü açabilirsiniz.
        </Notice>
      ) : (
        <Table
          head={<tr><Th>Rol</Th><Th>Açıklama</Th><Th className="w-24" align="center">Kullanıcı</Th><Th className="w-28" align="center">İzin</Th></tr>}
        >
          {roller.map(r => (
            <tr key={r.id}>
              <Td>
                <div className="text-zinc-900 dark:text-zinc-100">{r.display_name}</div>
                <div className="font-mono text-[11px] text-zinc-400">{r.name}</div>
              </Td>
              <Td className="text-xs text-zinc-500 dark:text-zinc-400">{r.description ?? '—'}</Td>
              <Td align="center" className="tabular-nums">{r.users_count}</Td>
              <Td align="center" className="tabular-nums">{r.accounting_permissions.length}</Td>
            </tr>
          ))}
        </Table>
      )}
    </Section>
  )
}

interface Cakisma {
  code: string
  label: string
  severity: string
  explanation: string
  excepted: boolean
  exception?: { reason: string; valid_to: string | null } | null
  inherited: boolean
}

function Ayrilik() {
  const qc = useQueryClient()
  const [istisna, setIstisna] = useState<{ userId: string; code: string } | null>(null)
  const [gerekce, setGerekce] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['acc', 'auth', 'duty'],
    queryFn: () => get<{ data: {
      users: { user_id: string; user_name: string; email: string; roles: string[]; is_owner: boolean; conflicts: Cakisma[] }[]
      summary: { users_checked: number; users_with_conflicts: number; blocking?: number; warning?: number; excepted: number }
      catalog: { code: string; label: string; severity: string; explanation: string }[]
    } }>(`${A}/authorization/duty-report`).then(r => r.data),
  })

  const ver = useMutation({
    mutationFn: () => post<{ message: string }>(`${A}/authorization/users/${istisna!.userId}/exceptions`, {
      conflict_code: istisna!.code, reason: gerekce,
    }),
    onSuccess: (r) => { toast.success(r.message); qc.invalidateQueries({ queryKey: ['acc', 'auth'] }); setIstisna(null); setGerekce('') },
    onError: (e) => toast.error(apiError(e)),
  })

  if (isLoading) return <BrandLoaderBlock />
  if (!data) return null

  return (
    <div className="space-y-4">
      <Section title="Görev ayrılığı özeti">
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="İncelenen kullanıcı" value={data.summary.users_checked} />
          <Stat label="Çakışmalı kullanıcı" value={data.summary.users_with_conflicts}
            tone={data.summary.users_with_conflicts ? 'warning' : 'positive'} />
          <Stat label="Engelleyici çakışma" value={data.summary.blocking ?? 0}
            tone={(data.summary.blocking ?? 0) > 0 ? 'negative' : 'positive'} />
          <Stat label="İstisnalı" value={data.summary.excepted} />
        </div>
      </Section>

      {data.users.length === 0 ? (
        <Notice tone="info">Görev ayrılığı çakışması yok.</Notice>
      ) : data.users.map(k => (
        <Section key={k.user_id} title={k.user_name}
          description={`${k.email}${k.roles.length ? ' · ' + k.roles.join(', ') : ''}${k.is_owner ? ' · şirket sahibi' : ''}`}>
          <div className="space-y-2">
            {k.conflicts.map(c => (
              <div key={c.code} className={cn('rounded-lg border p-3',
                c.excepted ? 'border-zinc-200 dark:border-zinc-700'
                  : c.severity === 'blocking' ? 'border-rose-200 bg-rose-50/50 dark:border-rose-900 dark:bg-rose-950/20'
                  : 'border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20')}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{c.label}</p>
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{c.explanation}</p>
                    {c.excepted && c.exception && (
                      <p className="mt-1 text-xs text-zinc-500">
                        İstisna: {c.exception.reason}
                        {c.exception.valid_to && ` (${c.exception.valid_to} tarihine kadar)`}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge label={c.severity === 'blocking' ? 'Engelleyici' : 'Uyarı'} color={c.severity === 'blocking' ? 'rose' : 'amber'} />
                    {c.excepted && <Badge label="İstisnalı" color="gray" />}
                    {!c.excepted && !c.inherited && (
                      <button onClick={() => setIstisna({ userId: k.user_id, code: c.code })}
                        className="text-xs text-blue-600 hover:underline dark:text-blue-400">
                        İstisna tanımla
                      </button>
                    )}
                  </div>
                </div>

                {istisna?.userId === k.user_id && istisna.code === c.code && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input value={gerekce} onChange={e => setGerekce(e.target.value)}
                      placeholder="İstisna gerekçesi (en az 10 karakter)"
                      className="min-w-[220px] flex-1 rounded-md border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100" />
                    <button onClick={() => ver.mutate()} disabled={gerekce.trim().length < 10 || ver.isPending}
                      className="rounded-md bg-amber-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-50">Kaydet</button>
                    <button onClick={() => { setIstisna(null); setGerekce('') }}
                      className="rounded-md border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-700 dark:text-zinc-300">Vazgeç</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      ))}
    </div>
  )
}

function Matris() {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['acc', 'auth', 'matrix'],
    queryFn: () => get<{ data: {
      rules: { id: string; action: string; min_amount: number; max_amount: number | null; required_approvals: number; required_permission: string | null; note: string | null }[]
      currency: string
      actions: Record<string, string>
    } }>(`${A}/authorization/approval-matrix`).then(r => r.data),
  })

  const kur = useMutation({
    mutationFn: () => post<{ message: string }>(`${A}/authorization/approval-matrix/install`, {}),
    onSuccess: (r) => { toast.success(r.message); qc.invalidateQueries({ queryKey: ['acc', 'auth'] }) },
    onError: (e) => toast.error(apiError(e)),
  })

  if (isLoading) return <BrandLoaderBlock />
  const kurallar = data?.rules ?? []

  return (
    <Section
      title="Onay matrisi"
      description={`${kurallar.length} kural · ${data?.currency}`}
      action={
        <button onClick={() => kur.mutate()} disabled={kur.isPending}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          Varsayılan kuralları kur
        </button>
      }
    >
      {kurallar.length === 0 && (
        <Notice tone="info">
          Onay kuralı tanımlı değil; tutar eşiği uygulanmıyor. Varsayılanları kurarak çift imza zorunluluğunu açabilirsiniz.
        </Notice>
      )}

      <Table
        empty={kurallar.length === 0}
        head={<tr><Th>İşlem</Th><Th className="w-32" align="right">Alt sınır</Th><Th className="w-32" align="right">Üst sınır</Th><Th className="w-24" align="center">Onay</Th><Th>Gereken izin</Th></tr>}
      >
        {kurallar.map(k => (
          <tr key={k.id}>
            <Td>{data?.actions[k.action] ?? k.action}</Td>
            <Td align="right" className="tabular-nums">{money(k.min_amount)}</Td>
            <Td align="right" className="tabular-nums">{k.max_amount === null ? 'üst sınır yok' : money(k.max_amount)}</Td>
            <Td align="center">
              <Badge label={`${k.required_approvals} kişi`} color={k.required_approvals >= 2 ? 'rose' : k.required_approvals === 1 ? 'amber' : 'gray'} />
            </Td>
            <Td className="font-mono text-[11px] text-zinc-500">
              {k.required_permission ?? '—'}
              {k.note && <div className="font-sans text-xs text-zinc-400">{k.note}</div>}
            </Td>
          </tr>
        ))}
      </Table>
    </Section>
  )
}
