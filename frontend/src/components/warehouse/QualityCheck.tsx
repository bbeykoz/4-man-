'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { StepPanel, StepDots } from '@/components/common/StepPanel'
import { SignaturePad } from './SignaturePad'
import { Camera, CheckCircle2, Clock, ImagePlus, Loader2, ShieldCheck, X, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { api, post } from '@/lib/api'
import { cn, formatDateTime } from '@/lib/utils'
import type { WarehouseRecord } from '@/types/api.types'

// Depo müdürü: '/modules/warehouse', depo kontrolcüsü: '/modules/warehouse-control'
export type WarehouseModulePath = '/modules/warehouse' | '/modules/warehouse-control'

const MULTIPART = { headers: { 'Content-Type': 'multipart/form-data' } }

// ─── Görsel ──────────────────────────────────────────────────────────────────

/**
 * Telefon fotoğrafları sunucunun yükleme limitini (2 MB) aşar;
 * yüklemeden önce en uzun kenar 1600 px olacak şekilde JPEG'e küçültülür.
 */
async function compressImage(file: File, maxSide = 1600, quality = 0.82): Promise<File> {
  if (!file.type.startsWith('image/')) return file

  try {
    const bitmap = await createImageBitmap(file)
    const scale  = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width  = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()

    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (!blob) return file

    const name = file.name.replace(/\.[^.]+$/, '') || 'kalite-kontrol'
    return new File([blob], `${name}.jpg`, { type: 'image/jpeg' })
  } catch {
    // Tarayıcı çözemediyse (ör. HEIC) orijinali gönder; sunucu doğrular
    return file
  }
}

function PhotoPicker({ photo, onChange }: { photo: File | null; onChange: (file: File | null) => void }) {
  const cameraRef  = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Lütfen bir görsel seçin.'); return }
    setBusy(true)
    onChange(await compressImage(file))
    setBusy(false)
  }

  const btnCls = 'flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors'

  return (
    <div className="space-y-3">
      {preview ? (
        <div className="relative rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800">
          {/* eslint-disable-next-line @next/next/no-img-element -- yerel blob önizlemesi */}
          <img src={preview} alt="Kalite kontrol görseli" className="w-full max-h-64 object-contain" />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80"
            aria-label="Görseli kaldır"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-1 py-6 rounded-xl border-2 border-dashed border-zinc-200 dark:border-zinc-700 text-zinc-400">
          {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <ImagePlus className="h-6 w-6" />}
          <p className="text-xs">{busy ? 'Görsel hazırlanıyor...' : 'Kalite kontrol görseli ekleyin'}</p>
        </div>
      )}

      <div className="flex gap-2">
        <button type="button" className={btnCls} onClick={() => cameraRef.current?.click()} disabled={busy}>
          <Camera className="h-4 w-4" /> Fotoğraf Çek
        </button>
        <button type="button" className={btnCls} onClick={() => galleryRef.current?.click()} disabled={busy}>
          <ImagePlus className="h-4 w-4" /> Galeriden Seç
        </button>
      </div>

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
      <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  )
}

// ─── Kayıt oluşturma ─────────────────────────────────────────────────────────

/**
 * Kalite kontrol sonucu.
 * passed   → onaylandı, görsel isteğe bağlı
 * rejected → ürün reddedildi, görsel zorunlu
 * pending  → kontrol sonra yapılacak
 */
export type QcResult = 'passed' | 'rejected' | 'pending'

export interface QcAnswer {
  result: QcResult
  photo: File | null
  note: string
}

export const QC_LABELS: Record<QcResult, string> = {
  passed:   'QC Onaylı',
  rejected: 'QC Reddedildi',
  pending:  'QC Bekliyor',
}

/** Depo kaydını kalite kontrol cevabıyla tek istekte oluşturur. */
export function createRecordWithQualityCheck(
  modulePath: WarehouseModulePath,
  payload: Record<string, unknown>,
  answer: QcAnswer,
) {
  const form = new FormData()
  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined && value !== null && value !== '') form.append(key, String(value))
  }
  form.append('qc_result', answer.result)
  if (answer.photo) form.append('qc_photo', answer.photo)
  if (answer.result === 'rejected' && answer.note.trim()) form.append('qc_note', answer.note.trim())

  return post(modulePath, form, MULTIPART)
}

// ─── Kaydet'e basınca açılan pop-up ──────────────────────────────────────────

interface QualityCheckPromptProps {
  submitting: boolean
  onBack: () => void
  onSubmit: (answer: QcAnswer) => void
}

/**
 * Kaydet'e basınca çıkan kalite kontrol adımı.
 * Onayda görsel istenmez; yalnız redde kanıt görseli zorunludur.
 */
export function QualityCheckPrompt({ submitting, onBack, onSubmit }: QualityCheckPromptProps) {
  const [result, setResult] = useState<QcResult | null>(null)
  const [photo, setPhoto]   = useState<File | null>(null)
  const [note, setNote]     = useState('')

  // Tek zorunluluk: red edilen üründe görsel
  const canSubmit = result !== null && (result !== 'rejected' || !!photo)

  const choiceCls = (active: boolean, tone: 'green' | 'red' | 'amber') => cn(
    'flex-1 flex flex-col items-center gap-1.5 px-2 py-4 rounded-xl border-2 text-sm font-semibold transition-colors',
    active
      ? {
          green: 'border-green-600 bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400',
          red:   'border-red-600 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400',
          amber: 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
        }[tone]
      : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600'
  )

  const submitLabel = result === 'rejected'
    ? 'Reddet ve Kaydet'
    : result === 'pending'
      ? 'QC Bekliyor Olarak Kaydet'
      : 'Onayla ve Kaydet'

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, y: 60, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', bounce: 0, duration: 0.45 }}
        className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-md max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-center gap-3 p-5 border-b border-zinc-200 dark:border-zinc-800">
          <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-950 flex items-center justify-center shrink-0">
            <ShieldCheck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Kalite Kontrol</h2>
            <p className="text-xs text-zinc-500">Kaydı eklemeden önce kalite kontrol sonucunu seçin.</p>
          </div>
          {/* İki adımlı akış: form → kalite kontrol */}
          <StepDots total={2} current={1} />
        </div>

        <StepPanel step={result ?? 'none'} className="p-5">
          <div className="space-y-4">
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Kalite kontrol sonucu</p>
            <div className="flex gap-2">
              <button type="button" className={choiceCls(result === 'passed', 'green')} onClick={() => setResult('passed')}>
                <CheckCircle2 className="h-6 w-6" /> Onayla
              </button>
              <button type="button" className={choiceCls(result === 'rejected', 'red')} onClick={() => setResult('rejected')}>
                <XCircle className="h-6 w-6" /> Reddet
              </button>
              <button type="button" className={choiceCls(result === 'pending', 'amber')} onClick={() => setResult('pending')}>
                <Clock className="h-6 w-6" /> Sonra
              </button>
            </div>

            {result === 'passed' && (
              <p className="text-xs text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-lg px-3 py-2.5">
                Kayıt <strong>onaylı</strong> eklenecek, stok kullanılabilir hâle gelecek. Görsel zorunlu değil;
                isterseniz ekleyebilirsiniz.
              </p>
            )}

            {result === 'rejected' && (
              <div className="space-y-3">
                <p className="text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2.5">
                  Ürün reddedilecek ve stok <strong>karantinada</strong> kalacak. Kanıt görseli zorunludur.
                </p>
                <div className="space-y-2">
                  <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Red görseli <span className="text-red-500">*</span>
                  </p>
                  <PhotoPicker photo={photo} onChange={setPhoto} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
                    Red gerekçesi <span className="text-zinc-400">(isteğe bağlı)</span>
                  </label>
                  <textarea
                    rows={2}
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    maxLength={500}
                    placeholder="Örn: Ambalaj yırtık, 12 koli ıslanmış"
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm resize-none"
                  />
                </div>
              </div>
            )}

            {result === 'passed' && <PhotoPicker photo={photo} onChange={setPhoto} />}

            {result === 'pending' && (
              <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2.5">
                Kayıt <strong>&quot;Kalite kontrol bekliyor&quot;</strong> olarak eklenecek ve stok karantinada tutulacak.
                Kontrol yapıldığında listedeki rozete tıklayarak sonuçlandırabilirsiniz.
              </p>
            )}
          </div>
        </StepPanel>

        <div className="flex justify-end gap-3 px-5 pb-5">
          <button
            type="button"
            onClick={onBack}
            disabled={submitting}
            className="px-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-60"
          >
            Forma Dön
          </button>
          <button
            type="button"
            onClick={() => result && onSubmit({ result, photo, note })}
            disabled={!canSubmit || submitting}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-lg text-white transition-colors disabled:opacity-60',
              result === 'rejected' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700',
            )}
          >
            {submitting ? 'Kaydediliyor...' : submitLabel}
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ─── Liste rozeti ────────────────────────────────────────────────────────────

export function QcBadge({ record, onClick }: { record: WarehouseRecord; onClick: () => void }) {
  if (!record.qc_status) return <span className="text-xs text-zinc-400">—</span>

  const status = record.qc_status
  const style = {
    passed:   { cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', Icon: CheckCircle2, title: 'Kalite kontrol detayını gör' },
    rejected: { cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',         Icon: XCircle,     title: 'Red gerekçesini ve görseli gör' },
    pending:  { cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', Icon: Clock,       title: 'Kalite kontrolü sonuçlandır' },
  }[status]

  const { cls, Icon, title } = style

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap transition-opacity hover:opacity-80',
        cls,
      )}
    >
      <Icon className="h-3 w-3" />
      {QC_LABELS[status]}
    </button>
  )
}

// ─── Rozete tıklayınca: görsel gör / sonradan onayla ─────────────────────────

interface QcDetailModalProps {
  record: WarehouseRecord
  modulePath: WarehouseModulePath
  onClose: () => void
  onApproved: () => void
}

export function QcDetailModal({ record, modulePath, onClose, onApproved }: QcDetailModalProps) {
  const status   = record.qc_status
  const pending  = status === 'pending'
  const rejected = status === 'rejected'
  const decided  = !pending

  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [loadingPhoto, setLoadingPhoto] = useState(decided && !!record.qc_has_photo)
  const [photo, setPhoto] = useState<File | null>(null)
  const [note, setNote]   = useState('')
  const [saving, setSaving] = useState<QcResult | null>(null)

  // Görsel yetkili endpoint'ten blob olarak alınır (dosyalar herkese açık değil)
  useEffect(() => {
    if (!decided || !record.qc_has_photo) return
    let url: string | null = null
    let cancelled = false

    api.get<Blob>(`${modulePath}/${record.id}/quality-check/photo`, { responseType: 'blob' })
      .then(res => {
        if (cancelled) return
        url = URL.createObjectURL(res.data)
        setPhotoUrl(url)
      })
      .catch(() => { if (!cancelled) toast.error('Görsel yüklenemedi.') })
      .finally(() => { if (!cancelled) setLoadingPhoto(false) })

    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [decided, record.id, record.qc_has_photo, modulePath])

  /** Onayda görsel isteğe bağlı, redde zorunlu. */
  const decide = async (result: QcResult) => {
    if (result === 'rejected' && !photo) {
      toast.error('Ürün reddedildiğinde görsel zorunludur.')
      return
    }

    setSaving(result)
    try {
      const form = new FormData()
      form.append('result', result)
      if (photo) form.append('qc_photo', photo)
      if (result === 'rejected' && note.trim()) form.append('qc_note', note.trim())

      await post(`${modulePath}/${record.id}/quality-check`, form, MULTIPART)
      toast.success(result === 'rejected' ? 'Ürün reddedildi. Stok karantinada kalır.' : 'Kalite kontrol onaylandı.')
      onApproved()
      onClose()
    } catch (e) {
      toast.error((e as { message?: string })?.message ?? 'Kaydedilemedi.')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-md max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-zinc-200 dark:border-zinc-800">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Kalite Kontrol</h2>
            <p className="text-xs text-zinc-500 truncate">{record.record_number} · {record.title}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {decided ? (
            <>
              <div className={cn('flex items-center gap-2 text-sm', rejected
                ? 'text-red-700 dark:text-red-400'
                : 'text-green-700 dark:text-green-400')}>
                {rejected ? <XCircle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
                <span>
                  {rejected ? 'Reddedildi' : 'Onaylandı'}
                  {record.qc_checked_by_name && <> · <strong>{record.qc_checked_by_name}</strong></>}
                  {record.qc_checked_at && <> · {formatDateTime(record.qc_checked_at)}</>}
                </span>
              </div>

              {rejected && (
                <p className="text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2.5">
                  Stok karantinada tutuluyor, kullanılabilir stoğa geçmedi.
                </p>
              )}

              {record.qc_note && (
                <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 px-3 py-2.5">
                  <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-0.5">Gerekçe</p>
                  <p className="text-sm text-zinc-700 dark:text-zinc-300">{record.qc_note}</p>
                </div>
              )}

              {record.qc_has_photo ? (
                <div className="rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 min-h-40 flex items-center justify-center">
                  {loadingPhoto ? (
                    <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
                  ) : photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- yetkili blob URL
                    <img src={photoUrl} alt="Kalite kontrol görseli" className="w-full max-h-[60vh] object-contain" />
                  ) : (
                    <p className="text-xs text-zinc-400 py-10">Görsel bulunamadı.</p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-zinc-400">Bu kayıt için görsel eklenmemiş.</p>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Bu kayıt kalite kontrol bekliyor. Onaylarsanız stok kullanılabilir hâle gelir;
                reddederseniz karantinada kalır.
              </p>
              <div className="space-y-2">
                <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Görsel <span className="text-zinc-400">(yalnız redde zorunlu)</span>
                </p>
                <PhotoPicker photo={photo} onChange={setPhoto} />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
                  Red gerekçesi <span className="text-zinc-400">(isteğe bağlı)</span>
                </label>
                <textarea
                  rows={2}
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  maxLength={500}
                  placeholder="Örn: Ambalaj yırtık, 12 koli ıslanmış"
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm resize-none"
                />
              </div>
            </>
          )}

          {/* Teslim imzası: kaydı teslim alan kişi ekranda imzalar */}
          <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">Teslim imzası</p>
            <SignaturePad
              recordId={record.id}
              modulePath={modulePath.includes('control') ? 'warehouse-control' : 'warehouse'}
              hasSignature={record.has_signature}
              signedByName={record.signed_by_name}
              signedAt={record.signed_at}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 px-5 pb-5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            Kapat
          </button>
          {pending && (
            <>
              <button
                onClick={() => decide('rejected')}
                disabled={saving !== null}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-60"
              >
                {saving === 'rejected' ? 'Kaydediliyor...' : 'Reddet'}
              </button>
              <button
                onClick={() => decide('passed')}
                disabled={saving !== null}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors disabled:opacity-60"
              >
                {saving === 'passed' ? 'Onaylanıyor...' : 'Onayla'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
