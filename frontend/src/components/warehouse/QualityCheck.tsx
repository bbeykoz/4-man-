'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { StepPanel, StepDots } from '@/components/common/StepPanel'
import { SignaturePad } from './SignaturePad'
import { Camera, CheckCircle2, Clock, ImagePlus, Loader2, ShieldCheck, X } from 'lucide-react'
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

/** Depo kaydını kalite kontrol cevabıyla tek istekte oluşturur. */
export function createRecordWithQualityCheck(
  modulePath: WarehouseModulePath,
  payload: Record<string, unknown>,
  qcDone: boolean,
  photo: File | null,
) {
  const form = new FormData()
  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined && value !== null && value !== '') form.append(key, String(value))
  }
  form.append('qc_done', qcDone ? '1' : '0')
  if (qcDone && photo) form.append('qc_photo', photo)

  return post(modulePath, form, MULTIPART)
}

// ─── Kaydet'e basınca açılan pop-up ──────────────────────────────────────────

interface QualityCheckPromptProps {
  submitting: boolean
  onBack: () => void
  onSubmit: (qcDone: boolean, photo: File | null) => void
}

export function QualityCheckPrompt({ submitting, onBack, onSubmit }: QualityCheckPromptProps) {
  const [answer, setAnswer] = useState<'yes' | 'no' | null>(null)
  const [photo, setPhoto] = useState<File | null>(null)

  const canSubmit = answer === 'no' || (answer === 'yes' && !!photo)

  const choiceCls = (active: boolean, tone: 'green' | 'amber') => cn(
    'flex-1 flex flex-col items-center gap-1.5 px-3 py-4 rounded-xl border-2 text-sm font-semibold transition-colors',
    active
      ? tone === 'green'
        ? 'border-green-600 bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400'
        : 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
      : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600'
  )

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
            <p className="text-xs text-zinc-500">Kaydı eklemeden önce kalite kontrol durumunu belirtin.</p>
          </div>
          {/* İki adımlı akış: form → kalite kontrol */}
          <StepDots total={2} current={1} />
        </div>

        <StepPanel step={answer ?? 'none'} className="p-5">
          <div className="space-y-4">
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Kalite kontrol yapıldı mı?</p>
          <div className="flex gap-3">
            <button type="button" className={choiceCls(answer === 'yes', 'green')} onClick={() => setAnswer('yes')}>
              <CheckCircle2 className="h-6 w-6" /> Evet
            </button>
            <button type="button" className={choiceCls(answer === 'no', 'amber')} onClick={() => setAnswer('no')}>
              <Clock className="h-6 w-6" /> Hayır
            </button>
          </div>

          {answer === 'yes' && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Kalite kontrol görseli <span className="text-red-500">*</span>
              </p>
              <PhotoPicker photo={photo} onChange={setPhoto} />
            </div>
          )}

          {answer === 'no' && (
            <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2.5">
              Kayıt <strong>&quot;Kalite kontrol bekliyor&quot;</strong> olarak eklenecek. Kontrol yapıldığında listedeki
              rozete tıklayarak görsel yükleyip onaylayabilirsiniz.
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
            onClick={() => answer && onSubmit(answer === 'yes', photo)}
            disabled={!canSubmit || submitting}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-60"
          >
            {submitting ? 'Kaydediliyor...' : answer === 'no' ? 'QC Bekliyor Olarak Kaydet' : 'Onayla ve Kaydet'}
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ─── Liste rozeti ────────────────────────────────────────────────────────────

export function QcBadge({ record, onClick }: { record: WarehouseRecord; onClick: () => void }) {
  if (!record.qc_status) return <span className="text-xs text-zinc-400">—</span>

  const passed = record.qc_status === 'passed'
  return (
    <button
      type="button"
      onClick={onClick}
      title={passed ? 'Kalite kontrol görselini gör' : 'Görsel yükleyip onayla'}
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap transition-opacity hover:opacity-80',
        passed
          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
      )}
    >
      {passed ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
      {passed ? 'QC Onaylı' : 'QC Bekliyor'}
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
  const passed = record.qc_status === 'passed'
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [loadingPhoto, setLoadingPhoto] = useState(passed && !!record.qc_has_photo)
  const [photo, setPhoto] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  // Görsel yetkili endpoint'ten blob olarak alınır (dosyalar herkese açık değil)
  useEffect(() => {
    if (!passed || !record.qc_has_photo) return
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
  }, [passed, record.id, record.qc_has_photo, modulePath])

  const approve = async () => {
    if (!photo) return
    setSaving(true)
    try {
      const form = new FormData()
      form.append('qc_photo', photo)
      await post(`${modulePath}/${record.id}/quality-check`, form, MULTIPART)
      toast.success('Kalite kontrol onaylandı.')
      onApproved()
      onClose()
    } catch (e) {
      toast.error((e as { message?: string })?.message ?? 'Onaylanamadı.')
    } finally {
      setSaving(false)
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
          {passed ? (
            <>
              <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>
                  Onaylandı
                  {record.qc_checked_by_name && <> · <strong>{record.qc_checked_by_name}</strong></>}
                  {record.qc_checked_at && <> · {formatDateTime(record.qc_checked_at)}</>}
                </span>
              </div>
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
            </>
          ) : (
            <>
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Bu kayıt kalite kontrol bekliyor. Görsel yükleyerek onaylayın.
              </p>
              <PhotoPicker photo={photo} onChange={setPhoto} />
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
          {!passed && (
            <button
              onClick={approve}
              disabled={!photo || saving}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors disabled:opacity-60"
            >
              {saving ? 'Onaylanıyor...' : 'Onayla'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
