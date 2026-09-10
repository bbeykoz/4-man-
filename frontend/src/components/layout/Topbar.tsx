'use client'

import { Bell, Search, Sun, Moon, Monitor, Menu } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { useUiStore } from '@/store/ui.store'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { get } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'

export function Topbar({ title }: { title?: string }) {
  const { user }                              = useAuthStore()
  const { theme, setTheme, toggleMobileSidebar } = useUiStore()
  const [unreadCount, setUnreadCount] = useState(0)
  const t = useT()

  useEffect(() => {
    get<{ success: boolean; data: { count: number } }>('/notifications/unread-count')
      .then((res) => setUnreadCount(res.data.count))
      .catch(() => {})
  }, [])

  const cycleTheme = () => {
    const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light'
    setTheme(next)
  }

  return (
    <header className="h-16 bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 flex items-center px-4 gap-3 flex-shrink-0">
      {/* Mobile hamburger */}
      <button
        onClick={toggleMobileSidebar}
        className="lg:hidden p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex-shrink-0"
      >
        <Menu className="h-5 w-5" />
      </button>

      {title && (
        <h1 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 hidden md:block">{title}</h1>
      )}

      {/* Search */}
      <div className="flex-1 max-w-sm hidden md:flex">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input
            type="text"
            placeholder={t('topbar.search')}
            className={cn(
              'w-full pl-9 pr-4 py-2 text-sm rounded-lg',
              'bg-zinc-100 dark:bg-zinc-800 border border-transparent',
              'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-zinc-900',
              'text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400',
              'transition-all duration-150'
            )}
          />
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/* Theme toggle */}
        <button
          onClick={cycleTheme}
          className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
          title={t('topbar.changeTheme')}
        >
          {theme === 'dark'  ? <Moon className="h-4 w-4" />    :
           theme === 'light' ? <Sun className="h-4 w-4" />     :
           <Monitor className="h-4 w-4" />}
        </button>

        {/* Notifications */}
        <Link
          href="/notifications"
          className="relative p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-zinc-950" />
          )}
        </Link>

        {/* User avatar */}
        {user && (
          <Link href="/profile" className="flex items-center gap-2 pl-2 hover:opacity-80 transition-opacity">
            <img
              src={user.avatar_url}
              alt={user.name}
              className="w-8 h-8 rounded-full object-cover ring-2 ring-zinc-200 dark:ring-zinc-700"
            />
            <div className="hidden lg:block text-right">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 leading-none">{user.name}</p>
              <p className="text-xs text-zinc-500 mt-0.5">{user.company?.name ?? 'Super Admin'}</p>
            </div>
          </Link>
        )}
      </div>
    </header>
  )
}
