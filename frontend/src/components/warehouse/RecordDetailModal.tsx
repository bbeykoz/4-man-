'use client'

// Kayıt detayı: listede yalnız imza ve kalite kontrol görünüyordu. Kayıt numarasına
// ya da göz simgesine tıklayınca tüm alanlar tek pencerede açılır.
import { useEffect, useState } from 'react'
import { BookCheck, CheckCircle2, Clock, Loader2, Undo2, X, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { cn, formatDate, formatDateTime } from '@/lib/utils'
import { StatusBadge } from '@/components/common/StatusBadge'
import type { WarehouseRecord } from '@/types/api.types'
import type { WarehouseModulePath } from './QualityCheck'
import { QC_LABELS } from './QualityCheck'
import { SignaturePad } from './SignaturePad'
import { formatQty } from './stock'

const TYPE_LABELS: Record<string, string> = {
  stock_in:    'Stok Girişi',
  stock_out:   'Stok Çıkışı',
  transfer:    'Transfer',
  adjustment:  'Düzeltme',
  inspection:  'Denetim',
  stock_count: 'Stok Sayımı',
  damage:      'Hasar',
  return_in:   'İade Girişi',
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="shrink-0 text-xs text-zinc-500">{label}</span>
      <span className="text-right text-sm text-zinc-800 dark:text-zinc-200">{children}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{title}</p>
      <div className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 px-3 dark:divide-zinc-800 dark:border-zinc-800">
        {children}
      </div>
    </div>
  )
}

/** Kalite kontrol görseli yetkili uçtan blob olarak çekilir. */
function QcPhoto({ recordId, modulePath }: { recordId: string; modulePath: WarehouseModulePath }) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false

    api.get<Blob>(`${modulePath}/${recordId}/quality-check/photo`, { responseType: 'blob' })
      .then(res => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(res.data)
        setUrl(objectUrl)
      })
      .catch(() => { if (!cancelled) toast.error('Kalite kontrol görseli yüklenemedi.') })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [recordId, modulePath])

  return (
    <div className="flex min-h-32 items-center justify-center overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800">
      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
      ) : url ? (
        // eslint-disable-next-line @next/next/no-img-element -- yetkili blob URL
        <img src={url} alt="Kalite kontrol görseli" className="max-h-72 w-full object-contain" />
      ) : (
        <p className="py-8 text-xs text-zinc-400">Görsel bulunamadı.</p>
      )}
    </div>
  )
}

interface Props {
  record: WarehouseRecord
  modulePath: WarehouseModulePath
  onClose: () => void
}

export function RecordDetailModal({ record: r, modulePath, onClose }: Props) {
  const qc = r.qc_status
  const qcStyle = qc === 'passed'
    ? { Icon: CheckCircle2, cls: 'text-green-600 dark:text-green-400' }
    : qc === 'rejected'
      ? { Icon: XCircle, cls: 'text-red-600 dark:text-red-400' }
      : { Icon: Clock, cls: 'text-amber-600 dark:text-amber-400' }

  const quantity = r.quantity != null ? `${formatQty(Number(r.quantity))} ${r.unit ?? ''}`.trim() : '—'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl dark:bg-zinc-900">
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-semibold text-zinc-900 dark:text-zinc-100">{r.title}</h2>
              <StatusBadge status={r.status} label={r.status_label} />
            </div>
            <p className="mt-0.5 font-mono text-xs text-zinc-500">
              {r.record_number}
              {r.type && <> · {TYPE_LABELS[r.type] ?? r.type}</>}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {/* Stok defteri durumu */}
          {r.reversed_at ? (
            <p className="flex items-center gap-2 rounded-lg bg-zinc-100 px-3 py-2 text-xs text-zinc-500 dark:bg-zinc-800">
              <Undo2 className="h-3.5 w-3.5" /> İptal edildi, stok geri alındı · {formatDateTime(r.reversed_at)}
            </p>
          ) : r.posted_at ? (
            <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
              <BookCheck className="h-3.5 w-3.5" /> Stok defterine işlendi · {formatDateTime(r.posted_at)}
            </p>
          ) : (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
              Henüz stoğa işlenmedi.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Section title="Ürün">
              <Row label="Ürün">{r.product_name ?? r.product?.name ?? '—'}</Row>
              <Row label="SKU">{r.sku ?? r.product?.sku ?? '—'}</Row>
              <Row label="Miktar"><strong>{quantity}</strong></Row>
              {r.system_quantity != null && <Row label="Sistem miktarı">{formatQty(Number(r.system_quantity))}</Row>}
              <Row label="Parti / Lot">{r.batch_number ?? '—'}</Row>
              <Row label="SKT">{r.expiry_date ? formatDate(r.expiry_date) : '—'}</Row>
            </Section>

            <Section title="Yerleşim">
              <Row label="Depo">{r.warehouse_name ?? '—'}</Row>
              {r.to_warehouse_name && <Row label="Hedef depo">{r.to_warehouse_name}</Row>}
              <Row label="Lokasyon">{r.location ?? '—'}</Row>
              <Row label="Nereden">{r.from_location ?? '—'}</Row>
              <Row label="Nereye">{r.to_location ?? '—'}</Row>
              {r.direction && <Row label="Yön">{r.direction === 'increase' ? 'Artış' : 'Azalış'}</Row>}
            </Section>

            <Section title="Kayıt">
              <Row label="Öncelik">{r.priority_label ?? r.priority ?? '—'}</Row>
              <Row label="Departman">{r.department?.name ?? '—'}</Row>
              <Row label="Oluşturan">{r.created_by?.name ?? '—'}</Row>
              <Row label="Oluşturma">{formatDateTime(r.created_at)}</Row>
              {r.transaction_date && <Row label="İşlem tarihi">{formatDate(r.transaction_date)}</Row>}
              {r.completed_at && <Row label="Tamamlanma">{formatDateTime(r.completed_at)}</Row>}
            </Section>

            <Section title="Kalite kontrol">
              <Row label="Sonuç">
                <span className={cn('inline-flex items-center gap-1', qcStyle.cls)}>
                  <qcStyle.Icon className="h-3.5 w-3.5" />
                  {qc ? QC_LABELS[qc] : '—'}
                </span>
              </Row>
              <Row label="Kontrol eden">{r.qc_checked_by_name ?? '—'}</Row>
              <Row label="Kontrol zamanı">{r.qc_checked_at ? formatDateTime(r.qc_checked_at) : '—'}</Row>
              {r.qc_note && <Row label="Gerekçe">{r.qc_note}</Row>}
            </Section>
          </div>

          {r.description && (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Açıklama</p>
              <p className="whitespace-pre-wrap rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
                {r.description}
              </p>
            </div>
          )}

          {r.qc_has_photo && (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Kalite kontrol görseli</p>
              <QcPhoto recordId={r.id} modulePath={modulePath} />
            </div>
          )}

          <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Teslim imzası</p>
            <SignaturePad
              recordId={r.id}
              modulePath={modulePath.includes('control') ? 'warehouse-control' : 'warehouse'}
              hasSignature={r.has_signature}
              signedByName={r.signed_by_name}
              signedAt={r.signed_at}
            />
          </div>
        </div>

        <div className="flex justify-end px-5 pb-5">
          <button
            onClick={onClose}
            className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  )
}
