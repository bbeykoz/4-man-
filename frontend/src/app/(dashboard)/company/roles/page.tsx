'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createColumnHelper } from '@tanstack/react-table'
import { Plus, Pencil, Trash2, Shield, User, Eye, Lock, X, Check, Info } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable } from '@/components/common/DataTable'
import { ConfirmModal } from '@/components/common/ConfirmModal'
import { get, del, post, put } from '@/lib/api'
import { formatDate } from '@/lib/utils'

interface Department { id: string; name: string }

interface Role {
  id: string
  name: string
  slug: string
  display_name: string
  description: string | null
  level: number
  level_label: string
  color: string
  is_system: boolean
  department_id: string | null
  department: Department | null
  users_count: number
  permissions: string[]
  created_at: string
}

const col = createColumnHelper<Role>()
const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500'

const LEVEL_OPTIONS = [
  { value: 3, label: 'Müdür',    suffix: 'Müdürü' },
  { value: 4, label: 'Personel', suffix: 'Personeli' },
  { value: 5, label: 'İzleyici', suffix: 'İzleyicisi' },
]

const COLORS = [
  { value: 'blue',   hex: '#3b82f6' }, { value: 'green',  hex: '#22c55e' },
  { value: 'purple', hex: '#a855f7' }, { value: 'red',    hex: '#ef4444' },
  { value: 'orange', hex: '#f97316' }, { value: 'yellow', hex: '#eab308' },
  { value: 'pink',   hex: '#ec4899' }, { value: 'gray',   hex: '#6b7280' },
]

const MODULE_LABELS: Record<string, string> = {
  // Manager groups
  company:              'Şirket Yönetimi',
  accounting_marketing: 'Muhasebe & Marketing Müdürü',
  shipping_customs:     'Nakliye & Gümrükleme Müdürü',
  returns_packaging:    'İade & Paketleme Müdürü',
  warehouse:            'Depo Müdürü',
  warehouse_control:    'Depo Kontrolcüsü',
  // Staff individual groups
  accounting_staff:     'Muhasebe (Personel)',
  marketing_staff:      'Marketing (Personel)',
  shipping_staff:       'Nakliye (Personel)',
  customs_staff:        'Gümrükleme (Personel)',
  returns_staff:        'İade (Personel)',
  packaging_staff:      'Paketleme (Personel)',
}

const RESOURCE_LABELS: Record<string, string> = {
  settings: 'Ayarlar', users: 'Kullanıcılar', departments: 'Departmanlar',
  roles: 'Roller', modules: 'Modüller', reports: 'Raporlar', records: 'Kayıtlar',
  companies: 'Şirketler', staff: 'Personel Erişimi',
  'accounting.records': 'Muhasebe Kayıtları',
  'marketing.records':  'Marketing Kayıtları',
  'shipping.records':   'Nakliye Kayıtları',
  'customs.records':    'Gümrükleme Kayıtları',
  'returns.records':    'İade Kayıtları',
  'packaging.records':  'Paketleme Kayıtları',
}

const ACTION_LABELS: Record<string, string> = {
  view: 'Görüntüle', create: 'Oluştur', edit: 'Düzenle',
  delete: 'Sil', export: 'Dışa Aktar', approve: 'Onayla', manage: 'Yönet',
}

const levelColors: Record<number, string> = {
  2: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  3: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  4: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  5: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400',
}

const levelIconHex: Record<number, string> = {
  2: '#f97316', // orange — şirket sahibi
  3: '#3b82f6', // blue   — müdür
  4: '#22c55e', // green  — personel
  5: '#6b7280', // gray   — izleyici
}

// ── Permission Editor ──────────────────────────────────────────────────────────

interface PermissionEditorProps {
  perms: string[]
  permGroups: Record<string, Record<string, any[]>>
  onToggle: (name: string) => void
  onToggleGroup: (groupPerms: string[]) => void
}

function PermissionEditor({ perms, permGroups, onToggle, onToggleGroup }: PermissionEditorProps) {
  return (
    <div className="space-y-3">
      {Object.entries(permGroups).map(([module, resources]) => {
        const allModulePerms = Object.values(resources).flat().map((p: any) => p.name)
        const selectedCount  = allModulePerms.filter(p => perms.includes(p)).length
        const allSelected    = selectedCount === allModulePerms.length
        return (
          <div key={module} className="border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800/50 cursor-pointer"
              onClick={() => onToggleGroup(allModulePerms)}>
              <div className="flex items-center gap-2">
                <div className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                  allSelected ? 'bg-blue-600 border-blue-600' :
                  selectedCount > 0 ? 'bg-blue-100 border-blue-400' :
                  'border-zinc-300 dark:border-zinc-600'}`}>
                  {allSelected && <Check className="h-3 w-3 text-white" />}
                  {!allSelected && selectedCount > 0 && <div className="w-2 h-0.5 bg-blue-600" />}
                </div>
                <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{MODULE_LABELS[module] ?? module}</span>
              </div>
              <span className="text-xs text-zinc-400">{selectedCount}/{allModulePerms.length}</span>
            </div>
            <div className="p-3 space-y-2">
              {Object.entries(resources).map(([resource, permissions]) => (
                <div key={resource}>
                  <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1.5">{RESOURCE_LABELS[resource] ?? resource}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(permissions as any[]).map((perm: any) => {
                      const selected = perms.includes(perm.name)
                      const action   = perm.action ?? perm.name.split('.').pop()
                      return (
                        <button key={perm.name} type="button" onClick={() => onToggle(perm.name)}
                          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                            selected ? 'bg-blue-600 border-blue-600 text-white' :
                            'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-blue-400 hover:text-blue-600'}`}>
                          {selected && <Check className="h-3 w-3" />}
                          {ACTION_LABELS[action] ?? action}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Role Fields ────────────────────────────────────────────────────────────────

interface RoleFieldsProps {
  displayName: string;  onDisplayName:  (v: string) => void
  description: string;  onDescription:  (v: string) => void
  level: number;        onLevel:        (v: number) => void
  color: string;        onColor:        (v: string) => void
  departmentId: string; onDepartmentId: (v: string) => void
  departments: Department[]
  isSystem?: boolean
}

function RoleFields({ displayName, onDisplayName, description, onDescription,
  level, onLevel, color, onColor, departmentId, onDepartmentId, departments, isSystem }: RoleFieldsProps) {

  function autoFillName(deptId: string, lvl: number) {
    const dept     = departments.find(d => d.id === deptId)
    const levelOpt = LEVEL_OPTIONS.find(o => o.value === lvl)
    if (dept && levelOpt) onDisplayName(`${dept.name} ${levelOpt.suffix}`)
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Departman</label>
        <select
          value={departmentId}
          onChange={e => { onDepartmentId(e.target.value); autoFillName(e.target.value, level) }}
          className={inputCls}
          disabled={isSystem}
        >
          <option value="">— Departmana Bağlı Değil —</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        {!isSystem && departments.length === 0 && (
          <p className="mt-1 text-xs text-amber-500 dark:text-amber-400">
            Henüz departman yok.{' '}
            <a href="/company/departments" className="underline hover:text-amber-700 dark:hover:text-amber-300">
              Departmanlar sayfasından ekleyin.
            </a>
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Seviye</label>
          <select
            value={level}
            onChange={e => { onLevel(Number(e.target.value)); autoFillName(departmentId, Number(e.target.value)) }}
            className={inputCls}
            disabled={isSystem}
          >
            {LEVEL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Renk</label>
          <div className="flex gap-1.5 flex-wrap pt-1">
            {COLORS.map(c => (
              <button key={c.value} type="button" onClick={() => onColor(c.value)}
                className={`w-5 h-5 rounded-full transition-all ${color === c.value ? 'ring-2 ring-offset-2 ring-offset-white dark:ring-offset-zinc-900 ring-zinc-400 scale-110' : ''}`}
                style={{ backgroundColor: c.hex }} />
            ))}
          </div>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">
          Rol Adı <span className="text-red-500">*</span>
          <span className="font-normal text-zinc-400 ml-1">(departman + seviye seçince otomatik dolar)</span>
        </label>
        <input type="text" value={displayName} onChange={e => onDisplayName(e.target.value)}
          placeholder="Örn: Muhasebe Müdürü" className={inputCls} />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Açıklama</label>
        <input type="text" value={description} onChange={e => onDescription(e.target.value)}
          placeholder="Kısa açıklama..." className={inputCls} />
      </div>
      {isSystem && (
        <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
          <Lock className="h-3 w-3" /> Sistem rolü — düzenlenemez
        </p>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RolesPage() {
  const qc = useQueryClient()
  const [deleteId,   setDeleteId]   = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [cName,  setCName]  = useState('')
  const [cDesc,  setCDesc]  = useState('')
  const [cLevel, setCLevel] = useState(4)
  const [cColor, setCColor] = useState('blue')
  const [cDept,  setCDept]  = useState('')
  const [cPerms, setCPerms] = useState<string[]>([])

  const [editRole, setEditRole] = useState<Role | null>(null)
  const [eName,  setEName]  = useState('')
  const [eDesc,  setEDesc]  = useState('')
  const [eLevel, setELevel] = useState(4)
  const [eColor, setEColor] = useState('blue')
  const [eDept,  setEDept]  = useState('')
  const [ePerms, setEPerms] = useState<string[]>([])

  const { data, isLoading } = useQuery({
    queryKey: ['company-roles'],
    queryFn: () => get<any>('/company/roles'),
  })

  const { data: permsData } = useQuery({
    queryKey: ['company-permissions'],
    queryFn: () => get<any>('/company/roles/permissions'),
    enabled: createOpen || !!editRole,
  })

  const { data: deptsData, isLoading: deptsLoading } = useQuery({
    queryKey: ['company-departments-for-roles'],
    queryFn: () => get<any>('/company/departments/list'),
  })

  const departments: Department[] = deptsData?.data ?? []

  // Raw per-module groups (system + companies filtered out)
  const rawModuleGroups: Record<string, Record<string, any[]>> = Object.fromEntries(
    Object.entries(permsData?.data ?? {})
      .filter(([mod]) => mod !== 'system')
      .map(([mod, resources]) => [
        mod,
        Object.fromEntries(
          Object.entries(resources as Record<string, any[]>).filter(([res]) => res !== 'companies')
        ),
      ])
      .filter(([, resources]) => Object.keys(resources).length > 0)
  )

  // Merge modules into groups; resourceFilter limits to a specific resource ('records' | 'staff')
  function mergeGroup(slugs: string[], resourceFilter?: string): Record<string, any[]> {
    const result: Record<string, any[]> = {}
    slugs.forEach(slug => {
      Object.entries(rawModuleGroups[slug] ?? {}).forEach(([res, perms]) => {
        if (resourceFilter && res !== resourceFilter) return
        result[slugs.length > 1 ? `${slug}.${res}` : res] = perms as any[]
      })
    })
    return result
  }

  const permGroups: Record<string, Record<string, any[]>> = (() => {
    const g: Record<string, Record<string, any[]>> = {}
    // Company management (all resources)
    if (rawModuleGroups.company) g.company = rawModuleGroups.company
    // Manager combined groups (records resource only)
    const am = mergeGroup(['accounting', 'marketing'], 'records'); if (Object.keys(am).length) g.accounting_marketing = am
    const sc = mergeGroup(['shipping',   'customs'],   'records'); if (Object.keys(sc).length) g.shipping_customs     = sc
    const rp = mergeGroup(['returns',    'packaging'], 'records'); if (Object.keys(rp).length) g.returns_packaging    = rp
    const wh = mergeGroup(['warehouse'],               'records'); if (Object.keys(wh).length) g.warehouse            = wh
    const wc = mergeGroup(['warehouse_control'],       'records'); if (Object.keys(wc).length) g.warehouse_control    = wc
    // Staff individual groups (staff resource — fully independent from manager groups)
    const accs = mergeGroup(['accounting'], 'staff'); if (Object.keys(accs).length) g.accounting_staff = accs
    const mkts = mergeGroup(['marketing'],  'staff'); if (Object.keys(mkts).length) g.marketing_staff  = mkts
    const shps = mergeGroup(['shipping'],   'staff'); if (Object.keys(shps).length) g.shipping_staff   = shps
    const csts = mergeGroup(['customs'],    'staff'); if (Object.keys(csts).length) g.customs_staff    = csts
    const rets = mergeGroup(['returns'],    'staff'); if (Object.keys(rets).length) g.returns_staff    = rets
    const pkgs = mergeGroup(['packaging'],  'staff'); if (Object.keys(pkgs).length) g.packaging_staff  = pkgs
    return g
  })()

  function togglePerm(perms: string[], setPerms: (p: string[]) => void, name: string) {
    setPerms(perms.includes(name) ? perms.filter(p => p !== name) : [...perms, name])
  }

  function toggleGroup(perms: string[], setPerms: (p: string[]) => void, groupPerms: string[]) {
    const allSelected = groupPerms.every(p => perms.includes(p))
    setPerms(allSelected ? perms.filter(p => !groupPerms.includes(p)) : [...new Set([...perms, ...groupPerms])])
  }

  const createMutation = useMutation({
    mutationFn: () => post('/company/roles', {
      display_name: cName, description: cDesc, level: cLevel, color: cColor,
      department_id: cDept || null, permissions: cPerms,
    }),
    onSuccess: () => {
      toast.success('Rol oluşturuldu.')
      qc.invalidateQueries({ queryKey: ['company-roles'] })
      setCreateOpen(false)
      setCName(''); setCDesc(''); setCLevel(4); setCColor('blue'); setCDept(''); setCPerms([])
    },
    onError: (e: any) => toast.error(e?.message ?? 'Oluşturma başarısız.'),
  })

  const updateMutation = useMutation({
    mutationFn: () => put(`/company/roles/${editRole!.id}`, {
      display_name: eName, description: eDesc, level: eLevel, color: eColor,
      department_id: eDept || null, permissions: ePerms,
    }),
    onSuccess: () => {
      toast.success('Rol güncellendi.')
      qc.invalidateQueries({ queryKey: ['company-roles'] })
      setEditRole(null)
    },
    onError: (e: any) => toast.error(e?.message ?? 'Güncelleme başarısız.'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => del(`/company/roles/${id}`),
    onSuccess: () => {
      toast.success('Rol silindi.')
      qc.invalidateQueries({ queryKey: ['company-roles'] })
      setDeleteId(null)
    },
    onError: (e: any) => toast.error(e?.message),
  })

  function openEdit(role: Role) {
    setEditRole(role)
    setEName(role.display_name)
    setEDesc(role.description ?? '')
    setELevel(role.level)
    setEColor(role.color)
    setEDept(role.department_id ?? '')
    setEPerms(role.permissions ?? [])
  }

  const columns = [
    col.accessor('display_name', {
      header: 'Rol',
      cell: (info) => {
        const r        = info.row.original
        const iconHex  = levelIconHex[r.level] ?? '#6b7280'
        const RoleIcon = r.level >= 5 ? Eye : r.level === 4 ? User : Shield
        return (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: iconHex + '20' }}>
              <RoleIcon className="h-4 w-4" style={{ color: iconHex }} />
            </div>
            <div>
              <p className="font-medium text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                {info.getValue()}
                {r.is_system && (
                  <span title="Sistem rolü">
                    <Lock className="h-3 w-3 text-zinc-400" />
                  </span>
                )}
              </p>
              <p className="text-xs text-zinc-400">{r.name}</p>
              {r.is_system && r.slug !== 'company-owner' && (
                <p className="mt-0.5 text-xs text-amber-500 dark:text-amber-400 font-medium">
                  ⚠ Örnek roldür — kullanıcılara verilemez
                </p>
              )}
            </div>
          </div>
        )
      },
    }),
    col.accessor('level', {
      header: 'Seviye',
      cell: (info) => {
        const r        = info.row.original
        const levelOpt = LEVEL_OPTIONS.find(o => o.value === r.level)
        return (
          <div className="flex items-center gap-1.5 flex-wrap">
            {r.department && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                {r.department.name}
              </span>
            )}
            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${levelColors[r.level] ?? levelColors[5]}`}>
              {levelOpt?.label ?? r.level_label}
            </span>
          </div>
        )
      },
    }),
    col.accessor('users_count' as any, {
      header: 'Kullanıcı',
      cell: (info) => <span className="text-sm text-zinc-600 dark:text-zinc-400">{info.getValue() ?? 0}</span>,
    }),
    col.accessor('permissions' as any, {
      header: 'İzin',
      cell: (info) => {
        const perms = info.getValue() as string[]
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-xs font-medium">
            {perms?.length ?? 0} izin
          </span>
        )
      },
    }),
    col.accessor('created_at', {
      header: 'Oluşturulma',
      cell: (info) => <span className="text-sm text-zinc-500">{formatDate(info.getValue())}</span>,
    }),
    col.display({
      id: 'actions',
      header: '',
      cell: (info) => (
        <div className="flex items-center gap-1">
          <button
            onClick={() => openEdit(info.row.original)}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 hover:bg-blue-100 transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
            Düzenle
          </button>
          <button
            onClick={() => !info.row.original.is_system && setDeleteId(info.row.original.id)}
            disabled={info.row.original.is_system}
            className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/50 text-zinc-400 hover:text-red-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    }),
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Roller & İzinler"
        description="Kullanıcı rollerini ve erişim izinlerini yönetin"
        breadcrumbs={[{ label: 'Şirket' }, { label: 'Roller' }]}
        actions={
          <button onClick={() => setCreateOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
            <Plus className="h-4 w-4" />
            Yeni Rol
          </button>
        }
      />

      <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 text-blue-800 dark:text-blue-300">
        <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
        <p className="text-sm leading-relaxed">
          <span className="font-semibold">Sistem rolleri (Şirket Sahibi, Departman Müdürü, Personel, İzleyici)</span> sabit örnek rollerdir — izinleri düzenlenemez.
          Şirketinize özel roller oluşturmak için{' '}
          <span className="font-semibold">"+ Yeni Rol"</span> butonunu kullanın; departman ve yetkileri kendiniz belirleyin.
        </p>
      </div>

      <DataTable
        columns={columns}
        data={[...(data?.data ?? [])].sort((a, b) => {
          if (a.is_system !== b.is_system) return a.is_system ? -1 : 1
          return a.level - b.level
        })}
        total={data?.data?.length ?? 0}
        pageIndex={0}
        onPaginationChange={() => {}}
        isLoading={isLoading}
        emptyMessage="Henüz rol tanımlanmamış."
      />

      <ConfirmModal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        title="Rolü sil?"
        description="Bu rol silinecek. Bu role sahip kullanıcılar etkilenebilir."
        confirmLabel="Evet, Sil"
        loading={deleteMutation.isPending}
      />

      {/* Create Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setCreateOpen(false)} />
          <div className="relative z-10 w-full max-w-3xl bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 flex flex-col" style={{ height: '90vh' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex-shrink-0">
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Yeni Rol Oluştur</h3>
              <button onClick={() => setCreateOpen(false)} className="text-zinc-400 hover:text-zinc-600"><X className="h-4 w-4" /></button>
            </div>
            {/* Two-column body — each column scrolls independently */}
            <div className="flex-1 min-h-0 grid grid-cols-2 divide-x divide-zinc-100 dark:divide-zinc-800">
              {/* Left: rol bilgileri */}
              <div className="overflow-y-auto p-6">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">Rol Bilgileri</p>
                <RoleFields
                  displayName={cName}  onDisplayName={setCName}
                  description={cDesc}  onDescription={setCDesc}
                  level={cLevel}       onLevel={setCLevel}
                  color={cColor}       onColor={setCColor}
                  departmentId={cDept} onDepartmentId={setCDept}
                  departments={departments}
                />
              </div>
              {/* Right: izinler */}
              <div className="overflow-y-auto p-6 flex flex-col">
                <div className="flex items-center justify-between mb-3 flex-shrink-0">
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">İzinler</p>
                  <span className="text-xs text-zinc-400">{cPerms.length} izin seçili</span>
                </div>
                {permsData ? (
                  <PermissionEditor perms={cPerms} permGroups={permGroups}
                    onToggle={name => togglePerm(cPerms, setCPerms, name)}
                    onToggleGroup={gp => toggleGroup(cPerms, setCPerms, gp)} />
                ) : <div className="h-32 flex items-center justify-center text-zinc-400 text-sm">Yükleniyor...</div>}
              </div>
            </div>
            {/* Footer */}
            <div className="flex gap-3 px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 flex-shrink-0">
              <button onClick={() => setCreateOpen(false)} disabled={createMutation.isPending}
                className="flex-1 px-4 py-2 text-sm font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50">
                İptal
              </button>
              <button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !cName.trim()}
                className="flex-1 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50">
                {createMutation.isPending ? 'Oluşturuluyor...' : 'Rol Oluştur'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Slide-over */}
      {editRole && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/50 backdrop-blur-sm" onClick={() => setEditRole(null)} />
          <div className="w-full max-w-2xl bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
              <div>
                <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Rol Düzenle</h3>
                <p className="text-xs text-zinc-400 mt-0.5">{editRole.display_name}</p>
              </div>
              <button onClick={() => setEditRole(null)} className="text-zinc-400 hover:text-zinc-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div>
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">Rol Bilgileri</p>
                <RoleFields
                  displayName={eName}  onDisplayName={setEName}
                  description={eDesc}  onDescription={setEDesc}
                  level={eLevel}       onLevel={setELevel}
                  color={eColor}       onColor={setEColor}
                  departmentId={eDept} onDepartmentId={setEDept}
                  departments={departments}
                  isSystem={editRole.is_system}
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">İzinler</p>
                  <span className="text-xs text-zinc-400">{ePerms.length} izin seçili</span>
                </div>
                {permsData ? (
                  <PermissionEditor perms={ePerms} permGroups={permGroups}
                    onToggle={name => togglePerm(ePerms, setEPerms, name)}
                    onToggleGroup={gp => toggleGroup(ePerms, setEPerms, gp)} />
                ) : <div className="h-32 flex items-center justify-center text-zinc-400 text-sm">Yükleniyor...</div>}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 flex gap-3">
              <button onClick={() => setEditRole(null)} disabled={updateMutation.isPending}
                className="flex-1 px-4 py-2 text-sm font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50">
                İptal
              </button>
              <button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending || !eName.trim()}
                className="flex-1 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50">
                {updateMutation.isPending ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
