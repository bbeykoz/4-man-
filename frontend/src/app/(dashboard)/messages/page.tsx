'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Search, Send, Paperclip, X, File, Download, Trash2,
  MessageSquare, Plus, ChevronLeft, Check, CheckCheck,
} from 'lucide-react'
import { format, isToday, isYesterday } from 'date-fns'
import { tr } from 'date-fns/locale'
import { useAuthStore } from '@/store/auth.store'
import { messagingService, type Conversation, type Message } from '@/services/messaging.service'
import { cn } from '@/lib/utils'

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatMsgTime(date: string) {
  const d = new Date(date)
  if (isToday(d)) return format(d, 'HH:mm')
  if (isYesterday(d)) return 'Dün'
  return format(d, 'dd.MM.yyyy', { locale: tr })
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isImageMime(mime: string) {
  return mime.startsWith('image/')
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ src, name, size = 'md' }: { src?: string | null; name: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'w-7 h-7 text-xs', md: 'w-9 h-9 text-sm', lg: 'w-11 h-11 text-base' }
  if (src) {
    return <img src={src} alt={name} className={cn('rounded-full object-cover flex-shrink-0 ring-1 ring-zinc-200 dark:ring-zinc-700', sizes[size])} />
  }
  const initials = name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className={cn('rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center flex-shrink-0 text-white font-medium', sizes[size])}>
      {initials}
    </div>
  )
}

// ─── New Conversation Modal ────────────────────────────────────────────────────

function NewConversationModal({ onClose, onSelect }: { onClose: () => void; onSelect: (userId: string) => void }) {
  const [q, setQ] = useState('')
  const { data, isLoading } = useQuery({
    queryKey: ['msg-users', q],
    queryFn: () => messagingService.searchUsers(q),
    staleTime: 10_000,
  })
  const users = data?.data ?? []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Yeni Mesaj</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Kullanıcı ara..."
              className="w-full pl-9 pr-4 py-2 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto px-2 pb-3">
          {isLoading && (
            <p className="text-xs text-zinc-400 text-center py-4">Aranıyor...</p>
          )}
          {!isLoading && users.length === 0 && (
            <p className="text-xs text-zinc-400 text-center py-4">Kullanıcı bulunamadı.</p>
          )}
          {users.map((u) => (
            <button
              key={u.id}
              onClick={() => { onSelect(u.id); onClose() }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              <Avatar src={u.avatar_url} name={u.name} size="md" />
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{u.name}</p>
                <p className="text-xs text-zinc-500 truncate">{(u as any).department?.name ?? u.email}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Conversation Item ─────────────────────────────────────────────────────────

function ConvItem({ conv, active, onClick }: { conv: Conversation; active: boolean; onClick: () => void }) {
  const lastMsg = conv.last_message
  const preview = lastMsg
    ? lastMsg.type === 'file'
      ? `📎 ${lastMsg.attachments?.[0]?.original_name ?? 'Dosya'}`
      : (lastMsg.body ?? '')
    : 'Henüz mesaj yok'

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all text-left',
        active
          ? 'bg-blue-50 dark:bg-blue-950/40'
          : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
      )}
    >
      <div className="relative">
        <Avatar src={conv.other_user.avatar_url} name={conv.other_user.name} />
        {conv.unread_count > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-blue-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
            {conv.unread_count > 9 ? '9+' : conv.unread_count}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <p className={cn('text-sm truncate', active ? 'font-semibold text-blue-700 dark:text-blue-400' : 'font-medium text-zinc-900 dark:text-zinc-100')}>
            {conv.other_user.name}
          </p>
          {conv.last_message_at && (
            <span className="text-[10px] text-zinc-400 flex-shrink-0 ml-1">{formatMsgTime(conv.last_message_at)}</span>
          )}
        </div>
        <p className={cn('text-xs truncate mt-0.5', conv.unread_count > 0 ? 'text-zinc-700 dark:text-zinc-300 font-medium' : 'text-zinc-400')}>
          {preview.length > 40 ? preview.slice(0, 40) + '…' : preview}
        </p>
      </div>
    </button>
  )
}

// ─── Message Bubble ────────────────────────────────────────────────────────────

function MsgBubble({ msg, isMine, onDelete }: { msg: Message; isMine: boolean; onDelete: () => void }) {
  const [hover, setHover] = useState(false)
  const att = msg.attachments?.[0]

  return (
    <div className={cn('flex gap-2 group', isMine ? 'flex-row-reverse' : 'flex-row')} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      {!isMine && (
        <Avatar src={msg.sender?.avatar_url} name={msg.sender?.name ?? '?'} size="sm" />
      )}
      <div className={cn('max-w-[70%] flex flex-col gap-1', isMine ? 'items-end' : 'items-start')}>
        {!isMine && (
          <span className="text-[10px] text-zinc-400 px-1">{msg.sender?.name}</span>
        )}
        <div className={cn(
          'rounded-2xl px-3.5 py-2 text-sm break-words',
          isMine
            ? 'bg-blue-600 text-white rounded-tr-sm'
            : 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-100 dark:border-zinc-700 rounded-tl-sm'
        )}>
          {att ? (
            <div className="flex flex-col gap-1.5">
              {isImageMime(att.mime_type) ? (
                <a href={att.url} target="_blank" rel="noopener noreferrer">
                  <img src={att.url} alt={att.original_name} className="max-w-[220px] rounded-lg object-cover" />
                </a>
              ) : (
                <a
                  href={att.url}
                  download={att.original_name}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn('flex items-center gap-2 rounded-lg px-3 py-2', isMine ? 'bg-blue-500/40' : 'bg-zinc-100 dark:bg-zinc-700')}
                >
                  <File className="h-5 w-5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{att.original_name}</p>
                    <p className="text-[10px] opacity-70">{formatFileSize(att.size)}</p>
                  </div>
                  <Download className="h-4 w-4 flex-shrink-0 opacity-70" />
                </a>
              )}
              {msg.body && <p>{msg.body}</p>}
            </div>
          ) : (
            <p>{msg.body}</p>
          )}
        </div>
        <div className={cn('flex items-center gap-1 px-1', isMine ? 'flex-row-reverse' : 'flex-row')}>
          <span className="text-[10px] text-zinc-400">{format(new Date(msg.created_at), 'HH:mm')}</span>
          {isMine && (
            msg.read_at
              ? <CheckCheck className="h-3 w-3 text-blue-400" />
              : <Check className="h-3 w-3 text-zinc-400" />
          )}
          {isMine && hover && (
            <button onClick={onDelete} className="p-0.5 rounded hover:bg-red-50 dark:hover:bg-red-950/30 text-zinc-300 hover:text-red-500 transition-colors">
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Chat Window ───────────────────────────────────────────────────────────────

function ChatWindow({ conv, onBack }: { conv: Conversation; onBack: () => void }) {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [pendingFile, setPendingFile] = useState<File | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['messages', conv.id],
    queryFn: () => messagingService.getMessages(conv.id),
    refetchInterval: 3000,
  })
  const messages = data?.data ?? []

  // Mark read when conversation opens
  useEffect(() => {
    messagingService.markRead(conv.id).catch(() => {})
    qc.invalidateQueries({ queryKey: ['msg-conversations'] })
    qc.invalidateQueries({ queryKey: ['msg-unread'] })
  }, [conv.id])

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (pendingFile) {
        return messagingService.sendFile(conv.id, pendingFile, text || undefined)
      }
      return messagingService.sendMessage(conv.id, text)
    },
    onSuccess: () => {
      setText('')
      setPendingFile(null)
      qc.invalidateQueries({ queryKey: ['messages', conv.id] })
      qc.invalidateQueries({ queryKey: ['msg-conversations'] })
    },
    onError: () => toast.error('Mesaj gönderilemedi.'),
  })

  const deleteMutation = useMutation({
    mutationFn: (msgId: string) => messagingService.deleteMessage(conv.id, msgId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['messages', conv.id] }),
    onError: () => toast.error('Mesaj silinemedi.'),
  })

  const handleSend = () => {
    if (!text.trim() && !pendingFile) return
    sendMutation.mutate()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 20 * 1024 * 1024) {
        toast.error('Dosya 20MB\'dan büyük olamaz.')
        return
      }
      setPendingFile(file)
    }
    e.target.value = ''
  }

  // Group messages by date
  const grouped: { date: string; msgs: Message[] }[] = []
  messages.forEach((msg) => {
    const d = new Date(msg.created_at)
    const label = isToday(d) ? 'Bugün' : isYesterday(d) ? 'Dün' : format(d, 'd MMMM yyyy', { locale: tr })
    const last = grouped[grouped.length - 1]
    if (last && last.date === label) last.msgs.push(msg)
    else grouped.push({ date: label, msgs: [msg] })
  })

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex-shrink-0">
        <button onClick={onBack} className="lg:hidden p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <Avatar src={conv.other_user.avatar_url} name={conv.other_user.name} />
        <div>
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{conv.other_user.name}</p>
          <p className="text-xs text-zinc-400">{conv.other_user.email}</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-zinc-50 dark:bg-zinc-900/50">
        {isLoading && (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {!isLoading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-16">
            <MessageSquare className="h-10 w-10 text-zinc-300 dark:text-zinc-700 mb-3" />
            <p className="text-sm text-zinc-400">Henüz mesaj yok.</p>
            <p className="text-xs text-zinc-300 dark:text-zinc-600 mt-1">İlk mesajı siz gönderin!</p>
          </div>
        )}
        {grouped.map(({ date, msgs }) => (
          <div key={date} className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800" />
              <span className="text-[10px] text-zinc-400 px-2">{date}</span>
              <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800" />
            </div>
            {msgs.map((msg) => (
              <MsgBubble
                key={msg.id}
                msg={msg}
                isMine={msg.sender_id === user?.id}
                onDelete={() => deleteMutation.mutate(msg.id)}
              />
            ))}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Pending file preview */}
      {pendingFile && (
        <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-950/20 border-t border-blue-100 dark:border-blue-900/40 flex-shrink-0">
          <File className="h-4 w-4 text-blue-500 flex-shrink-0" />
          <span className="text-xs text-blue-700 dark:text-blue-400 truncate flex-1">{pendingFile.name}</span>
          <span className="text-[10px] text-blue-500">{formatFileSize(pendingFile.size)}</span>
          <button onClick={() => setPendingFile(null)} className="p-0.5 rounded hover:bg-blue-100 dark:hover:bg-blue-900/40 text-blue-400">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Input */}
      <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex-shrink-0">
        <div className="flex items-end gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            className="p-2 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex-shrink-0"
            title="Dosya ekle"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <input type="file" ref={fileRef} onChange={handleFileChange} className="hidden" />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Mesaj yaz... (Enter ile gönder)"
            rows={1}
            className="flex-1 resize-none px-3.5 py-2.5 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 max-h-28 overflow-y-auto"
            style={{ minHeight: '40px' }}
          />
          <button
            onClick={handleSend}
            disabled={(!text.trim() && !pendingFile) || sendMutation.isPending}
            className={cn(
              'p-2 rounded-xl flex-shrink-0 transition-all',
              (!text.trim() && !pendingFile) || sendMutation.isPending
                ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-300 dark:text-zinc-600 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
            )}
          >
            {sendMutation.isPending
              ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <Send className="h-4 w-4" />
            }
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function MessagesPage() {
  const qc = useQueryClient()
  const [activeConv, setActiveConv] = useState<Conversation | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['msg-conversations'],
    queryFn: () => messagingService.getConversations(),
    refetchInterval: 5000,
  })
  const conversations = data?.data ?? []

  // Auto-select first conversation on desktop when list loads (if none active)
  useEffect(() => {
    if (!activeConv && conversations.length > 0 && typeof window !== 'undefined' && window.innerWidth >= 1024) {
      setActiveConv(conversations[0])
    }
  }, [conversations.length])


  const filtered = search
    ? conversations.filter((c) =>
        c.other_user.name.toLowerCase().includes(search.toLowerCase()) ||
        c.other_user.email.toLowerCase().includes(search.toLowerCase())
      )
    : conversations

  const startConvMutation = useMutation({
    mutationFn: (userId: string) => messagingService.findOrCreate(userId),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['msg-conversations'] })
      setActiveConv(res.data)
    },
    onError: () => toast.error('Konuşma başlatılamadı.'),
  })

  const totalUnread = conversations.reduce((s, c) => s + c.unread_count, 0)

  return (
    <div className="flex h-[calc(100vh-7rem)] rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-sm">
      {/* Sidebar */}
      <div className={cn(
        'flex flex-col border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex-shrink-0',
        'w-full lg:w-80',
        activeConv ? 'hidden lg:flex' : 'flex'
      )}>
        {/* Header */}
        <div className="px-4 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Mesajlar</h1>
              {totalUnread > 0 && (
                <span className="px-1.5 py-0.5 bg-blue-600 text-white text-[10px] font-bold rounded-full">{totalUnread}</span>
              )}
            </div>
            <button
              onClick={() => setShowNew(true)}
              className="p-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
              title="Yeni mesaj"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Konuşma ara..."
              className="w-full pl-8 pr-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-2">
          {isLoading && (
            <div className="flex justify-center py-8">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {!isLoading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <MessageSquare className="h-10 w-10 text-zinc-300 dark:text-zinc-700 mb-3" />
              <p className="text-sm text-zinc-400">
                {search ? 'Konuşma bulunamadı.' : 'Henüz konuşma yok.'}
              </p>
              {!search && (
                <button
                  onClick={() => setShowNew(true)}
                  className="mt-3 text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  + Yeni konuşma başlat
                </button>
              )}
            </div>
          )}
          {filtered.map((conv) => (
            <ConvItem
              key={conv.id}
              conv={conv}
              active={activeConv?.id === conv.id}
              onClick={() => setActiveConv(conv)}
            />
          ))}
        </div>
      </div>

      {/* Chat */}
      <div className={cn(
        'flex-1',
        activeConv ? 'flex flex-col' : 'hidden lg:flex lg:flex-col'
      )}>
        {activeConv ? (
          <ChatWindow
            key={activeConv.id}
            conv={activeConv}
            onBack={() => setActiveConv(null)}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center mb-4">
              <MessageSquare className="h-8 w-8 text-blue-500" />
            </div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Özel Mesajlar</h2>
            <p className="text-sm text-zinc-400 max-w-xs">Bir konuşma seçin veya yeni bir mesaj başlatın.</p>
            <button
              onClick={() => setShowNew(true)}
              className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition-colors"
            >
              Yeni Mesaj
            </button>
          </div>
        )}
      </div>

      {/* New conversation modal */}
      {showNew && (
        <NewConversationModal
          onClose={() => setShowNew(false)}
          onSelect={(userId) => startConvMutation.mutate(userId)}
        />
      )}
    </div>
  )
}
