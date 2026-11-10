'use client'

/** Hesap planı: liste, arama, hesap ekleme, şablon kurulumu. */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { BrandLoaderBlock } from '@/components/common/BrandLoader'
import { A, apiError, get, post, type ChartAccount } from './api'
import { Badge, Notice, Section, Table, Td, Th } from './ui'

const TURLER = [
  { v: 'asset',       l: 'Varlık' },
  { v: 'liability',   l: 'Yükümlülük' },
  { v: 'equity',      l: 'Özkaynak' },
  { v: 'revenue',     l: 'Gelir' },
  { v: 'expense',     l: 'Gider' },
  { v: 'off_balance', l: 'Nazım' },
]

const TUR_RENKLERI: Record<string, string> = {
  asset: 'blue', liability: 'amber', equity: 'indigo',
  revenue: 'emerald', expense: 'rose', off_balance: 'gray',
}

export function ChartPanel() {
  const qc = useQueryClient()
  const [arama, setArama] = useState('')
  const [tur, setTur] = useState('')
  const [formAcik, setFormAcik] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['acc', 'chart', arama, tur],
    queryFn: () => get<{ data: ChartAccount[] }>(`${A}/chart-accounts`, {
      params: { all: 1, ...(arama ? { search: arama } : {}), ...(tur ? { account_type: tur } : {}) },
    }).then(r => r.data),
  })

  const sablon = useMutation({
    mutationFn: () => post<{ data: { created: number }; message: string }>(`${A}/chart-accounts/install-template`, {}),
    onSuccess: (r) => {
      toast.success(r.message)
      qc.invalidateQueries({ queryKey: ['acc'] })
    },
    onError: (e) => toast.error(apiError(e)),
  })

  const hesaplar = data ?? []

  return (
    <div className="space-y-4">
      <Section
        title="Hesap planı"
        description={`${hesaplar.length} hesap`}
        action={
          <div className="flex gap-2">
            <button
              onClick={() => sablon.mutate()}
              disabled={sablon.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <Download className="h-3.5 w-3.5" /> Ülke şablonunu kur
            </button>
            <button
              onClick={() => setFormAcik(v => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-3.5 w-3.5" /> Hesap ekle
            </button>
          </div>
        }
      >
        {formAcik && <HesapFormu onClose={() => setFormAcik(false)} />}

        <div className="mb-3 flex flex-wrap gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              value={arama}
              onChange={e => setArama(e.target.value)}
              placeholder="Kod veya hesap adı"
              className="w-full rounded-lg border border-zinc-200 bg-white py-2 pl-9 pr-3 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </div>
          <select
            value={tur}
            onChange={e => setTur(e.target.value)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="">Tüm türler</option>
            {TURLER.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
          </select>
        </div>

        {isLoading ? <BrandLoaderBlock /> : (
          <Table
            empty={hesaplar.length === 0}
            head={
              <tr>
                <Th className="w-24">Kod</Th>
                <Th>Hesap</Th>
                <Th className="w-28">Tür</Th>
                <Th className="w-20" align="center">Yön</Th>
                <Th className="w-40">Özellik</Th>
              </tr>
            }
          >
            {hesaplar.map(h => (
              <tr key={h.id} className={!h.is_active ? 'opacity-50' : undefined}>
                <Td className="font-mono text-xs">{h.code}</Td>
                <Td>
                  <div className="text-zinc-900 dark:text-zinc-100">{h.name}</div>
                  {h.name_local && h.name_local !== h.name && (
                    <div className="text-xs text-zinc-400">{h.name_local}</div>
                  )}
                </Td>
                <Td><Badge label={h.account_type_label} color={TUR_RENKLERI[h.account_type]} /></Td>
                <Td align="center" className="text-xs">{h.normal_balance === 'debit' ? 'Borç' : 'Alacak'}</Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {h.is_control && <Badge label="Kontrol" color="amber" />}
                    {h.requires_partner && <Badge label="Cari zorunlu" color="blue" />}
                    {!h.is_active && <Badge label="Pasif" color="gray" />}
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </div>
  )
}

function HesapFormu({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ code: '', name: '', account_type: 'expense', normal_balance: '' })

  const kaydet = useMutation({
    mutationFn: () => post(`${A}/chart-accounts`, {
      ...form,
      normal_balance: form.normal_balance || undefined,
    }),
    onSuccess: () => {
      toast.success('Hesap eklendi.')
      qc.invalidateQueries({ queryKey: ['acc', 'chart'] })
      onClose()
    },
    onError: (e) => toast.error(apiError(e)),
  })

  const alan = 'w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100'

  return (
    <form
      onSubmit={e => { e.preventDefault(); kaydet.mutate() }}
      className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800/40"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">Kod</span>
          <input required value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} className={alan} placeholder="602.01" />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">Hesap adı</span>
          <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={alan} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">Tür</span>
          <select value={form.account_type} onChange={e => setForm(f => ({ ...f, account_type: e.target.value }))} className={alan}>
            {TURLER.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
          </select>
        </label>
      </div>

      <Notice tone="info">
        Bakiye yönü boş bırakılırsa türün olağan yönü kullanılır. Kontra hesaplarda (birikmiş amortisman gibi) ters yön seçin.
      </Notice>

      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={kaydet.isPending}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {kaydet.isPending ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
        <button type="button" onClick={onClose} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm dark:border-zinc-700 dark:text-zinc-300">
          Vazgeç
        </button>
      </div>
    </form>
  )
}
