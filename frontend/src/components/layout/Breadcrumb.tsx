import Link from 'next/link'
import { ChevronRight, Home } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BreadcrumbItem {
  label: string
  href?: string
}

interface BreadcrumbProps {
  items: BreadcrumbItem[]
  className?: string
}

export function Breadcrumb({ items, className }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className={cn('flex items-center gap-1 text-sm', className)}>
      <Link href="/" className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
        <Home className="h-3.5 w-3.5" />
      </Link>
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3 text-zinc-300 dark:text-zinc-600" />
          {item.href && i < items.length - 1 ? (
            <Link
              href={item.href}
              className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
            >
              {item.label}
            </Link>
          ) : (
            <span className={cn(i === items.length - 1 ? 'text-zinc-900 dark:text-zinc-100 font-medium' : 'text-zinc-500')}>
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  )
}
