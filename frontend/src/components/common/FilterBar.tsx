'use client'

import { Search, X, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useDebounce } from '@/hooks/useDebounce'
import { useEffect } from 'react'

interface FilterOption {
  value: string
  label: string
}

interface FilterBarProps {
  onSearch?: (value: string) => void
  onFilterChange?: (filters: Record<string, string>) => void
  filters?: {
    key: string
    label: string
    options: FilterOption[]
  }[]
  placeholder?: string
  className?: string
}

export function FilterBar({ onSearch, onFilterChange, filters = [], placeholder = 'Ara...', className }: FilterBarProps) {
  const [searchValue, setSearchValue]   = useState('')
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({})
  const [showFilters, setShowFilters]   = useState(false)
  const debouncedSearch = useDebounce(searchValue, 400)

  useEffect(() => { onSearch?.(debouncedSearch) }, [debouncedSearch])

  const handleFilterChange = (key: string, value: string) => {
    const updated = value ? { ...activeFilters, [key]: value } : Object.fromEntries(Object.entries(activeFilters).filter(([k]) => k !== key))
    setActiveFilters(updated)
    onFilterChange?.(updated)
  }

  const clearAll = () => {
    setSearchValue('')
    setActiveFilters({})
    onSearch?.('')
    onFilterChange?.({})
  }

  const hasActiveFilters = searchValue || Object.keys(activeFilters).length > 0

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex gap-2">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder={placeholder}
            className={cn(
              'w-full pl-9 pr-4 py-2 text-sm rounded-lg',
              'border border-zinc-200 dark:border-zinc-700',
              'bg-white dark:bg-zinc-900',
              'focus:outline-none focus:ring-2 focus:ring-blue-500',
              'text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400',
              'transition-all'
            )}
          />
        </div>

        {filters.length > 0 && (
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              'flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-colors',
              showFilters
                ? 'bg-blue-50 dark:bg-blue-950 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400'
                : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
            )}
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span className="hidden sm:inline">Filtrele</span>
            {Object.keys(activeFilters).length > 0 && (
              <span className="bg-blue-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                {Object.keys(activeFilters).length}
              </span>
            )}
          </button>
        )}

        {hasActiveFilters && (
          <button
            onClick={clearAll}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Temizle</span>
          </button>
        )}
      </div>

      {showFilters && filters.length > 0 && (
        <div className="flex flex-wrap gap-2 p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
          {filters.map((filter) => (
            <div key={filter.key} className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-500">{filter.label}</label>
              <select
                value={activeFilters[filter.key] ?? ''}
                onChange={(e) => handleFilterChange(filter.key, e.target.value)}
                className={cn(
                  'text-sm px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700',
                  'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100',
                  'focus:outline-none focus:ring-2 focus:ring-blue-500'
                )}
              >
                <option value="">Tümü</option>
                {filter.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
