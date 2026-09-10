'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { get, patch } from '@/lib/api'
import { toast } from 'sonner'
import { Ticket, Search, ChevronDown, ChevronUp, User, Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type TicketType     = 'support' | 'idea'
type TicketStatus   = 'open' | 'in_progress' | 'answered' | 'closed'
type TicketPriority = 'low' | 'medium' | 'high'

interface TicketUser {
  id: string
  name: string
  email: string
  avatar_url: string
}

interface TicketItem {
  id: string
  ticket_number: number
  title: string
  body: string
  type: TicketType
  status: TicketStatus
  priority: TicketPriority
  admin_note: string | null
  user: TicketUser
  company: { id: string; name: string } | null
  created_at: string
}

interface PaginatedTickets {
  success: boolean
  data: TicketItem[]
  meta: { total: number; per_page: number; current_page: number; last_page: number }
}

interface TicketCounts {
  success: boolean
  data: { open: number; in_progress: number; total: number }
}

const statusLabel: Record<TicketStatus, string> = { open: 'Açık', in_progress: 'İşlemde', answered: 'Yanıtlandı', closed: 'Kapalı' }
const statusColor: Record<TicketStatus, string> = {
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
const typeColor: Record<TicketType, string> = {
  support: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  idea: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
}

export default function AdminTicketsPage() {
  const qc = useQueryClient()

  const [search,   setSearch]   = useState('')
  const [status,   setStatus]   = useState('')
  const [type,     setType]     = useState('')
  const [priority, setPriority] = useState('')
  const [page,     setPage]     = useState(1)

  const [expandedId,  setExpandedId]  = useState<string | null>(null)
  const [editNote,    setEditNote]    = useState<string>('')
  const [editStatus,  setEditStatus]  = useState<TicketStatus | ''>('')
  const [editPriority,setEditPriority]= useState<TicketPriority | ''>('')
  const [saving,      setSaving]      = useState(false)

  const { data: countsData } = useQuery<TicketCounts>({
    queryKey: ['admin-ticket-counts'],
    queryFn: () => get('/admin/tickets/counts'),
  })
  const counts = countsData?.data

  const { data, isLoading } = useQuery<PaginatedTickets>({
    queryKey: ['admin-tickets', search, status, type, priority, page],
    queryFn: () => get('/admin/tickets', { params: { search, status, type, priority, page, per_page: 20 } }),
  })

  const tickets = data?.data ?? []
  const meta    = data?.meta

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, string> }) =>
      patch(`/admin/tickets/${id}`, payload),
    onSuccess: () => {
      toast.success('Talep güncellendi.')
      qc.invalidateQueries({ queryKey: ['admin-tickets'] })
      qc.invalidateQueries({ queryKey: ['admin-ticket-counts'] })
    },
    onError: (err: any) => toast.error(err?.message ?? 'Hata oluştu.'),
  })

  function openTicket(ticket: TicketItem) {
    setExpandedId(ticket.id)
    setEditNote(ticket.admin_note ?? '')
    setEditStatus(ticket.status)
    setEditPriority(ticket.priority)
  }

  function saveTicket(id: string) {
    const payload: Record<string, string> = {}
    if (editStatus)   payload.status   = editStatus
    if (editPriority) payload.priority = editPriority
    payload.admin_note = editNote
    updateMutation.mutate({ id, payload })
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
            <Ticket className="h-5 w-5 text-blue-500" />
            Destek Talepleri
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">Kullanıcılardan gelen destek ve fikir talepleri</p>
        </div>
        {counts && (
          <div className="flex items-center gap-3 text-sm">
            <span className="px-3 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400 rounded-full font-medium">
              {counts.open} Açık
            </span>
            <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 rounded-full font-medium">
              {counts.in_progress} İşlemde
            </span>
            <span className="px-3 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-full font-medium">
              {counts.total} Toplam
            </span>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3">
        <div className="flex items-center gap-2 flex-1 min-w-48 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2">
          <Search className="h-4 w-4 text-zinc-400 flex-shrink-0" />
          <input
            type="text"
            placeholder="Başlık veya kullanıcı ara..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="flex-1 text-sm bg-transparent text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none"
          />
        </div>
        <select
          value={status}
          onChange={e => { setStatus(e.target.value); setPage(1) }}
          className="text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-zinc-900 dark:text-white focus:outline-none"
        >
          <option value="">Tüm Durumlar</option>
          <option value="open">Açık</option>
          <option value="in_progress">İşlemde</option>
          <option value="answered">Yanıtlandı</option>
          <option value="closed">Kapalı</option>
        </select>
        <select
          value={type}
          onChange={e => { setType(e.target.value); setPage(1) }}
          className="text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-zinc-900 dark:text-white focus:outline-none"
        >
          <option value="">Tüm Türler</option>
          <option value="support">Destek</option>
          <option value="idea">Fikir</option>
        </select>
        <select
          value={priority}
          onChange={e => { setPriority(e.target.value); setPage(1) }}
          className="text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-zinc-900 dark:text-white focus:outline-none"
        >
          <option value="">Tüm Öncelikler</option>
          <option value="high">Yüksek</option>
          <option value="medium">Orta</option>
          <option value="low">Düşük</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="text-center py-12 text-zinc-400 text-sm">Yükleniyor...</div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-12 text-zinc-400 text-sm">Talep bulunamadı.</div>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {tickets.map(ticket => {
              const expanded = expandedId === ticket.id
              return (
                <div key={ticket.id}>
                  {/* Row */}
                  <button
                    onClick={() => expanded ? setExpandedId(null) : openTicket(ticket)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors text-left"
                  >
                    {/* Ticket number */}
                    <span className="text-xs font-mono text-zinc-400 flex-shrink-0 w-10">
                      #{ticket.ticket_number}
                    </span>
                    {/* Avatar */}
                    <img
                      src={ticket.user.avatar_url}
                      alt={ticket.user.name}
                      className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                    />
                    {/* User & company */}
                    <div className="flex flex-col min-w-0 w-36 flex-shrink-0">
                      <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate flex items-center gap-1">
                        <User className="h-3 w-3 text-zinc-400" />
                        {ticket.user.name}
                      </span>
                      {ticket.company && (
                        <span className="text-xs text-zinc-400 truncate flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {ticket.company.name}
                        </span>
                      )}
                    </div>
                    {/* Badges */}
                    <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0', statusColor[ticket.status])}>
                      {statusLabel[ticket.status]}
                    </span>
                    <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0', typeColor[ticket.type])}>
                      {typeLabel[ticket.type]}
                    </span>
                    {/* Title */}
                    <span className="flex-1 text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
                      {ticket.title}
                    </span>
                    {/* Priority */}
                    <span className={cn('text-xs font-medium flex-shrink-0', priorityColor[ticket.priority])}>
                      {priorityLabel[ticket.priority]}
                    </span>
                    {/* Date */}
                    <span className="text-xs text-zinc-400 flex-shrink-0">
                      {new Date(ticket.created_at).toLocaleDateString('tr-TR')}
                    </span>
                    {expanded
                      ? <ChevronUp className="h-4 w-4 text-zinc-400 flex-shrink-0" />
                      : <ChevronDown className="h-4 w-4 text-zinc-400 flex-shrink-0" />
                    }
                  </button>

                  {/* Expanded detail */}
                  {expanded && (
                    <div className="px-5 pb-5 pt-2 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/20 space-y-4">
                      {/* Body */}
                      <div>
                        <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1 uppercase tracking-wide">Açıklama</p>
                        <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{ticket.body}</p>
                      </div>

                      {/* Edit controls */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Durum</label>
                          <select
                            value={editStatus}
                            onChange={e => setEditStatus(e.target.value as TicketStatus)}
                            className="w-full text-sm bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="open">Açık</option>
                            <option value="in_progress">İşlemde</option>
                            <option value="answered">Yanıtlandı</option>
                            <option value="closed">Kapalı</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Öncelik</label>
                          <select
                            value={editPriority}
                            onChange={e => setEditPriority(e.target.value as TicketPriority)}
                            className="w-full text-sm bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="low">Düşük</option>
                            <option value="medium">Orta</option>
                            <option value="high">Yüksek</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Yönetici Notu</label>
                        <textarea
                          value={editNote}
                          onChange={e => setEditNote(e.target.value)}
                          rows={3}
                          placeholder="Kullanıcıya gösterilecek bir not ekleyin..."
                          className="w-full text-sm bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                        />
                      </div>

                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setExpandedId(null)}
                          className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors"
                        >
                          Kapat
                        </button>
                        <button
                          onClick={() => saveTicket(ticket.id)}
                          disabled={updateMutation.isPending}
                          className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition-colors"
                        >
                          {updateMutation.isPending ? 'Kaydediliyor...' : 'Kaydet'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {meta && meta.last_page > 1 && (
        <div className="flex items-center justify-between text-sm text-zinc-500">
          <span>{meta.total} talep</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
            >
              ←
            </button>
            <span>{page} / {meta.last_page}</span>
            <button
              onClick={() => setPage(p => Math.min(meta.last_page, p + 1))}
              disabled={page === meta.last_page}
              className="px-3 py-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
            >
              →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
