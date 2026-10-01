'use client'

// Tanıtım sayfasının iletişim formu. Gönderilen her kayıt panelde satış ekibinin
// destek talebi olarak açılır (POST /public/leads, oturum gerektirmez).
import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, Loader2, Send } from 'lucide-react'
import { post } from '@/lib/api'
import { cn } from '@/lib/utils'

const SUBJECTS = [
  { value: 'demo', label: 'Demo istiyorum' },
  { value: 'sales', label: 'Fiyat ve paketler' },
  { value: 'setup', label: 'Kurulum ve eğitim' },
  { value: 'support', label: 'Teknik soru' },
]

const emptyForm = { name: '', email: '', phone: '', company: '', subject: 'demo', message: '' }

function apiMessage(e: unknown, fallback: string) {
  const err = e as { message?: string; errors?: Record<string, string[]> }
  return (err?.errors ? Object.values(err.errors)[0]?.[0] : undefined) ?? err?.message ?? fallback
}

export function ContactForm() {
  const [form, setForm] = useState(emptyForm)
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (status !== 'idle') return

    setStatus('sending')
    setError(null)

    try {
      await post('/public/leads', form)
      setStatus('sent')
      setForm(emptyForm)
    } catch (err) {
      setError(apiMessage(err, 'Mesaj gönderilemedi. Lütfen tekrar deneyin.'))
      setStatus('idle')
    }
  }

  const field = 'w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-500 focus:border-blue-500'

  return (
    <form onSubmit={submit} className="rounded-3xl border border-zinc-800 bg-zinc-900/50 p-6">
      <AnimatePresence mode="wait" initial={false}>
        {status === 'sent' ? (
          <motion.div
            key="sent"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-3 py-10 text-center"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600">
              <Check className="h-6 w-6 text-white" strokeWidth={3} />
            </span>
            <p className="text-lg font-semibold text-zinc-100">Mesajınız alındı</p>
            <p className="max-w-sm text-sm text-zinc-400">
              Satış ekibimiz en kısa sürede dönecek. Acil bir durum varsa telefonla da ulaşabilirsiniz.
            </p>
            <button
              type="button"
              onClick={() => setStatus('idle')}
              className="mt-2 text-sm text-blue-400 hover:text-blue-300"
            >
              Yeni mesaj gönder
            </button>
          </motion.div>
        ) : (
          <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                required
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ad soyad"
                className={field}
              />
              <input
                required
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="E-posta"
                className={field}
              />
              <input
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="Telefon (isteğe bağlı)"
                className={field}
              />
              <input
                value={form.company}
                onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                placeholder="Şirket (isteğe bağlı)"
                className={field}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {SUBJECTS.map(s => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, subject: s.value }))}
                  className={cn(
                    'rounded-full px-3.5 py-1.5 text-sm transition-colors',
                    form.subject === s.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700',
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <textarea
              required
              rows={4}
              value={form.message}
              onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
              placeholder="Kaç deponuz var, hangi konuda yardım istiyorsunuz?"
              className={cn(field, 'resize-none')}
            />

            {error && <p className="text-sm text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={status === 'sending'}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-60"
            >
              {status === 'sending' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {status === 'sending' ? 'Gönderiliyor…' : 'Gönder'}
            </button>

            <p className="text-center text-xs text-zinc-500">
              Mesajınız satış ekibimize iletilir. Bilgileriniz üçüncü taraflarla paylaşılmaz.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </form>
  )
}
