'use client'

// Depo kayıt listesi için filtre paneli.
// Alanlar yazılırken değil, "Ara" denince uygulanır: kullanıcı birkaç alanı
// doldururken her tuşta sorgu atılmasın.
import { useState } from 'react'
import { ChevronDown, Filter, RotateCcw, Search } from 'lucide-react'
import { cn, todayInput } from '@/lib/utils'
import { useWarehouses } from './stock'

export interface RecordFilterValues {
  search: string
  record_number: string
  product_name: string
  batch_number: string
  warehouse_id: string
  status: string
  qc_status: string
  priority: string
  posted: string
  created_by: string
  transaction_from: string
  transaction_to: string
  date_from: string
  date_to: string
}

export const bosFiltre: RecordFilterValues = {
  search: '', record_number: '', product_name: '', batch_number: '',
  warehouse_id: '', status: '', qc_status: '', priority: '', posted: '',
  created_by: '', transaction_from: '', transaction_to: '', date_from: '', date_to: '',
}

/** Boş olmayan alanları sorgu parametresine çevirir. */
export function filtreParametreleri(f: RecordFilterValues): Record<string, string> {
  return Object.fromEntries(Object.entries(f).filter(([, v]) => v !== '' && v != null))
}

export function doluFiltreSayisi(f: RecordFilterValues): number {
  return Object.values(f).filter(v => v !== '' && v != null).length
}

const DURUMLAR = [
  { v: 'draft', l: 'Taslak' },
  { v: 'pending', l: 'Bekliyor' },
  { v: 'in_progress', l: 'İşlemde' },
  { v: 'approved', l: 'Onaylandı' },
  { v: 'completed', l: 'Tamamlandı' },
  { v: 'cancelled', l: 'İptal' },
]

const QC_DURUMLARI = [
  { v: 'passed', l: 'QC onaylı' },
  { v: 'rejected', l: 'QC reddedildi' },
  { v: 'pending', l: 'QC bekliyor' },
]

const ONCELIKLER = [
  { v: 'low', l: 'Düşük' },
  { v: 'medium', l: 'Orta' },
  { v: 'high', l: 'Yüksek' },
  { v: 'urgent', l: 'Acil' },
]

const STOK_DURUMU = [
  { v: '1', l: 'Stoğa işlendi' },
  { v: '0', l: 'İşlenmedi / geri alındı' },
]

const alanCls =
  'w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100'

function Alan({ etiket, children }: { etiket: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">{etiket}</span>
      {children}
    </label>
  )
}

function Secim({
  deger, onChange, bos, secenekler,
}: {
  deger: string
  onChange: (v: string) => void
  bos: string
  secenekler: { v: string; l: string }[]
}) {
  return (
    <select value={deger} onChange={e => onChange(e.target.value)} className={alanCls}>
      <option value="">{bos}</option>
      {secenekler.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  )
}

interface Props {
  /** Uygulanmış filtreler; "Ara" ya da "Sıfırla" ile değişir. */
  onApply: (f: RecordFilterValues) => void
  /** Listede şu an kaç kayıt görünüyor; başlıkta gösterilir. */
  total?: number
  personel?: { id: string; name: string }[]
}

export function RecordFilters({ onApply, total, personel = [] }: Props) {
  const { data: depolar = [] } = useWarehouses()
  const [acik, setAcik] = useState(false)
  const [f, setF] = useState<RecordFilterValues>(bosFiltre)
  const [uygulanan, setUygulanan] = useState(0)

  const set = (k: keyof RecordFilterValues) => (v: string) => setF(p => ({ ...p, [k]: v }))

  const ara = (e?: React.FormEvent) => {
    e?.preventDefault()
    setUygulanan(doluFiltreSayisi(f))
    onApply(f)
  }

  const sifirla = () => {
    setF(bosFiltre)
    setUygulanan(0)
    onApply(bosFiltre)
  }

  return (
    <form
      onSubmit={ara}
      className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
    >
      <button
        type="button"
        onClick={() => setAcik(v => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <Filter className="h-4 w-4 text-zinc-400" />
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Filtreler</span>
        {uygulanan > 0 && (
          <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-medium text-white">
            {uygulanan} filtre
          </span>
        )}
        {total != null && (
          <span className="text-xs text-zinc-500">{total.toLocaleString('tr-TR')} kayıt</span>
        )}
        <ChevronDown className={cn('ml-auto h-4 w-4 text-zinc-400 transition-transform', acik && 'rotate-180')} />
      </button>

      {acik && (
        <div className="border-t border-zinc-200 px-4 py-4 dark:border-zinc-800">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <Alan etiket="Kayıt No">
              <input value={f.record_number} onChange={e => set('record_number')(e.target.value)}
                placeholder="WAR-202610-00001" className={alanCls} />
            </Alan>

            <Alan etiket="Ürün / SKU">
              <input value={f.product_name} onChange={e => set('product_name')(e.target.value)}
                placeholder="Ürün adı veya SKU" className={alanCls} />
            </Alan>

            <Alan etiket="Parti / Lot">
              <input value={f.batch_number} onChange={e => set('batch_number')(e.target.value)}
                placeholder="Lot numarası" className={alanCls} />
            </Alan>

            <Alan etiket="Başlık / açıklama">
              <input value={f.search} onChange={e => set('search')(e.target.value)}
                placeholder="Metinde ara" className={alanCls} />
            </Alan>

            <Alan etiket="Depo">
              <Secim deger={f.warehouse_id} onChange={set('warehouse_id')} bos="Tüm depolar"
                secenekler={depolar.filter(d => d.is_active).map(d => ({ v: d.id, l: d.name }))} />
            </Alan>

            <Alan etiket="Durum">
              <Secim deger={f.status} onChange={set('status')} bos="Tüm durumlar" secenekler={DURUMLAR} />
            </Alan>

            <Alan etiket="Kalite kontrol">
              <Secim deger={f.qc_status} onChange={set('qc_status')} bos="Hepsi" secenekler={QC_DURUMLARI} />
            </Alan>

            <Alan etiket="Stok durumu">
              <Secim deger={f.posted} onChange={set('posted')} bos="Hepsi" secenekler={STOK_DURUMU} />
            </Alan>

            <Alan etiket="Öncelik">
              <Secim deger={f.priority} onChange={set('priority')} bos="Hepsi" secenekler={ONCELIKLER} />
            </Alan>

            {personel.length > 0 && (
              <Alan etiket="Oluşturan">
                <Secim deger={f.created_by} onChange={set('created_by')} bos="Herkes"
                  secenekler={personel.map(p => ({ v: p.id, l: p.name }))} />
              </Alan>
            )}

            <Alan etiket="İşlem tarihi (baş.)">
              <input type="date" max={todayInput()} value={f.transaction_from}
                onChange={e => set('transaction_from')(e.target.value)} className={alanCls} />
            </Alan>

            <Alan etiket="İşlem tarihi (bit.)">
              <input type="date" max={todayInput()} value={f.transaction_to}
                onChange={e => set('transaction_to')(e.target.value)} className={alanCls} />
            </Alan>

            <Alan etiket="Kayıt tarihi (baş.)">
              <input type="date" max={todayInput()} value={f.date_from}
                onChange={e => set('date_from')(e.target.value)} className={alanCls} />
            </Alan>

            <Alan etiket="Kayıt tarihi (bit.)">
              <input type="date" max={todayInput()} value={f.date_to}
                onChange={e => set('date_to')(e.target.value)} className={alanCls} />
            </Alan>
          </div>

          <div className="mt-4 flex gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              <Search className="h-4 w-4" /> Ara
            </button>
            <button
              type="button"
              onClick={sifirla}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <RotateCcw className="h-4 w-4" /> Sıfırla
            </button>
          </div>
        </div>
      )}
    </form>
  )
}
