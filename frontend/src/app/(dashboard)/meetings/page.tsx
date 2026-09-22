'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { get, post, del } from '@/lib/api'
import { toast } from 'sonner'
import {
  ChevronLeft, ChevronRight, Plus, X, Clock, Users,
  Trash2, CalendarDays, AlarmClock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion } from 'motion/react'
import { useAuthStore } from '@/store/auth.store'

interface Participant { id: string; name: string; avatar_url: string }
interface MeetingItem {
  id: string; title: string; description: string | null
  starts_at: string; ends_at: string | null
  created_by: string; creator: Participant | null; participants: Participant[]
}
interface CompanyUser { id: string; name: string; email: string; avatar_url: string }

const DAYS   = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt']
const MONTHS = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık']

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
function toDateKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}
function fmt(iso: string, opts: Intl.DateTimeFormatOptions) {
  return new Date(iso).toLocaleString('tr-TR', opts)
}

// Pastel color ring for participants
const COLORS = [
  'bg-blue-500','bg-violet-500','bg-rose-500','bg-amber-500',
  'bg-emerald-500','bg-sky-500','bg-pink-500','bg-indigo-500',
]
function colorFor(idx: number) { return COLORS[idx % COLORS.length] }

export default function MeetingsPage() {
  const qc     = useQueryClient()
  const userId = useAuthStore(s => s.user?.id)

  const today      = useMemo(() => new Date(), [])
  const [viewDate, setViewDate]   = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [selected, setSelected]   = useState<Date>(today)
  const [showForm, setShowForm]   = useState(false)
  const [detailId, setDetailId]   = useState<string | null>(null)

  // Form state
  const [fTitle,   setFTitle]   = useState('')
  const [fDesc,    setFDesc]    = useState('')
  const [fStart,   setFStart]   = useState('')
  const [fEnd,     setFEnd]     = useState('')
  const [fPeople,  setFPeople]  = useState<string[]>([])
  const [fSearch,  setFSearch]  = useState('')

  const { data: meetingsData, isLoading } = useQuery<{ success: boolean; data: MeetingItem[] }>({
    queryKey: ['meetings'],
    queryFn:  () => get('/meetings'),
  })
  const { data: usersData } = useQuery<{ success: boolean; data: CompanyUser[] }>({
    queryKey: ['company-users-meeting', fSearch],
    queryFn:  () => get('/company/users', { params: { search: fSearch, per_page: 50 } }),
    enabled:  showForm,
  })

  const createMutation = useMutation({
    mutationFn: () => post('/meetings', {
      title: fTitle, description: fDesc || null,
      starts_at: fStart, ends_at: fEnd || null,
      participant_ids: fPeople,
    }),
    onSuccess: () => {
      toast.success('Toplantı oluşturuldu, katılımcılara bildirim gönderildi.')
      qc.invalidateQueries({ queryKey: ['meetings'] })
      resetForm()
    },
    onError: (err: any) => toast.error(err?.message ?? 'Hata oluştu.'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => del(`/meetings/${id}`),
    onSuccess: () => { toast.success('Toplantı silindi.'); qc.invalidateQueries({ queryKey: ['meetings'] }) },
    onError:   (err: any) => toast.error(err?.message ?? 'Hata oluştu.'),
  })

  function resetForm() {
    setShowForm(false)
    setFTitle(''); setFDesc(''); setFStart(''); setFEnd('')
    setFPeople([]); setFSearch('')
  }

  const allMeetings = meetingsData?.data ?? []

  // Build a map: dateKey → meetings[]
  const meetingsByDay = useMemo(() => {
    const map: Record<string, MeetingItem[]> = {}
    allMeetings.forEach(m => {
      const key = toDateKey(new Date(m.starts_at))
      if (!map[key]) map[key] = []
      map[key].push(m)
    })
    return map
  }, [allMeetings])

  // Selected day meetings sorted by time
  const dayMeetings = useMemo(() => {
    const key = toDateKey(selected)
    return (meetingsByDay[key] ?? []).sort(
      (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
    )
  }, [meetingsByDay, selected])

  // Calendar grid
  const calDays = useMemo(() => {
    const year  = viewDate.getFullYear()
    const month = viewDate.getMonth()
    const first = new Date(year, month, 1).getDay() // 0=Sun
    const total = new Date(year, month + 1, 0).getDate()
    const cells: (Date | null)[] = Array(first).fill(null)
    for (let d = 1; d <= total; d++) cells.push(new Date(year, month, d))
    return cells
  }, [viewDate])

  const companyUsers = (usersData?.data ?? []).filter(u => u.id !== userId)
  const detail       = detailId ? allMeetings.find(m => m.id === detailId) : null

  function prevMonth() { setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1)) }
  function nextMonth() { setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1)) }

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-zinc-50 dark:bg-zinc-950">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div className="flex items-center gap-3">
          <CalendarDays className="h-5 w-5 text-blue-500" />
          <h1 className="text-lg font-bold text-zinc-900 dark:text-white">Toplantılar</h1>
          {!isLoading && (
            <span className="text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-500 px-2 py-0.5 rounded-full">
              {allMeetings.length} toplantı
            </span>
          )}
        </div>
        <button
          onClick={() => { setShowForm(true); setDetailId(null) }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="h-4 w-4" />
          Yeni Toplantı
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── LEFT: Calendar + upcoming list ── */}
        <div className="w-72 flex-shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col overflow-y-auto">
          {/* Month navigator */}
          <div className="px-4 pt-4 pb-2">
            <div className="flex items-center justify-between mb-3">
              <button onClick={prevMonth} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors">
                <ChevronLeft className="h-4 w-4 text-zinc-500" />
              </button>
              <span className="text-sm font-semibold text-zinc-900 dark:text-white">
                {MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}
              </span>
              <button onClick={nextMonth} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors">
                <ChevronRight className="h-4 w-4 text-zinc-500" />
              </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 mb-1">
              {DAYS.map(d => (
                <div key={d} className="text-center text-[10px] font-semibold text-zinc-400 py-1">{d}</div>
              ))}
            </div>

            {/* Calendar cells */}
            <motion.div
              key={`${viewDate.getFullYear()}-${viewDate.getMonth()}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 26 }}
              className="grid grid-cols-7 gap-y-1"
            >
              {calDays.map((day, i) => {
                if (!day) return <div key={`e-${i}`} />
                const isToday    = isSameDay(day, today)
                const isSel      = isSameDay(day, selected)
                const hasMeeting = !!meetingsByDay[toDateKey(day)]?.length
                return (
                  /* Animasyon: watermelon takvim — seçili gün halkası layoutId ile kayar */
                  <motion.button
                    key={day.toISOString()}
                    layout
                    whileTap={{ scale: 0.92 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 28, mass: 0.6 }}
                    onClick={() => setSelected(day)}
                    className={cn(
                      'relative flex flex-col items-center justify-center h-8 w-8 mx-auto rounded-full text-sm',
                      isSel   ? 'text-white font-bold' :
                      isToday ? 'text-blue-600 dark:text-blue-400 font-bold' :
                                'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    )}
                  >
                    {isSel && (
                      <motion.span
                        layoutId="selected-day"
                        transition={{ type: 'spring', stiffness: 420, damping: 28, mass: 0.6 }}
                        className="absolute inset-0 rounded-full bg-blue-600"
                      />
                    )}
                    <span className="relative z-10">{day.getDate()}</span>
                    {hasMeeting && (
                      <span className={cn(
                        'absolute bottom-0.5 z-10 w-1 h-1 rounded-full',
                        isSel ? 'bg-white' : 'bg-blue-500'
                      )} />
                    )}
                  </motion.button>
                )
              })}
            </motion.div>
          </div>

          {/* Divider */}
          <div className="mx-4 my-3 border-t border-zinc-100 dark:border-zinc-800" />

          {/* Upcoming meetings mini-list */}
          <div className="px-4 pb-4 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-2">Yaklaşan</p>
            {allMeetings
              .filter(m => new Date(m.starts_at) > new Date())
              .sort((a,b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
              .slice(0, 8)
              .map(m => (
                <button
                  key={m.id}
                  onClick={() => {
                    setSelected(new Date(m.starts_at))
                    setViewDate(new Date(new Date(m.starts_at).getFullYear(), new Date(m.starts_at).getMonth(), 1))
                    setDetailId(m.id)
                    setShowForm(false)
                  }}
                  className="w-full text-left mb-2 group"
                >
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5 w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate group-hover:text-blue-600 transition-colors">{m.title}</p>
                      <p className="text-[10px] text-zinc-400">
                        {fmt(m.starts_at, { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            }
            {allMeetings.filter(m => new Date(m.starts_at) > new Date()).length === 0 && (
              <p className="text-xs text-zinc-400">Yaklaşan toplantı yok.</p>
            )}
          </div>
        </div>

        {/* ── RIGHT: Day view or form or detail ── */}
        <div className="flex-1 overflow-y-auto">
          {showForm ? (
            <NewMeetingForm
              users={companyUsers}
              search={fSearch} onSearch={setFSearch}
              title={fTitle} onTitle={setFTitle}
              desc={fDesc}   onDesc={setFDesc}
              start={fStart} onStart={setFStart}
              end={fEnd}     onEnd={setFEnd}
              people={fPeople} onToggle={uid => setFPeople(p => p.includes(uid) ? p.filter(x=>x!==uid) : [...p,uid])}
              loading={createMutation.isPending}
              onSubmit={() => createMutation.mutate()}
              onCancel={resetForm}
              currentUserId={userId}
            />
          ) : detail ? (
            <MeetingDetail
              meeting={detail}
              currentUserId={userId}
              onClose={() => setDetailId(null)}
              onDelete={id => { deleteMutation.mutate(id); setDetailId(null) }}
            />
          ) : (
            <DayView
              date={selected}
              meetings={dayMeetings}
              today={today}
              onMeetingClick={id => setDetailId(id)}
              onNewMeeting={() => {
                setShowForm(true)
                const pad = (n: number) => n.toString().padStart(2,'0')
                const d = selected
                setFStart(`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T09:00`)
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── Day View ─── */
function DayView({ date, meetings, today, onMeetingClick, onNewMeeting }: {
  date: Date; meetings: MeetingItem[]; today: Date
  onMeetingClick: (id: string) => void; onNewMeeting: () => void
}) {
  const isToday = isSameDay(date, today)
  const hours   = Array.from({ length: 24 }, (_, i) => i)

  // Place meetings into hour slots
  const slotMap: Record<number, MeetingItem[]> = {}
  meetings.forEach(m => {
    const h = new Date(m.starts_at).getHours()
    if (!slotMap[h]) slotMap[h] = []
    slotMap[h].push(m)
  })

  return (
    <div className="flex flex-col h-full">
      {/* Day header */}
      <div className="sticky top-0 z-10 px-6 py-4 bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn(
            'w-12 h-12 rounded-2xl flex flex-col items-center justify-center',
            isToday ? 'bg-blue-600' : 'bg-zinc-200 dark:bg-zinc-800'
          )}>
            <span className={cn('text-xl font-bold leading-none', isToday ? 'text-white' : 'text-zinc-700 dark:text-zinc-200')}>
              {date.getDate()}
            </span>
            <span className={cn('text-[10px] uppercase tracking-wide', isToday ? 'text-blue-100' : 'text-zinc-400')}>
              {['Paz','Pzt','Sal','Çar','Per','Cum','Cmt'][date.getDay()]}
            </span>
          </div>
          <div>
            <p className="text-base font-semibold text-zinc-900 dark:text-white">
              {date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
            <p className="text-xs text-zinc-400">
              {meetings.length === 0 ? 'Toplantı yok' : `${meetings.length} toplantı`}
            </p>
          </div>
        </div>
        <button
          onClick={onNewMeeting}
          className="flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 px-3 py-1.5 rounded-lg transition-colors"
        >
          <Plus className="h-4 w-4" />
          Bu Güne Ekle
        </button>
      </div>

      {/* Hour timeline */}
      <div className="flex-1 overflow-y-auto">
        {meetings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-zinc-400">
            <CalendarDays className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm">Bu gün için toplantı planlanmamış.</p>
          </div>
        ) : null}

        <div className="relative">
          {hours.map(h => {
            const slotMeetings = slotMap[h] ?? []
            if (slotMeetings.length === 0 && meetings.length > 0) {
              return (
                <div key={h} className="flex border-b border-zinc-100 dark:border-zinc-800/50 min-h-[48px]">
                  <div className="w-16 flex-shrink-0 px-3 py-2 text-right">
                    <span className="text-[11px] text-zinc-300 dark:text-zinc-700 font-mono">
                      {h.toString().padStart(2,'0')}:00
                    </span>
                  </div>
                  <div className="flex-1 border-l border-zinc-100 dark:border-zinc-800/50" />
                </div>
              )
            }
            if (slotMeetings.length === 0) return null
            return (
              <div key={h} className="flex border-b border-zinc-100 dark:border-zinc-800/50 min-h-[72px]">
                <div className="w-16 flex-shrink-0 px-3 py-3 text-right">
                  <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono">
                    {h.toString().padStart(2,'0')}:00
                  </span>
                </div>
                <div className="flex-1 border-l border-zinc-100 dark:border-zinc-800/50 p-2 space-y-2">
                  {slotMeetings.map((m, idx) => (
                    <MeetingBlock key={m.id} meeting={m} colorIdx={idx} onClick={() => onMeetingClick(m.id)} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ─── Meeting Block (in timeline) ─── */
function MeetingBlock({ meeting, colorIdx, onClick }: { meeting: MeetingItem; colorIdx: number; onClick: () => void }) {
  const startTime = fmt(meeting.starts_at, { hour: '2-digit', minute: '2-digit' })
  const endTime   = meeting.ends_at ? fmt(meeting.ends_at, { hour: '2-digit', minute: '2-digit' }) : null
  const colors    = [
    'bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-700',
    'bg-violet-50 dark:bg-violet-950/40 border-violet-300 dark:border-violet-700',
    'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700',
    'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700',
  ]
  const textColors = ['text-blue-700 dark:text-blue-300', 'text-violet-700 dark:text-violet-300',
    'text-emerald-700 dark:text-emerald-300', 'text-amber-700 dark:text-amber-300']

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-3 py-2.5 rounded-xl border-l-4 transition-all hover:scale-[1.01] hover:shadow-md',
        colors[colorIdx % colors.length]
      )}
    >
      <p className={cn('text-sm font-semibold truncate', textColors[colorIdx % textColors.length])}>
        {meeting.title}
      </p>
      <div className="flex items-center gap-3 mt-1">
        <span className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {startTime}{endTime && ` – ${endTime}`}
        </span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
          <Users className="h-3 w-3" />
          {meeting.participants.length} kişi
        </span>
      </div>
      {/* Participant avatars */}
      <div className="flex -space-x-1.5 mt-2">
        {meeting.participants.slice(0, 6).map((p, i) => (
          <img key={p.id} src={p.avatar_url} alt={p.name} title={p.name}
            className="w-5 h-5 rounded-full border border-white dark:border-zinc-900 object-cover"
            style={{ zIndex: 6 - i }}
          />
        ))}
        {meeting.participants.length > 6 && (
          <div className="w-5 h-5 rounded-full bg-zinc-200 dark:bg-zinc-700 border border-white dark:border-zinc-900 flex items-center justify-center text-[8px] font-bold text-zinc-500">
            +{meeting.participants.length - 6}
          </div>
        )}
      </div>
    </button>
  )
}

/* ─── Meeting Detail ─── */
function MeetingDetail({ meeting, currentUserId, onClose, onDelete }: {
  meeting: MeetingItem; currentUserId?: string; onClose: () => void; onDelete: (id: string) => void
}) {
  const isCreator = meeting.created_by === currentUserId

  return (
    <div className="max-w-lg mx-auto p-6">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm">
        {/* Header */}
        <div className="px-6 py-5 border-b border-zinc-100 dark:border-zinc-800 flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <AlarmClock className="h-4 w-4 text-blue-500 flex-shrink-0" />
              <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                {fmt(meeting.starts_at, { day: '2-digit', month: 'long', year: 'numeric' })}
              </span>
            </div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white">{meeting.title}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors flex-shrink-0">
            <X className="h-4 w-4 text-zinc-400" />
          </button>
        </div>

        {/* Time block */}
        <div className="px-6 py-4 flex items-center gap-6 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-zinc-400" />
            <div>
              <p className="text-xs text-zinc-400">Başlangıç</p>
              <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                {fmt(meeting.starts_at, { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
          {meeting.ends_at && (
            <>
              <div className="flex-1 h-px bg-zinc-100 dark:bg-zinc-800" />
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-zinc-400" />
                <div>
                  <p className="text-xs text-zinc-400">Bitiş</p>
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                    {fmt(meeting.ends_at, { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Description */}
        {meeting.description && (
          <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800">
            <p className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap">{meeting.description}</p>
          </div>
        )}

        {/* Participants */}
        <div className="px-6 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">
            Katılımcılar · {meeting.participants.length} kişi
          </p>
          <div className="space-y-2">
            {meeting.participants.map((p, i) => (
              <div key={p.id} className="flex items-center gap-3">
                <div className="relative">
                  <img src={p.avatar_url} alt={p.name} className="w-8 h-8 rounded-full object-cover" />
                  <span className={cn('absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-zinc-900', colorFor(i))} />
                </div>
                <span className="text-sm text-zinc-700 dark:text-zinc-300">{p.name}</span>
                {p.id === meeting.created_by && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full">Organizatör</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        {isCreator && (
          <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-end">
            <button
              onClick={() => onDelete(meeting.id)}
              className="flex items-center gap-2 text-sm text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              Toplantıyı Sil
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── New Meeting Form ─── */
function NewMeetingForm({ users, search, onSearch, title, onTitle, desc, onDesc,
  start, onStart, end, onEnd, people, onToggle, loading, onSubmit, onCancel, currentUserId }: {
  users: CompanyUser[]; search: string; onSearch: (v: string) => void
  title: string; onTitle: (v: string) => void
  desc: string;  onDesc:  (v: string) => void
  start: string; onStart: (v: string) => void
  end: string;   onEnd:   (v: string) => void
  people: string[]; onToggle: (id: string) => void
  loading: boolean; onSubmit: () => void; onCancel: () => void
  currentUserId?: string
}) {
  return (
    <div className="max-w-lg mx-auto p-6">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm">
        {/* Header */}
        <div className="px-6 py-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <h2 className="text-base font-bold text-zinc-900 dark:text-white">Yeni Toplantı</h2>
          <button onClick={onCancel} className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors">
            <X className="h-4 w-4 text-zinc-400" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Başlık *</label>
            <input
              type="text" value={title} onChange={e => onTitle(e.target.value)}
              placeholder="Toplantı başlığı..."
              className="w-full text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Başlangıç *</label>
              <input type="datetime-local" value={start} onChange={e => onStart(e.target.value)}
                className="w-full text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Bitiş</label>
              <input type="datetime-local" value={end} onChange={e => onEnd(e.target.value)}
                className="w-full text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Açıklama</label>
            <textarea value={desc} onChange={e => onDesc(e.target.value)} rows={2}
              placeholder="İsteğe bağlı..."
              className="w-full text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>

          {/* Participants */}
          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">
              Katılımcılar * <span className="text-zinc-400 font-normal">({people.length} seçildi)</span>
            </label>
            <input
              type="text" value={search} onChange={e => onSearch(e.target.value)}
              placeholder="İsimle ara..."
              className="w-full text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
            />
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 divide-y divide-zinc-100 dark:divide-zinc-800 max-h-52 overflow-y-auto">
              {users.length === 0 ? (
                <p className="text-xs text-zinc-400 text-center py-5">Kullanıcı bulunamadı.</p>
              ) : users.map((u, i) => {
                const isSel = people.includes(u.id)
                return (
                  <button key={u.id} type="button" onClick={() => onToggle(u.id)}
                    className={cn('w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
                      isSel ? 'bg-blue-50 dark:bg-blue-950/40' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                    )}>
                    <div className="relative">
                      <img src={u.avatar_url} alt={u.name} className="w-8 h-8 rounded-full object-cover" />
                      {isSel && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-blue-600 rounded-full border-2 border-white dark:border-zinc-900 flex items-center justify-center">
                          <span className="text-white text-[8px] font-bold">✓</span>
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{u.name}</p>
                      <p className="text-xs text-zinc-400 truncate">{u.email}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-2">
          <button onClick={onCancel}
            className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors">
            İptal
          </button>
          <button
            onClick={onSubmit}
            disabled={loading || !title.trim() || !start || people.length === 0}
            className="px-5 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl transition-colors"
          >
            {loading ? 'Oluşturuluyor...' : `Oluştur & ${people.length} Kişiyi Davet Et`}
          </button>
        </div>
      </div>
    </div>
  )
}
