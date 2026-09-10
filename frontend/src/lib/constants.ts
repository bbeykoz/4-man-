export const MODULES = [
  { slug: 'accounting',        name: 'Muhasebe',         icon: 'Calculator',    color: 'blue',   path: '/modules/accounting' },
  { slug: 'marketing',         name: 'Marketing',        icon: 'Megaphone',     color: 'pink',   path: '/modules/marketing' },
  { slug: 'warehouse',         name: 'Depo Müdürü',      icon: 'Warehouse',     color: 'amber',  path: '/modules/warehouse' },
  { slug: 'warehouse_control', name: 'Depo Kontrolcüsü', icon: 'ClipboardCheck',color: 'orange', path: '/modules/warehouse-control' },
  { slug: 'packaging',         name: 'Paketleme',        icon: 'Package',       color: 'teal',   path: '/modules/packaging' },
  { slug: 'returns',           name: 'İade',             icon: 'RotateCcw',     color: 'red',    path: '/modules/returns' },
  { slug: 'customs',           name: 'Gümrükleme',       icon: 'Globe',         color: 'indigo', path: '/modules/customs' },
  { slug: 'shipping',          name: 'Nakliye',          icon: 'Truck',         color: 'green',  path: '/modules/shipping' },
] as const

// Departman sayfası → sistem modül slug'ı (süper admin pasife alınca erişim kapanır)
export const MODULE_ROUTE_SLUGS: Record<string, string> = {
  '/modules/accounting-manager': 'accounting',
  '/modules/accounting':         'accounting',
  '/modules/marketing':          'marketing',
  '/modules/warehouse':          'warehouse',
  '/modules/warehouse-control':  'warehouse_control',
  '/modules/packaging':          'packaging',
  '/modules/returns-manager':    'returns',
  '/modules/returns':            'returns',
  '/modules/customs':            'customs',
  '/modules/shipping-manager':   'shipping',
  '/modules/shipping':           'shipping',
}

export function getModuleSlugForPath(pathname: string): string | null {
  for (const [route, slug] of Object.entries(MODULE_ROUTE_SLUGS)) {
    if (pathname === route || pathname.startsWith(route + '/')) return slug
  }
  return null
}

export const ROLE_LEVELS = {
  SUPER_ADMIN:        1,
  COMPANY_OWNER:      2,
  DEPARTMENT_MANAGER: 3,
  STAFF:              4,
  VIEWER:             5,
} as const

export const STATUS_OPTIONS = [
  { value: 'draft',       label: 'Taslak' },
  { value: 'pending',     label: 'Bekliyor' },
  { value: 'in_progress', label: 'İşlemde' },
  { value: 'completed',   label: 'Tamamlandı' },
  { value: 'cancelled',   label: 'İptal' },
  { value: 'approved',    label: 'Onaylandı' },
  { value: 'rejected',    label: 'Reddedildi' },
]

export const PRIORITY_OPTIONS = [
  { value: 'low',      label: 'Düşük' },
  { value: 'medium',   label: 'Orta' },
  { value: 'high',     label: 'Yüksek' },
  { value: 'critical', label: 'Kritik' },
]

export const ITEMS_PER_PAGE = 15
