'use client'

import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Bot, Loader2, MessageSquarePlus, Send, Sparkles, X } from 'lucide-react'
import { get, post } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'

interface CopilotStatus {
  enabled: boolean
  provider: string
  tools: string[]
  suggestions: string[]
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  pending?: boolean
}

interface SendResponse {
  data: { conversation_id: string; messages: ChatMessage[] }
}

/**
 * Sağ altta yuvarlak AI asistan butonu + sohbet paneli.
 * Sağlayıcı bağlı değilken backend "henüz kurulmadı" cevabı verir; geçmiş yine kaydedilir.
 */
export function CopilotWidget() {
  const token = useAuthStore((s) => s.token)
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const { data: status } = useQuery({
    queryKey: ['copilot-status'],
    queryFn: () => get<{ data: CopilotStatus }>('/copilot/status').then((r) => r.data),
    enabled: !!token && open,
    staleTime: 60_000,
  })

  const sendMutation = useMutation({
    mutationFn: (message: string) =>
      post<SendResponse>('/copilot/messages', { message, conversation_id: conversationId }),
    onSuccess: (res) => {
      setConversationId(res.data.conversation_id)
      // Geçici mesajları sunucudan dönen kalıcı mesajlarla değiştir
      setMessages((prev) => [...prev.filter((m) => !m.pending && !m.id.startsWith('tmp-')), ...res.data.messages])
    },
    onError: (e) => {
      const message = (e as { errors?: Record<string, string[]>; message?: string })
      setMessages((prev) => [
        ...prev.filter((m) => !m.pending),
        { id: `err-${Date.now()}`, role: 'assistant', content: message.errors?.message?.[0] ?? message.message ?? 'Mesaj gönderilemedi.' },
      ])
    },
  })

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  if (!token) return null

  const send = (text: string) => {
    const message = text.trim()
    if (!message || sendMutation.isPending) return
    setInput('')
    setMessages((prev) => [
      ...prev,
      { id: `tmp-${Date.now()}`, role: 'user', content: message },
      { id: 'pending', role: 'assistant', content: '', pending: true },
    ])
    sendMutation.mutate(message)
  }

  const newChat = () => {
    setMessages([])
    setConversationId(null)
    inputRef.current?.focus()
  }

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-label="AI Asistan"
          className="fixed bottom-24 right-4 sm:right-6 z-40 w-[calc(100vw-2rem)] sm:w-96 h-[70vh] max-h-[560px] flex flex-col rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-2xl overflow-hidden"
        >
          <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-gradient-to-r from-blue-600 to-violet-600 text-white">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-tight">AI Asistan</p>
              <p className="text-[11px] text-white/80 leading-tight">
                {status?.enabled ? 'Çevrimiçi' : 'Henüz kurulmadı · Beta'}
              </p>
            </div>
            <button onClick={newChat} title="Yeni sohbet" className="p-1.5 rounded-lg hover:bg-white/15">
              <MessageSquarePlus className="h-4 w-4" />
            </button>
            <button onClick={() => setOpen(false)} title="Kapat" className="p-1.5 rounded-lg hover:bg-white/15">
              <X className="h-4 w-4" />
            </button>
          </div>

          {status && !status.enabled && (
            <div className="px-4 py-2 text-[11px] text-amber-800 bg-amber-50 border-b border-amber-100 dark:text-amber-300 dark:bg-amber-950/40 dark:border-amber-900">
              Yapay zekâ servisi henüz bağlı değil. Altyapı hazır; mesajlarınız kaydedilir.
            </div>
          )}

          <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center gap-3">
                <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-950 flex items-center justify-center">
                  <Bot className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 max-w-[260px]">
                  Stok, SKT, risk ve satın alma hakkında sorun.
                </p>
                <div className="flex flex-col gap-2 w-full">
                  {(status?.suggestions ?? []).map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="text-left text-xs px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m) => (
                <div key={m.id} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                  <div
                    className={cn(
                      'max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words',
                      m.role === 'user'
                        ? 'bg-blue-600 text-white rounded-br-md'
                        : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 rounded-bl-md'
                    )}
                  >
                    {m.pending ? (
                      <span className="inline-flex items-center gap-1.5 text-zinc-500">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Düşünüyor...
                      </span>
                    ) : m.content}
                  </div>
                </div>
              ))
            )}
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); send(input) }}
            className="flex items-end gap-2 px-3 py-3 border-t border-zinc-200 dark:border-zinc-800"
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) }
              }}
              rows={1}
              maxLength={2000}
              placeholder="Bir soru yazın..."
              className="flex-1 resize-none max-h-28 px-3 py-2 text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={!input.trim() || sendMutation.isPending}
              className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
              aria-label="Gönder"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'AI Asistanı kapat' : 'AI Asistanı aç'}
        className="fixed bottom-6 right-4 sm:right-6 z-40 w-14 h-14 rounded-full bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-lg shadow-blue-600/30 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
      >
        {open ? <X className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
      </button>
    </>
  )
}
