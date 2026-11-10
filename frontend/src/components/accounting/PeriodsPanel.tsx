'use client'

/** Muhasebe dönemleri: üretme, kapanış moduna alma, kapatma, yeniden açma. */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { BrandLoaderBlock } from '@/components/common/BrandLoader'
import { A, apiError, dateTR, get, post, type AccountingPeriod } from './api'
import { Badge, Notice, Section, Table, Td, Th } from './ui'

export function PeriodsPanel() {
  const qc = useQueryClient()
  const [yil, setYil] = useState(new Date().getFullYear())
  const [acilan, setAcilan] = useState<string | null>(null)
  const [gerekce, setGerekce] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['acc', 'periods', yil],
    queryFn: () => get<{ data: AccountingPeriod[] }>(`${A}/periods`, { params: { year: yil } }).then(r => r.data),
  })

  const uret = useMutation({
    mutationFn: () => post<{ message: string }>(`${A}/periods/generate`, { year: yil }),
    onSuccess: (r) => { toast.success(r.message); qc.invalidateQueries({ queryKey: ['acc', 'periods'] }) },
    onError: (e) => toast.error(apiError(e)),
  })

  const gecis = useMutation({
    mutationFn: ({ id, yol, govde }: { id: string; yol: string; govde?: Record<string, unknown> }) =>
      post<{ message: string }>(`${A}/periods/${id}/${yol}`, govde ?? {}),
    onSuccess: (r) => {
      toast.success(r.message)
      qc.invalidateQueries({ queryKey: ['acc'] })
      setAcilan(null); setGerekce('')
    },
    onError: (e) => toast.error(apiError(e)),
  })

  const donemler = data ?? []
  const dugme = 'rounded-md px-2 py-1 text-xs font-medium disabled:opacity-50'

  return (
    <Section
      title="Muhasebe dönemleri"
      description="Fişin dönemi deftere giriş tarihine göre belirlenir"
      action={
        <div className="flex items-center gap-2">
          <input
            type="number" value={yil} onChange={e => setYil(Number(e.target.value))}
            className="w-24 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <button onClick={() => uret.mutate()} disabled={uret.isPending}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            Dönemleri üret
          </button>
        </div>
      }
    >
      {isLoading ? <BrandLoaderBlock /> : (
        <>
          {donemler.length === 0 && (
            <Notice tone="warning">
              {yil} yılı için dönem tanımlı değil. Fiş yazabilmek için önce dönemleri üretin.
            </Notice>
          )}

          <Table
            empty={donemler.length === 0}
            head={
              <tr>
                <Th className="w-28">Dönem</Th>
                <Th className="w-48">Aralık</Th>
                <Th className="w-24" align="center">Fiş</Th>
                <Th className="w-32">Durum</Th>
                <Th>İşlem</Th>
              </tr>
            }
          >
            {donemler.map(d => (
              <tr key={d.id}>
                <Td className="font-medium">{d.name}</Td>
                <Td className="text-xs">{dateTR(d.start_date)} – {dateTR(d.end_date)}</Td>
                <Td align="center" className="text-xs">{d.entries_count ?? 0}</Td>
                <Td><Badge label={d.status_label} color={d.status_color} /></Td>
                <Td>
                  {acilan === d.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={gerekce} onChange={e => setGerekce(e.target.value)}
                        placeholder="Yeniden açma gerekçesi"
                        className="min-w-[180px] flex-1 rounded-md border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                      />
                      <button
                        onClick={() => gecis.mutate({ id: d.id, yol: 'reopen', govde: { reason: gerekce } })}
                        disabled={gerekce.trim().length < 3 || gecis.isPending}
                        className={`${dugme} bg-amber-600 text-white`}
                      >
                        Aç
                      </button>
                      <button onClick={() => { setAcilan(null); setGerekce('') }} className={`${dugme} border border-zinc-200 dark:border-zinc-700`}>
                        Vazgeç
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {d.status === 'open' && (
                        <>
                          <button onClick={() => gecis.mutate({ id: d.id, yol: 'start-closing' })} disabled={gecis.isPending}
                            className={`${dugme} border border-zinc-200 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300`}>
                            Kapanışa al
                          </button>
                          <button onClick={() => gecis.mutate({ id: d.id, yol: 'close' })} disabled={gecis.isPending}
                            className={`${dugme} bg-zinc-800 text-white dark:bg-zinc-700`}>
                            Kapat
                          </button>
                        </>
                      )}
                      {d.status === 'closing' && (
                        <button onClick={() => gecis.mutate({ id: d.id, yol: 'close' })} disabled={gecis.isPending}
                          className={`${dugme} bg-zinc-800 text-white dark:bg-zinc-700`}>
                          Kapat
                        </button>
                      )}
                      {d.status === 'closed' && (
                        <>
                          <button onClick={() => setAcilan(d.id)} className={`${dugme} border border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400`}>
                            Yeniden aç
                          </button>
                          <button onClick={() => gecis.mutate({ id: d.id, yol: 'lock' })} disabled={gecis.isPending}
                            className={`${dugme} border border-rose-300 text-rose-700 dark:border-rose-800 dark:text-rose-400`}>
                            Kilitle
                          </button>
                        </>
                      )}
                      {d.status === 'locked' && <span className="text-xs text-zinc-400">Kilitli dönem açılamaz</span>}
                    </div>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        </>
      )}
    </Section>
  )
}
