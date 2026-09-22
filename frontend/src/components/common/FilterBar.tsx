'use client'

// Filtre paneli animasyonu: watermelon "filter disclosure". Panel yaylanarak açılır,
// seçenekler sırayla belirir, seçili olanın yanında yeşil tik büyür.
import { AnimatePresence, motion } from 'motion/react'
import { Check, Search, X, SlidersHorizontal } from 'lucide-react'
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
          <motion.button
            whileTap={{ scale: 0.96 }}
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
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="bg-blue-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center"
              >
                {Object.keys(activeFilters).length}
              </motion.span>
            )}
          </motion.button>
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

      <AnimatePresence initial={false}>
        {showFilters && filters.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: 'spring', bounce: 0.15, duration: 0.5 }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap gap-4 p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
              {filters.map((filter) => (
                <div key={filter.key} className="flex min-w-[180px] flex-col gap-1.5">
                  <span className="text-xs font-medium text-zinc-500">{filter.label}</span>
                  <div className="flex flex-col gap-0.5">
                    {[{ value: '', label: 'Tümü' }, ...filter.options].map((opt, index) => {
                      const selected = (activeFilters[filter.key] ?? '') === opt.value
                      return (
                        <motion.button
                          key={opt.value || 'all'}
                          type="button"
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ type: 'spring', stiffness: 240, damping: 20, delay: index * 0.03 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => handleFilterChange(filter.key, opt.value)}
                          className={cn(
                            'flex items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-sm transition-colors',
                            selected
                              ? 'bg-white text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
                              : 'text-zinc-600 hover:bg-white/70 dark:text-zinc-400 dark:hover:bg-zinc-800/60',
                          )}
                        >
                          <span className="truncate">{opt.label}</span>
                          <motion.span
                            animate={{
                              backgroundColor: selected ? '#16a34a' : 'rgba(0,0,0,0)',
                              borderColor: selected ? '#16a34a' : '#a1a1aa',
                            }}
                            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2"
                          >
                            <motion.span
                              animate={{ scale: selected ? 1 : 0, opacity: selected ? 1 : 0 }}
                              transition={{ type: 'spring', stiffness: 520, damping: 30 }}
                            >
                              <Check className="h-2.5 w-2.5 text-white" strokeWidth={4} />
                            </motion.span>
                          </motion.span>
                        </motion.button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  )
}
