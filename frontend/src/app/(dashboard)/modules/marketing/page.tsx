'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Megaphone, Plus, Trash2, Search, X,
  TrendingUp, AlertCircle, CheckCircle2, Clock, Ban, UserCircle,
  Target, MousePointerClick, Eye, Share2, Mail, Globe, Users, Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/common/PageHeader'
import { StatsCard } from '@/components/common/StatsCard'
import { DataTable } from '@/components/common/DataTable'
import { ConfirmModal } from '@/components/common/ConfirmModal'
import { StatusBadge } from '@/components/common/StatusBadge'
import { createRecordService } from '@/services/record.service'
import { get } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { PRIORITY_OPTIONS, ROLE_LEVELS } from '@/lib/constants'
import { useAuthStore } from '@/store/auth.store'
import { createColumnHelper } from '@tanstack/react-table'

// ─── Constants ────────────────────────────────────────────────────────────────

const marketingService = createRecordService('marketing')

const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-500'
const labelCls = 'block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1'

const MARKETING_TYPE_OPTIONS = [
  { value: 'campaign', label: 'Kampanya',    icon: Zap },
  { value: 'lead',     label: 'Lead',        icon: Users },
  { value: 'content',  label: 'İçerik',      icon: Globe },
  { value: 'event',    label: 'Etkinlik',    icon: Share2 },
  { value: 'email',    label: 'E-posta',     icon: Mail },
  { value: 'other',    label: 'Diğer',       icon: Megaphone },
]

const CHANNEL_OPTIONS = [
  { value: 'instagram',  label: 'Instagram' },
  { value: 'facebook',   label: 'Facebook' },
  { value: 'tiktok',     label: 'TikTok' },
  { value: 'twitter',    label: 'X (Twitter)' },
  { value: 'youtube',    label: 'YouTube' },
  { value: 'google_ads', label: 'Google Ads' },
  { value: 'email',      label: 'E-posta' },
  { value: 'sms',        label: 'SMS' },
  { value: 'influencer', label: 'Influencer' },
  { value: 'offline',    label: 'Offline' },
  { value: 'seo',        label: 'SEO' },
  { value: 'other',      label: 'Diğer' },
]

const GOAL_TYPE_OPTIONS = [
  { value: 'leads',      label: 'Lead (Potansiyel Müşteri)' },
  { value: 'visitors',   label: 'Ziyaretçi' },
  { value: 'sales',      label: 'Satış' },
  { value: 'engagement', label: 'Etkileşim' },
  { value: 'awareness',  label: 'Marka Bilinirliği' },
  { value: 'downloads',  label: 'İndirme' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function marketingTypeBadge(type: string) {
  const map: Record<string, { label: string; cls: string }> = {
    campaign: { label: 'Kampanya',  cls: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' },
    lead:     { label: 'Lead',      cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
    content:  { label: 'İçerik',    cls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
    event:    { label: 'Etkinlik',  cls: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
    email:    { label: 'E-posta',   cls: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400' },
  }
  const entry = map[type] ?? { label: 'Diğer', cls: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400' }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${entry.cls}`}>
      {entry.label}
    </span>
  )
}

function channelBadge(channel: string) {
  const map: Record<string, string> = {
    instagram: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
    facebook:  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    tiktok:    'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
    twitter:   'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
    youtube:   'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    google_ads:'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    email:     'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
    sms:       'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    influencer:'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    offline:   'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    seo:       'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  }
  const label = CHANNEL_OPTIONS.find(c => c.value === channel)?.label ?? channel
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${map[channel] ?? 'bg-zinc-100 text-zinc-600'}`}>
      {label}
    </span>
  )
}

// ─── Create Modal ─────────────────────────────────────────────────────────────

interface CreateModalProps {
  onClose: () => void
  departments: { id: string; name: string }[]
  onSuccess: () => void
}

function MarketingCreateModal({ onClose, departments, onSuccess }: CreateModalProps) {
  const [title, setTitle]               = useState('')
  const [type, setType]                 = useState('campaign')
  const [status, setStatus]             = useState('draft')
  const [priority, setPriority]         = useState('medium')
  const [channel, setChannel]           = useState('')
  const [budget, setBudget]             = useState('')
  const [spentAmount, setSpentAmount]   = useState('')
  const [startDate, setStartDate]       = useState('')
  const [endDate, setEndDate]           = useState('')
  const [targetAudience, setTargetAudience] = useState('')
  const [goalType, setGoalType]         = useState('')
  const [goalValue, setGoalValue]       = useState('')
  const [adUrl, setAdUrl]               = useState('')
  const [impressions, setImpressions]   = useState('')
  const [clicks, setClicks]             = useState('')
  const [conversions, setConversions]   = useState('')
  const [assignedTo, setAssignedTo]     = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [description, setDescription]   = useState('')

  const { data: usersData } = useQuery({
    queryKey: ['company-users-list'],
    queryFn: () => get<any>('/company/users?per_page=100').then(r => r.data ?? []),
  })
  const users: { id: string; name: string }[] = usersData ?? []

  const budgetNum  = parseFloat(budget) || 0
  const spentNum   = parseFloat(spentAmount) || 0
  const remaining  = Math.max(0, budgetNum - spentNum)
  const ctr        = impressions && clicks ? ((parseInt(clicks) / parseInt(impressions)) * 100).toFixed(1) : null
  const convRate   = clicks && conversions ? ((parseInt(conversions) / parseInt(clicks)) * 100).toFixed(1) : null

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, any>) => marketingService.create(payload),
    onSuccess: () => {
      toast.success('Kampanya oluşturuldu.')
      onSuccess()
      onClose()
    },
    onError: (e: any) => toast.error(e?.message ?? 'Kayıt oluşturulamadı.'),
  })

  const handleSubmit = () => {
    if (!title.trim()) { toast.error('Başlık zorunludur.'); return }
    const payload: Record<string, any> = { title, status, priority, type }
    if (channel) payload.channel = channel
    if (budget) payload.budget = budgetNum
    if (spentAmount) payload.spent_amount = spentNum
    if (startDate) payload.start_date = startDate
    if (endDate) payload.end_date = endDate
    if (targetAudience) payload.target_audience = targetAudience
    if (goalType) payload.goal_type = goalType
    if (goalValue) payload.goal_value = parseInt(goalValue)
    if (adUrl) payload.ad_url = adUrl
    if (impressions) payload.impressions = parseInt(impressions)
    if (clicks) payload.clicks = parseInt(clicks)
    if (conversions) payload.conversions = parseInt(conversions)
    if (assignedTo) payload.assigned_to = assignedTo
    if (departmentId) payload.department_id = departmentId
    if (description) payload.description = description
    createMutation.mutate(payload)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-purple-600" />
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Yeni Kampanya / Marketing Kaydı</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-5">

          {/* Kampanya tipi */}
          <div>
            <label className={labelCls}>Kampanya Tipi</label>
            <div className="grid grid-cols-3 gap-2">
              {MARKETING_TYPE_OPTIONS.map(o => {
                const Icon = o.icon
                return (
                  <button key={o.value} type="button" onClick={() => setType(o.value)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-colors ${
                      type === o.value
                        ? 'bg-purple-600 border-purple-600 text-white'
                        : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-purple-400'
                    }`}>
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    {o.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className={labelCls}>Kampanya Adı <span className="text-red-500">*</span></label>
            <input className={inputCls} placeholder="Kampanya adı" value={title} onChange={e => setTitle(e.target.value)} />
          </div>

          {/* Durum + Öncelik */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Durum</label>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { v: 'draft',       l: 'Taslak' },
                  { v: 'in_progress', l: 'Aktif' },
                  { v: 'pending',     l: 'Bekliyor' },
                  { v: 'completed',   l: 'Tamamlandı' },
                ].map(s => (
                  <button key={s.v} type="button" onClick={() => setStatus(s.v)}
                    className={`py-1.5 text-xs rounded-lg border font-medium transition-colors ${
                      status === s.v ? 'bg-purple-600 border-purple-600 text-white' : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-purple-400'
                    }`}>
                    {s.l}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls}>Öncelik</label>
              <select className={inputCls} value={priority} onChange={e => setPriority(e.target.value)}>
                {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {/* Kanal */}
          <div>
            <label className={labelCls}>Kanal</label>
            <div className="flex flex-wrap gap-1.5">
              {CHANNEL_OPTIONS.map(c => (
                <button key={c.value} type="button" onClick={() => setChannel(c.value)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    channel === c.value
                      ? 'bg-purple-600 border-purple-600 text-white'
                      : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-purple-400'
                  }`}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tarihler */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Başlangıç Tarihi</label>
              <input type="date" className={inputCls} value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Bitiş Tarihi</label>
              <input type="date" className={inputCls} value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>

          {/* Bütçe */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-3 space-y-3 bg-zinc-50 dark:bg-zinc-800/50">
            <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Bütçe Takibi</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Toplam Bütçe (₺)</label>
                <input type="number" min="0" step="0.01" className={inputCls} placeholder="0.00" value={budget} onChange={e => setBudget(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Harcanan (₺)</label>
                <input type="number" min="0" step="0.01" className={inputCls} placeholder="0.00" value={spentAmount} onChange={e => setSpentAmount(e.target.value)} />
              </div>
            </div>
            {budgetNum > 0 && (
              <div className="flex items-center gap-3 text-xs">
                <div className="flex-1 bg-zinc-200 dark:bg-zinc-700 rounded-full h-1.5">
                  <div className="bg-purple-600 h-1.5 rounded-full transition-all" style={{ width: `${Math.min(100, (spentNum / budgetNum) * 100)}%` }} />
                </div>
                <span className="text-zinc-500 whitespace-nowrap">
                  Kalan: <strong className="text-zinc-900 dark:text-zinc-100">₺{remaining.toLocaleString('tr-TR')}</strong>
                </span>
              </div>
            )}
          </div>

          {/* Hedef */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Hedef Tipi</label>
              <select className={inputCls} value={goalType} onChange={e => setGoalType(e.target.value)}>
                <option value="">Seçiniz</option>
                {GOAL_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Hedef Değer</label>
              <input type="number" min="0" className={inputCls} placeholder="Örn: 1000 lead" value={goalValue} onChange={e => setGoalValue(e.target.value)} />
            </div>
          </div>

          {/* Performans metrikleri */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-3 space-y-3 bg-zinc-50 dark:bg-zinc-800/50">
            <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Performans Metrikleri</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Gösterim</label>
                <input type="number" min="0" className={inputCls} placeholder="0" value={impressions} onChange={e => setImpressions(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Tıklama</label>
                <input type="number" min="0" className={inputCls} placeholder="0" value={clicks} onChange={e => setClicks(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Dönüşüm</label>
                <input type="number" min="0" className={inputCls} placeholder="0" value={conversions} onChange={e => setConversions(e.target.value)} />
              </div>
            </div>
            {(ctr || convRate) && (
              <div className="flex gap-4 text-xs text-zinc-500">
                {ctr && <span>CTR: <strong className="text-zinc-900 dark:text-zinc-100">%{ctr}</strong></span>}
                {convRate && <span>Dönüşüm Oranı: <strong className="text-zinc-900 dark:text-zinc-100">%{convRate}</strong></span>}
              </div>
            )}
          </div>

          {/* Reklam URL + Hedef kitle */}
          <div>
            <label className={labelCls}>Reklam URL</label>
            <input className={inputCls} placeholder="https://..." value={adUrl} onChange={e => setAdUrl(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Hedef Kitle</label>
            <input className={inputCls} placeholder="18-35 yaş, kadın, İstanbul..." value={targetAudience} onChange={e => setTargetAudience(e.target.value)} />
          </div>

          {/* Sorumlu kişi */}
          {users.length > 0 && (
            <div>
              <label className={labelCls}>Sorumlu Kişi</label>
              <select className={inputCls} value={assignedTo} onChange={e => setAssignedTo(e.target.value)}>
                <option value="">Seçiniz</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          )}

          {departments.length > 0 && (
            <div>
              <label className={labelCls}>Departman</label>
              <select className={inputCls} value={departmentId} onChange={e => setDepartmentId(e.target.value)}>
                <option value="">Seçiniz</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className={labelCls}>Açıklama</label>
            <textarea className={`${inputCls} resize-none`} rows={3} placeholder="İsteğe bağlı açıklama..." value={description} onChange={e => setDescription(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-5 pb-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
            İptal
          </button>
          <button onClick={handleSubmit} disabled={createMutation.isPending}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-purple-600 hover:bg-purple-700 text-white transition-colors disabled:opacity-60">
            {createMutation.isPending ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MarketingPage() {
  const qc = useQueryClient()
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [typeChip, setTypeChip] = useState('all')
  const [channelFilter, setChannelFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const typeChips = [
    { id: 'all',      label: 'Tümü' },
    { id: 'campaign', label: 'Kampanya' },
    { id: 'lead',     label: 'Lead' },
    { id: 'content',  label: 'İçerik' },
    { id: 'event',    label: 'Etkinlik' },
    { id: 'email',    label: 'E-posta' },
  ]

  const statusChips = [
    { id: 'all',         label: 'Tüm Durumlar' },
    { id: 'draft',       label: 'Taslak' },
    { id: 'in_progress', label: 'Aktif' },
    { id: 'pending',     label: 'Bekliyor' },
    { id: 'completed',   label: 'Tamamlandı' },
    { id: 'cancelled',   label: 'İptal' },
  ]

  const { user, roleLevel } = useAuthStore()
  const deptFilter = roleLevel === ROLE_LEVELS.DEPARTMENT_MANAGER && user?.department_id ? user.department_id : null

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['marketing-stats'],
    queryFn: () => get<any>('/dashboard/module/marketing').then(r => r.data),
  })

  const { data: deptData } = useQuery({
    queryKey: ['company-departments-list'],
    queryFn: () => get<any>('/company/departments').then(r => r.data ?? []),
  })
  const departments: { id: string; name: string }[] = deptData ?? []

  const { data, isLoading } = useQuery({
    queryKey: ['marketing-list', page, search, typeChip, channelFilter, statusFilter, deptFilter],
    queryFn: () => {
      const params: Record<string, any> = { page: page + 1, per_page: 15 }
      if (search) params.search = search
      if (typeChip !== 'all') params.type = typeChip
      if (channelFilter !== 'all') params.channel = channelFilter
      if (statusFilter !== 'all') params.status = statusFilter
      if (deptFilter) params.department_id = deptFilter
      return marketingService.list(params)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => marketingService.delete(id),
    onSuccess: () => {
      toast.success('Kayıt silindi.')
      qc.invalidateQueries({ queryKey: ['marketing-list'] })
      qc.invalidateQueries({ queryKey: ['marketing-stats'] })
      setDeleteId(null)
    },
    onError: (e: any) => toast.error(e?.message ?? 'Silinemedi.'),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => marketingService.updateStatus(id, status),
    onSuccess: () => {
      toast.success('Durum güncellendi.')
      qc.invalidateQueries({ queryKey: ['marketing-list'] })
      qc.invalidateQueries({ queryKey: ['marketing-stats'] })
    },
    onError: (e: any) => toast.error(e?.message ?? 'Durum güncellenemedi.'),
  })

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearch(searchInput)
    setPage(0)
  }

  const col = createColumnHelper<any>()
  const columns = [
    col.accessor('record_number', {
      header: 'Kayıt No',
      cell: info => <span className="text-xs font-mono text-zinc-500">{info.getValue()}</span>,
    }),
    col.accessor('title', {
      header: 'Başlık',
      cell: info => (
        <div>
          <p className="font-medium text-zinc-900 dark:text-zinc-100 truncate max-w-[160px]">{info.getValue()}</p>
          <div className="mt-0.5">{marketingTypeBadge(info.row.original.type ?? '')}</div>
        </div>
      ),
    }),
    col.accessor('channel', {
      header: 'Kanal',
      cell: info => info.getValue() ? channelBadge(info.getValue()) : <span className="text-zinc-400 text-xs">—</span>,
    }),
    col.accessor('status', {
      header: 'Durum',
      cell: info => <StatusBadge status={info.getValue()} label={info.row.original.status_label} />,
    }),
    col.display({
      id: 'budget_spent',
      header: 'Bütçe / Harcanan',
      cell: info => {
        const row = info.row.original
        const budget = row.budget != null ? Number(row.budget) : null
        const spent = row.spent_amount != null ? Number(row.spent_amount) : 0
        if (budget == null) return <span className="text-zinc-400 text-xs">—</span>
        const pct = Math.min(100, budget > 0 ? (spent / budget) * 100 : 0)
        return (
          <div className="min-w-[100px]">
            <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              ₺{budget.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="flex-1 bg-zinc-200 dark:bg-zinc-700 rounded-full h-1">
                <div
                  className={`h-1 rounded-full transition-all ${pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-yellow-500' : 'bg-purple-500'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs text-zinc-400 whitespace-nowrap">{pct.toFixed(0)}%</span>
            </div>
          </div>
        )
      },
    }),
    col.display({
      id: 'metrics',
      header: 'Metriks',
      cell: info => {
        const row = info.row.original
        if (row.impressions == null && row.clicks == null) return <span className="text-zinc-400 text-xs">—</span>
        const ctr = row.impressions > 0 && row.clicks != null
          ? ((row.clicks / row.impressions) * 100).toFixed(1)
          : null
        return (
          <div className="text-xs text-zinc-500 space-y-0.5">
            <div className="flex items-center gap-1">
              <Eye className="h-3 w-3" />
              <span>{(row.impressions ?? 0).toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-1">
              <MousePointerClick className="h-3 w-3" />
              <span>{(row.clicks ?? 0).toLocaleString()}</span>
              {ctr && <span className="text-zinc-400">({ctr}%)</span>}
            </div>
          </div>
        )
      },
    }),
    col.display({
      id: 'assigned',
      header: 'Sorumlu',
      cell: info => (
        <div className="flex items-center gap-1.5">
          <UserCircle className="h-4 w-4 text-zinc-400 shrink-0" />
          <span className="text-sm text-zinc-600 dark:text-zinc-400 truncate max-w-[80px]">
            {info.row.original.assigned_to?.name ?? info.row.original.created_by?.name ?? '—'}
          </span>
        </div>
      ),
    }),
    col.display({
      id: 'date_range',
      header: 'Tarih Aralığı',
      cell: info => {
        const row = info.row.original
        if (!row.start_date && !row.end_date) return <span className="text-zinc-400 text-xs">—</span>
        return (
          <div className="text-xs text-zinc-500 whitespace-nowrap">
            {row.start_date && <div>{formatDate(row.start_date)}</div>}
            {row.end_date && <div className="text-zinc-400">~ {formatDate(row.end_date)}</div>}
          </div>
        )
      },
    }),
    col.display({
      id: 'actions',
      header: '',
      cell: info => {
        const row = info.row.original
        return (
          <div className="flex items-center gap-1">
            {row.status !== 'in_progress' && row.status !== 'cancelled' && row.status !== 'completed' && (
              <button
                title="Aktifleştir"
                onClick={() => statusMutation.mutate({ id: row.id, status: 'in_progress' })}
                className="p-1.5 rounded-lg hover:bg-yellow-50 dark:hover:bg-yellow-950/30 text-zinc-400 hover:text-yellow-600 transition-colors"
              >
                <Clock className="h-4 w-4" />
              </button>
            )}
            {row.status !== 'completed' && row.status !== 'cancelled' && (
              <button
                title="Tamamlandı"
                onClick={() => statusMutation.mutate({ id: row.id, status: 'completed' })}
                className="p-1.5 rounded-lg hover:bg-green-50 dark:hover:bg-green-950/30 text-zinc-400 hover:text-green-600 transition-colors"
              >
                <CheckCircle2 className="h-4 w-4" />
              </button>
            )}
            {row.status !== 'cancelled' && (
              <button
                title="İptal Et"
                onClick={() => statusMutation.mutate({ id: row.id, status: 'cancelled' })}
                className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-zinc-400 hover:text-red-600 transition-colors"
              >
                <Ban className="h-4 w-4" />
              </button>
            )}
            <button
              title="Sil"
              onClick={() => setDeleteId(row.id)}
              className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/50 text-zinc-400 hover:text-red-600 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )
      },
    }),
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Marketing"
        description="Kampanya ve müşteri adayları yönetimi"
        breadcrumbs={[{ label: 'Modüller' }, { label: 'Marketing' }]}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title="Toplam" value={statsData?.total ?? 0} icon={Megaphone} color="purple" loading={statsLoading} />
        <StatsCard title="Bu Ay" value={statsData?.this_month ?? 0} icon={TrendingUp} color="green" loading={statsLoading} />
        <StatsCard title="Bekliyor" value={statsData?.pending ?? 0} icon={AlertCircle} color="orange" loading={statsLoading} />
        <StatsCard title="Tamamlandı" value={statsData?.completed ?? 0} icon={Target} color="blue" loading={statsLoading} />
      </div>

      {/* Table card */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
        <div className="p-5 space-y-4">

          {/* Search + New button */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <form onSubmit={handleSearch} className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <input
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder="Marketing kayıtlarında ara..."
                className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-500 placeholder:text-zinc-400"
              />
            </form>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              Yeni Kampanya
            </button>
          </div>

          {/* Tip filtresi */}
          <div className="flex flex-wrap gap-2">
            {typeChips.map(chip => (
              <button
                key={chip.id}
                onClick={() => { setTypeChip(chip.id); setPage(0) }}
                className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                  typeChip === chip.id
                    ? 'bg-purple-600 border-purple-600 text-white'
                    : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-purple-400 hover:text-purple-600'
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* Durum + Kanal filtresi */}
          <div className="flex flex-wrap items-center gap-2">
            {statusChips.map(chip => (
              <button
                key={chip.id}
                onClick={() => { setStatusFilter(chip.id); setPage(0) }}
                className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                  statusFilter === chip.id
                    ? 'bg-zinc-800 border-zinc-800 text-white dark:bg-zinc-200 dark:border-zinc-200 dark:text-zinc-900'
                    : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-400'
                }`}
              >
                {chip.label}
              </button>
            ))}
            <select
              value={channelFilter}
              onChange={e => { setChannelFilter(e.target.value); setPage(0) }}
              className="px-3 py-1.5 text-xs font-medium rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 focus:outline-none focus:border-purple-400 cursor-pointer"
            >
              <option value="all">Tüm Kanallar</option>
              {CHANNEL_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>

          <DataTable
            columns={columns}
            data={data?.data ?? []}
            total={data?.meta?.total ?? 0}
            pageIndex={page}
            onPaginationChange={s => setPage(s.pageIndex)}
            isLoading={isLoading}
            emptyMessage="Henüz marketing kaydı yok."
          />
        </div>
      </div>

      <ConfirmModal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        title="Kaydı sil?"
        description="Bu kayıt ve ilişkili tüm veriler kalıcı olarak silinecek."
        confirmLabel="Evet, Sil"
        loading={deleteMutation.isPending}
      />

      {showCreate && (
        <MarketingCreateModal
          onClose={() => setShowCreate(false)}
          departments={departments}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['marketing-list'] })
            qc.invalidateQueries({ queryKey: ['marketing-stats'] })
          }}
        />
      )}
    </div>
  )
}
