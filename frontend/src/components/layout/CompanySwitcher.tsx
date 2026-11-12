'use client'

/**
 * Sol panelin üstündeki şirket seçici.
 *
 * Platform ekibi burada şirket seçip o şirketin içinde gezebilir. Geçiş
 * mevcut "şirkete bağlan" akışını kullanır (impersonation): oturum saklanır,
 * şirketin sahibi kimliğiyle devam edilir, üstteki şerit geri dönüş sağlar.
 */
import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Building2, Check, ChevronsUpDown, LogOut, Search } from 'lucide-react'
import { toast } from 'sonner'
import { get } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'

interface Sirket {
  id: string
  name: string
  status?: string | { value: string }
  users_count?: number
}

function durum(s: Sirket): string {
  return typeof s.status === 'string' ? s.status : (s.status?.value ?? '')
}

export function CompanySwitcher({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const { impersonation, impersonateCompany, stopImpersonation } = useAuth()
  const router = useRouter()
  const [acik, setAcik] = useState(false)
  const [arama, setArama] = useState('')
  const [gecis, setGecis] = useState<string | null>(null)
  const kutu = useRef<HTMLDivElement>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['sidebar-companies'],
    queryFn: () => get<{ data: Sirket[] }>('/admin/companies', { params: { per_page: 100 } })
      .then(r => (Array.isArray(r.data) ? r.data : [])),
    enabled: acik,
    staleTime: 60_000,
  })

  const sirketler = useMemo(() => {
    const liste = data ?? []
    const q = arama.trim().toLocaleLowerCase('tr')
    return q ? liste.filter(s => s.name.toLocaleLowerCase('tr').includes(q)) : liste
  }, [data, arama])

  const gec = async (s: Sirket) => {
    if (durum(s) === 'suspended') {
      toast.error(`${s.name} askıya alınmış; bu şirkete geçilemez.`)
      return
    }

    setGecis(s.id)
    try {
      await impersonateCompany(s.id)
      toast.success(`${s.name} şirketine geçildi.`)
      setAcik(false)
      onNavigate?.()
      router.push('/company/dashboard')
    } catch {
      toast.error('Şirkete geçilemedi.')
    } finally {
      setGecis(null)
    }
  }

  // Bağlıyken: hangi şirkette olduğumuz ve tek tuşla geri dönüş.
  if (impersonation) {
    return (
      <div className={cn('px-2 pt-3', collapsed && 'px-1')}>
        <div className={cn(
          'rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2 dark:border-amber-800/60 dark:bg-amber-950/40',
          collapsed && 'px-1.5 py-1.5',
        )}>
          {collapsed ? (
            <button
              onClick={() => stopImpersonation()}
              title={`${impersonation.companyName} — kendi hesabıma dön`}
              className="flex w-full justify-center text-amber-700 dark:text-amber-400"
            >
              <Building2 className="h-4 w-4" />
            </button>
          ) : (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-500">
                Bağlı şirket
              </p>
              <p className="truncate text-sm font-medium text-amber-900 dark:text-amber-200">
                {impersonation.companyName}
              </p>
              <button
                onClick={() => stopImpersonation()}
                className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-amber-700 hover:underline dark:text-amber-400"
              >
                <LogOut className="h-3 w-3" /> Kendi hesabıma dön
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div ref={kutu} className={cn('relative px-2 pt-3', collapsed && 'px-1')}>
      <button
        onClick={() => setAcik(v => !v)}
        title={collapsed ? 'Şirket seç' : undefined}
        className={cn(
          'flex w-full items-center gap-2 rounded-lg border border-zinc-200 px-2.5 py-2 text-sm transition-colors',
          'hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900',
          collapsed && 'justify-center px-1.5',
        )}
      >
        <Building2 className="h-4 w-4 shrink-0 text-zinc-500" />
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1 truncate text-left text-zinc-700 dark:text-zinc-300">Şirket seç</span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
          </>
        )}
      </button>

      {acik && (
        <>
          {/* Dışarı tıklayınca kapanır. */}
          <button
            aria-label="Kapat"
            onClick={() => setAcik(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className={cn(
            'absolute z-50 mt-1 w-[248px] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg',
            'dark:border-zinc-800 dark:bg-zinc-900',
            collapsed ? 'left-full top-3 ml-1' : 'left-2 right-2 w-auto',
          )}>
            <div className="flex items-center gap-2 border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
              <Search className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
              <input
                autoFocus
                value={arama}
                onChange={e => setArama(e.target.value)}
                placeholder="Şirket ara…"
                className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-400 dark:text-zinc-100"
              />
            </div>

            <div className="max-h-72 overflow-y-auto py-1">
              {isLoading ? (
                <p className="px-3 py-4 text-center text-xs text-zinc-400">Yükleniyor…</p>
              ) : sirketler.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-zinc-400">Şirket bulunamadı.</p>
              ) : (
                sirketler.map(s => {
                  const askida = durum(s) === 'suspended'
                  return (
                    <button
                      key={s.id}
                      onClick={() => gec(s)}
                      disabled={!!gecis}
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                        'hover:bg-zinc-50 disabled:opacity-50 dark:hover:bg-zinc-800',
                        askida && 'text-zinc-400',
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{s.name}</span>
                      {askida && <span className="shrink-0 text-[10px] uppercase text-amber-600">askıda</span>}
                      {gecis === s.id && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />}
                    </button>
                  )
                })
              )}
            </div>

            <p className="border-t border-zinc-100 px-3 py-2 text-[11px] text-zinc-400 dark:border-zinc-800">
              Seçtiğiniz şirkete sahibi kimliğiyle bağlanırsınız; üstteki şeritten geri dönersiniz.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
