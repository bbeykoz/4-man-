'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Building2, Users, Shield, Boxes, Calculator, Megaphone,
  Warehouse, ClipboardCheck, Package, RotateCcw, Globe, Truck,
  Settings, Bell, FileText, ChevronLeft, ChevronRight, LogOut,
  BarChart2, Ship, MessageSquare, Ticket, CalendarDays, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { useUiStore } from '@/store/ui.store'
import { useAuth } from '@/hooks/useAuth'
import { useModuleStatus } from '@/hooks/useModuleStatus'
import { ROLE_LEVELS, getModuleSlugForPath } from '@/lib/constants'
import { useT } from '@/lib/i18n'
import { useQuery } from '@tanstack/react-query'
import { get } from '@/lib/api'

const iconMap: Record<string, React.ElementType> = {
  LayoutDashboard, Building2, Users, Shield, Boxes, Calculator, Megaphone,
  Warehouse, ClipboardCheck, Package, RotateCcw, Globe, Truck,
  Settings, Bell, FileText, BarChart2, Ship, MessageSquare, Ticket, CalendarDays,
}

interface NavItem {
  label: string
  href: string
  icon: string
  permission?: string
  badge?: number
}

interface NavGroup {
  title: string
  items: NavItem[]
}

function getSidebarNav(roleLevel: number, t: (key: string) => string, unreadMessages = 0): NavGroup[] {
  const nav: NavGroup[] = []

  if (roleLevel === ROLE_LEVELS.SUPER_ADMIN) {
    nav.push({
      title: t('nav.group.admin'),
      items: [
        { label: t('nav.dashboard'),    href: '/super-admin/dashboard', icon: 'LayoutDashboard' },
        { label: t('nav.companies'),    href: '/super-admin/companies', icon: 'Building2' },
        { label: t('nav.users'),        href: '/super-admin/users',     icon: 'Users' },
        { label: t('nav.departments'),  href: '/super-admin/modules',   icon: 'Boxes' },
        { label: t('nav.systemLogs'),   href: '/super-admin/logs',      icon: 'FileText' },
        { label: t('nav.settings'),      href: '/super-admin/settings',  icon: 'Settings' },
        { label: t('nav.adminTickets'),  href: '/super-admin/tickets',   icon: 'Ticket' },
      ],
    })
  }

  if (roleLevel > ROLE_LEVELS.SUPER_ADMIN) {
    nav.push({
      title: t('nav.group.company'),
      items: [
        { label: t('nav.dashboard'),   href: '/company/dashboard',   icon: 'LayoutDashboard' },
        { label: t('nav.users'),       href: '/company/users',       icon: 'Users',    permission: 'company.users.view' },
        { label: t('nav.departments'), href: '/company/departments', icon: 'Building2', permission: 'company.departments.view' },
        { label: t('nav.roles'),       href: '/company/roles',       icon: 'Shield',   permission: 'company.roles.view' },
        { label: t('nav.settings'),    href: '/company/settings',    icon: 'Settings', permission: 'company.settings' },
      ],
    })
  }

  nav.push({
    title: t('nav.group.departments'),
    items: [
      { label: t('nav.accountingManager'),  href: '/modules/accounting-manager', icon: 'BarChart2',     permission: 'accounting.records.view' },
      { label: t('nav.shippingManager'),    href: '/modules/shipping-manager',   icon: 'Ship',          permission: 'shipping.records.view' },
      { label: t('nav.returnsManager'),     href: '/modules/returns-manager',    icon: 'RotateCcw',     permission: 'returns.records.view' },
      { label: t('nav.warehouseManager'),   href: '/modules/warehouse',          icon: 'Warehouse',     permission: 'warehouse.records.view' },
      { label: t('nav.warehouseController'),href: '/modules/warehouse-control',  icon: 'ClipboardCheck',permission: 'warehouse_control.records.view' },
      { label: t('nav.accounting'),         href: '/modules/accounting',         icon: 'Calculator',    permission: 'accounting.staff.view' },
      { label: t('nav.marketing'),          href: '/modules/marketing',          icon: 'Megaphone',     permission: 'marketing.staff.view' },
      { label: t('nav.packaging'),          href: '/modules/packaging',          icon: 'Package',       permission: 'packaging.staff.view' },
      { label: t('nav.returns'),            href: '/modules/returns',            icon: 'RotateCcw',     permission: 'returns.staff.view' },
      { label: t('nav.customs'),            href: '/modules/customs',            icon: 'Globe',         permission: 'customs.staff.view' },
      { label: t('nav.shipping'),           href: '/modules/shipping',           icon: 'Truck',         permission: 'shipping.staff.view' },
    ],
  })

  nav.push({
    title: t('nav.group.other'),
    items: [
      { label: t('nav.messages'),      href: '/messages',      icon: 'MessageSquare', badge: unreadMessages || undefined },
      { label: t('nav.notifications'), href: '/notifications', icon: 'Bell' },
      ...(roleLevel !== ROLE_LEVELS.SUPER_ADMIN ? [
        { label: t('nav.meetings'), href: '/meetings', icon: 'CalendarDays' },
        { label: t('nav.tickets'),  href: '/tickets',  icon: 'Ticket' },
      ] : []),
      { label: t('nav.activityLog'),   href: '/activity-logs', icon: 'FileText' },
      { label: t('nav.settings'),      href: '/settings',      icon: 'Settings' },
    ],
  })

  return nav
}

export function Sidebar() {
  const pathname    = usePathname()
  const { roleLevel, hasPermission, isCompanyOwner } = useAuthStore()
  const { sidebarCollapsed, toggleSidebar, mobileSidebarOpen, setMobileSidebarOpen } = useUiStore()
  const { user, logout, isAuthenticated } = useAuth()
  const t = useT()

  const { data: unreadData } = useQuery({
    queryKey: ['messages', 'unread-count'],
    queryFn: () => get<{ success: boolean; data: { count: number } }>('/messages/unread-count'),
    refetchInterval: 15_000,
    enabled: isAuthenticated,
  })
  const unreadMessages = unreadData?.data?.count ?? 0

  const navGroups   = getSidebarNav(roleLevel, t, unreadMessages)
  const fullAccess  = isCompanyOwner()
  const superAdmin  = roleLevel === ROLE_LEVELS.SUPER_ADMIN
  const { isPassive } = useModuleStatus()

  // Pasif departman: şirket kullanıcıları için tıklanamaz, süper admin için sadece etiketli
  const passiveState = (href: string) => {
    const passive = isPassive(getModuleSlugForPath(href))
    return { passive, blocked: passive && !superAdmin }
  }

  const passiveBadge = (
    <span className="ml-auto px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500">
      Pasif
    </span>
  )

  const sidebarContent = (
    <aside
      className={cn(
        'flex flex-col h-full bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800',
        // Desktop
        'hidden lg:flex lg:flex-shrink-0 transition-all duration-200',
        sidebarCollapsed ? 'lg:w-16' : 'lg:w-60',
      )}
    >
      {/* Logo */}
      <div className={cn('flex items-center h-16 px-4 border-b border-zinc-200 dark:border-zinc-800', sidebarCollapsed && 'justify-center')}>
        {!sidebarCollapsed && (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-bold">BP</span>
            </div>
            <span className="text-sm font-bold text-zinc-900 dark:text-white truncate">BytePanel</span>
          </div>
        )}
        <button
          onClick={toggleSidebar}
          className="p-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 transition-colors"
        >
          {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-4">
        {navGroups.map((group) => {
          const visibleItems = group.items.filter(item =>
            !item.permission || fullAccess || hasPermission(item.permission)
          )
          if (visibleItems.length === 0) return null

          return (
            <div key={group.title}>
              {!sidebarCollapsed && (
                <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-600">
                  {group.title}
                </p>
              )}
              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const Icon     = iconMap[item.icon] ?? LayoutDashboard
                  const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                  const { passive, blocked } = passiveState(item.href)

                  if (blocked) {
                    return (
                      <div
                        key={item.href}
                        title={`${item.label} — departman pasif`}
                        aria-disabled="true"
                        className={cn(
                          'flex items-center gap-3 px-3 py-2 rounded-lg text-sm cursor-not-allowed text-zinc-400 dark:text-zinc-600',
                          sidebarCollapsed && 'justify-center px-2'
                        )}
                      >
                        <Icon className="h-4 w-4 flex-shrink-0" />
                        {!sidebarCollapsed && <span className="truncate flex-1 line-through">{item.label}</span>}
                        {!sidebarCollapsed && passiveBadge}
                      </div>
                    )
                  }

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={sidebarCollapsed ? item.label : undefined}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all',
                        isActive
                          ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400 font-medium'
                          : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-zinc-100',
                        passive && !isActive && 'opacity-60',
                        sidebarCollapsed && 'justify-center px-2'
                      )}
                    >
                      <span className="relative flex-shrink-0">
                        <Icon className={cn('h-4 w-4', isActive && 'text-blue-600 dark:text-blue-400')} />
                        {!!item.badge && sidebarCollapsed && (
                          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold leading-none">
                            {item.badge > 99 ? '99+' : item.badge}
                          </span>
                        )}
                      </span>
                      {!sidebarCollapsed && <span className="truncate flex-1">{item.label}</span>}
                      {!sidebarCollapsed && passive && passiveBadge}
                      {!sidebarCollapsed && !!item.badge && (
                        <span className="ml-auto min-w-[20px] h-5 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
                          {item.badge > 99 ? '99+' : item.badge}
                        </span>
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-zinc-200 dark:border-zinc-800 p-3">
        {!sidebarCollapsed && user && (
          <div className="flex items-center gap-3 px-1 mb-2">
            <img
              src={user.avatar_url}
              alt={user.name}
              className="w-8 h-8 rounded-full object-cover flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{user.name}</p>
              <p className="text-xs text-zinc-500 truncate">{user.email}</p>
            </div>
          </div>
        )}
        <button
          onClick={() => logout()}
          className={cn(
            'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-zinc-600 dark:text-zinc-400',
            'hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50 dark:hover:text-red-400 transition-colors',
            sidebarCollapsed && 'justify-center'
          )}
        >
          <LogOut className="h-4 w-4 flex-shrink-0" />
          {!sidebarCollapsed && <span>{t('nav.signOut')}</span>}
        </button>
      </div>
    </aside>
  )

  return (
    <>
      {/* Desktop sidebar */}
      {sidebarContent}

      {/* Mobile overlay */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-72 flex flex-col',
          'bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800',
          'transform transition-transform duration-200 ease-in-out lg:hidden',
          mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Mobile header */}
        <div className="flex items-center h-16 px-4 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-bold">BP</span>
            </div>
            <span className="text-sm font-bold text-zinc-900 dark:text-white truncate">BytePanel</span>
          </div>
          <button
            onClick={() => setMobileSidebarOpen(false)}
            className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Mobile nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-4">
          {navGroups.map((group) => {
            const visibleItems = group.items.filter(item =>
              !item.permission || fullAccess || hasPermission(item.permission)
            )
            if (visibleItems.length === 0) return null

            return (
              <div key={group.title}>
                <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-600">
                  {group.title}
                </p>
                <div className="space-y-0.5">
                  {visibleItems.map((item) => {
                    const Icon     = iconMap[item.icon] ?? LayoutDashboard
                    const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                    const { passive, blocked } = passiveState(item.href)

                    if (blocked) {
                      return (
                        <div
                          key={item.href}
                          aria-disabled="true"
                          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm cursor-not-allowed text-zinc-400 dark:text-zinc-600"
                        >
                          <Icon className="h-4 w-4 flex-shrink-0" />
                          <span className="truncate flex-1 line-through">{item.label}</span>
                          {passiveBadge}
                        </div>
                      )
                    }

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileSidebarOpen(false)}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all',
                          isActive
                            ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400 font-medium'
                            : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/50',
                          passive && !isActive && 'opacity-60'
                        )}
                      >
                        <Icon className={cn('h-4 w-4 flex-shrink-0', isActive && 'text-blue-600 dark:text-blue-400')} />
                        <span className="truncate flex-1">{item.label}</span>
                        {passive && passiveBadge}
                        {!!item.badge && (
                          <span className="ml-auto min-w-[20px] h-5 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold">
                            {item.badge > 99 ? '99+' : item.badge}
                          </span>
                        )}
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </nav>

        {/* Mobile footer */}
        <div className="border-t border-zinc-200 dark:border-zinc-800 p-3">
          {user && (
            <div className="flex items-center gap-3 px-1 mb-2">
              <img src={user.avatar_url} alt={user.name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{user.name}</p>
                <p className="text-xs text-zinc-500 truncate">{user.email}</p>
              </div>
            </div>
          )}
          <button
            onClick={() => { setMobileSidebarOpen(false); logout() }}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-zinc-600 dark:text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50 dark:hover:text-red-400 transition-colors"
          >
            <LogOut className="h-4 w-4 flex-shrink-0" />
            <span>{t('nav.signOut')}</span>
          </button>
        </div>
      </div>
    </>
  )
}
