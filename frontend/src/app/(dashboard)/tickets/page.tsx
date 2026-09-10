'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { get, post } from '@/lib/api'
import { toast } from 'sonner'
import { Ticket, Plus, X, ChevronDown, ChevronUp, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'

type TicketType     = 'support' | 'idea'
type TicketStatus   = 'open' | 'in_progress' | 'answered' | 'closed'
type TicketPriority = 'low' | 'medium' | 'high'

interface TicketItem {
  id: string
  ticket_number: number
  title: string
  body: string
  type: TicketType
  status: TicketStatus
  priority: TicketPriority
  admin_note: string | null
  created_at: string
}

interface PaginatedTickets {
  success: boolean
  data: TicketItem[]
  meta: { total: number; per_page: number; current_page: number; last_page: number }
}

const statusLabel: Record<TicketStatus, string>     = { open: 'Açık', in_progress: 'İşlemde', answered: 'Yanıtlandı', closed: 'Kapalı' }
const statusColor: Record<TicketStatus, string>     = {
  open: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  answered: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  closed: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
}
const priorityLabel: Record<TicketPriority, string> = { low: 'Düşük', medium: 'Orta', high: 'Yüksek' }
const priorityColor: Record<TicketPriority, string> = {
  low: 'text-zinc-500',
  medium: 'text-amber-600 dark:text-amber-400',
  high: 'text-red-600 dark:text-red-400',
}
const typeLabel: Record<TicketType, string> = { support: 'Destek', idea: 'Fikir' }

export default function TicketsPage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [title,    setTitle]    = useState('')
  const [body,     setBody]     = useState('')
  const [type,     setType]     = useState<TicketType>('support')
  const [priority, setPriority] = useState<TicketPriority>('medium')

  const { data, isLoading } = useQuery<PaginatedTickets>({
    queryKey: ['tickets'],
    queryFn: () => get('/tickets'),
  })

  const createMutation = useMutation({
    mutationFn: () => post('/tickets', { title, body, type, priority }),
    onSuccess: () => {
      toast.success('Talebiniz iletildi.')
      qc.invalidateQueries({ queryKey: ['tickets'] })
      setShowForm(false)
      setTitle(''); setBody(''); setType('support'); setPriority('medium')
    },
    onError: (err: any) => toast.error(err?.message ?? 'Hata oluştu.'),
  })

  const tickets = data?.data ?? []

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
            <Ticket className="h-5 w-5 text-blue-500" />
            Destek & Fikir
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            Sorunlarınızı bildirin veya panel için fikir önerin.
          </p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showForm ? 'İptal' : 'Yeni Talep'}
        </button>
      </div>

      {/* New ticket form */}
      {showForm && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Yeni Talep Oluştur</h2>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Tür</label>
              <select
                value={type}
                onChange={e => setType(e.target.value as TicketType)}
                className="w-full text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="support">Destek</option>
                <option value="idea">Fikir</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Öncelik</label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value as TicketPriority)}
                className="w-full text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="low">Düşük</option>
                <option value="medium">Orta</option>
                <option value="high">Yüksek</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Başlık</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Kısa ve açıklayıcı bir başlık..."
              className="w-full text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Açıklama</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={4}
              placeholder="Durumu detaylıca açıklayın..."
              className="w-full text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
            >
              İptal
            </button>
            <button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !title.trim() || !body.trim()}
              className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition-colors"
            >
              {createMutation.isPending ? 'Gönderiliyor...' : 'Gönder'}
            </button>
          </div>
        </div>
      )}

      {/* Tickets list */}
      {isLoading ? (
        <div className="text-center py-12 text-zinc-400 text-sm">Yükleniyor...</div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-12">
          <MessageSquare className="h-10 w-10 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-500 dark:text-zinc-400 text-sm">Henüz talep oluşturmadınız.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tickets.map(ticket => {
            const expanded = expandedId === ticket.id
            return (
              <div
                key={ticket.id}
                className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden"
              >
                <button
                  onClick={() => setExpandedId(expanded ? null : ticket.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                >
                  <span className="text-xs font-mono text-zinc-400 flex-shrink-0">
                    #{ticket.ticket_number}
                  </span>
                  <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', statusColor[ticket.status])}>
                    {statusLabel[ticket.status]}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                    {typeLabel[ticket.type]}
                  </span>
                  <span className="flex-1 text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
                    {ticket.title}
                  </span>
                  <span className={cn('text-xs font-medium', priorityColor[ticket.priority])}>
                    {priorityLabel[ticket.priority]}
                  </span>
                  <span className="text-xs text-zinc-400">
                    {new Date(ticket.created_at).toLocaleDateString('tr-TR')}
                  </span>
                  {expanded ? <ChevronUp className="h-4 w-4 text-zinc-400 flex-shrink-0" /> : <ChevronDown className="h-4 w-4 text-zinc-400 flex-shrink-0" />}
                </button>

                {expanded && (
                  <div className="px-4 pb-4 pt-1 border-t border-zinc-100 dark:border-zinc-800 space-y-3">
                    <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{ticket.body}</p>
                    {ticket.admin_note && (
                      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2">
                        <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-0.5">Yönetici Notu</p>
                        <p className="text-sm text-blue-800 dark:text-blue-300">{ticket.admin_note}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
