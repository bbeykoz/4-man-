'use client'

// Animasyon: watermelon "draw signature". Düğme imza pedine dönüşür, imza atılınca onay rozetine.
// Fark: next-themes yerine projenin .dark sınıfı okunur; imza sunucuya PNG olarak gönderilir.
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, MotionConfig } from 'motion/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, PenLine, RotateCcw, X } from 'lucide-react'
import { toast } from 'sonner'
import useMeasure from 'react-use-measure'
import { api, post } from '@/lib/api'
import { cn } from '@/lib/utils'
import { apiErrorMessage } from './stock'

type Step = 'idle' | 'drawing' | 'done'

interface SignaturePadProps {
  /** Kaydın id'si */
  recordId: string
  /** warehouse | warehouse-control */
  modulePath: 'warehouse' | 'warehouse-control'
  /** Kayıt zaten imzalıysa imzalayan kişi */
  signedByName?: string | null
  signedAt?: string | null
  hasSignature?: boolean
  className?: string
}

export function SignaturePad({
  recordId,
  modulePath,
  signedByName,
  signedAt,
  hasSignature,
  className,
}: SignaturePadProps) {
  const [step, setStep] = useState<Step>(hasSignature ? 'done' : 'idle')
  const [name, setName] = useState('')
  const [drawn, setDrawn] = useState(false)
  const [ref, bounds] = useMeasure({ offsetSize: true })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const qc = useQueryClient()

  const strokeColor = () =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
      ? '#ffffff'
      : '#18181b'

  useEffect(() => {
    if (step !== 'drawing' || !canvasRef.current) return
    const ctx = canvasRef.current.getContext('2d')
    if (!ctx) return
    ctx.strokeStyle = strokeColor()
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [step])

  const position = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const point = 'touches' in e ? e.touches[0] : e
    return { x: point.clientX - rect.left, y: point.clientY - rect.top }
  }

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    drawing.current = true
    draw(e)
  }

  const stop = () => {
    drawing.current = false
    canvasRef.current?.getContext('2d')?.beginPath()
  }

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing.current) return
    const ctx = canvasRef.current?.getContext('2d')
    const pos = position(e)
    if (!ctx || !pos) return
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
    if (!drawn) setDrawn(true)
  }

  const clear = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
    setDrawn(false)
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      post(`/modules/${modulePath}/${recordId}/signature`, {
        signature: canvasRef.current?.toDataURL('image/png'),
        name: name.trim(),
      }),
    onSuccess: () => {
      toast.success('İmza kaydedildi.')
      setStep('done')
      qc.invalidateQueries({ queryKey: ['records'] })
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'İmza kaydedilemedi.')),
  })

  const canSave = drawn && name.trim().length >= 2 && !saveMutation.isPending

  return (
    <MotionConfig transition={{ type: 'spring', bounce: 0.15, duration: 0.7 }}>
      <motion.div
        animate={{
          width: bounds.width > 0 ? bounds.width : 'auto',
          height: bounds.height > 0 ? bounds.height : 'auto',
        }}
        className={cn(
          'relative z-10 flex items-center justify-center overflow-hidden border-2 border-dashed border-transparent transition-colors duration-300',
          step === 'drawing' && 'border-zinc-300 dark:border-zinc-700',
          className,
        )}
        style={{ borderRadius: 24 }}
      >
        <div ref={ref} className="flex shrink-0 p-1">
          <AnimatePresence mode="popLayout" initial={false}>
            {step === 'idle' && (
              <motion.button
                key="start"
                type="button"
                layoutId={`signature-${recordId}`}
                onClick={() => setStep('drawing')}
                className="flex items-center gap-2 rounded-full bg-zinc-100 px-5 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
              >
                <motion.div layoutId={`signature-icon-${recordId}`}>
                  <PenLine className="h-4 w-4" />
                </motion.div>
                <motion.span layoutId={`signature-text-${recordId}`}>Teslim imzası al</motion.span>
              </motion.button>
            )}

            {step === 'drawing' && (
              <motion.div
                key="pad"
                exit={{ opacity: 0, y: '-20%' }}
                className="w-[300px] max-w-full rounded-3xl bg-white p-4 dark:bg-zinc-900"
              >
                <div className="mb-3 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={clear}
                    aria-label="İmzayı temizle"
                    className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                  <span className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">İmzalayın</span>
                  <button
                    type="button"
                    onClick={() => { clear(); setStep('idle') }}
                    aria-label="Vazgeç"
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-200 text-zinc-600 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-200"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                <canvas
                  ref={canvasRef}
                  width={268}
                  height={150}
                  onMouseDown={start}
                  onMouseMove={draw}
                  onMouseUp={stop}
                  onMouseLeave={stop}
                  onTouchStart={start}
                  onTouchMove={draw}
                  onTouchEnd={stop}
                  className="h-[150px] w-full touch-none rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800"
                />

                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Teslim alan kişinin adı"
                  className="mt-3 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-blue-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />

                <motion.button
                  type="button"
                  layoutId={`signature-${recordId}`}
                  whileTap={{ scale: 0.97 }}
                  disabled={!canSave}
                  onClick={() => saveMutation.mutate()}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  <motion.div layoutId={`signature-icon-${recordId}`}>
                    <PenLine className="h-4 w-4" />
                  </motion.div>
                  <motion.span layoutId={`signature-text-${recordId}`}>
                    {saveMutation.isPending ? 'Kaydediliyor…' : 'İmzayı kaydet'}
                  </motion.span>
                </motion.button>
              </motion.div>
            )}

            {step === 'done' && (
              <motion.div
                key="done"
                layoutId={`signature-${recordId}`}
                className="flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white"
              >
                <motion.div layoutId={`signature-icon-${recordId}`}>
                  <CheckCircle2 className="h-4 w-4" />
                </motion.div>
                <motion.span layoutId={`signature-text-${recordId}`}>
                  {signedByName || name ? `İmzaladı: ${signedByName || name}` : 'İmzalandı'}
                  {signedAt && <span className="ml-1 opacity-80">· {new Date(signedAt).toLocaleDateString('tr-TR')}</span>}
                </motion.span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </MotionConfig>
  )
}

/** Tablo hücresi: imzalıysa isim gösterir (tıklayınca imzayı açar), değilse imza penceresini açar. */
export function SignatureCell({
  record,
  modulePath,
}: {
  record: { id: string; has_signature?: boolean; signed_by_name?: string | null; signed_at?: string | null }
  modulePath: 'warehouse' | 'warehouse-control'
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={record.has_signature ? `İmzalayan: ${record.signed_by_name}` : 'Teslim imzası al'}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs transition-colors',
          record.has_signature
            ? 'text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30'
            : 'text-zinc-400 hover:bg-zinc-100 hover:text-blue-600 dark:hover:bg-zinc-800',
        )}
      >
        {record.has_signature ? <CheckCircle2 className="h-3.5 w-3.5" /> : <PenLine className="h-3.5 w-3.5" />}
        <span className="max-w-24 truncate">
          {record.has_signature ? (record.signed_by_name ?? 'İmzalı') : 'İmza al'}
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-zinc-900">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Teslim imzası</h2>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                aria-label="Kapat"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex justify-center">
              <SignaturePad
                recordId={record.id}
                modulePath={modulePath}
                hasSignature={record.has_signature}
                signedByName={record.signed_by_name}
                signedAt={record.signed_at}
              />
            </div>

            {record.has_signature && (
              <SignatureImage recordId={record.id} modulePath={modulePath} />
            )}
          </div>
        </div>
      )}
    </>
  )
}

/** Kaydedilmiş imzayı yetkili uçtan blob olarak çeker. */
function SignatureImage({ recordId, modulePath }: { recordId: string; modulePath: string }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false

    api.get<Blob>(`/modules/${modulePath}/${recordId}/signature`, { responseType: 'blob' })
      .then(res => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(res.data)
        setUrl(objectUrl)
      })
      .catch(() => {})

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [recordId, modulePath])

  if (!url) return null

  return (
    <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-800">
      {/* eslint-disable-next-line @next/next/no-img-element -- yetkili blob URL */}
      <img src={url} alt="Teslim imzası" className="mx-auto max-h-40 object-contain" />
    </div>
  )
}
