'use client'

import {
  BookOpen, Calculator, CalendarRange, CreditCard, FileText, LayoutGrid,
  Coins, Landmark, Percent, Scale, Settings2, ShieldCheck, Users, Warehouse,
} from 'lucide-react'

/**
 * Muhasebe sekmeleri.
 *
 * Sıra iş akışını izliyor: önce defter ve kayıt, sonra ticari belgeler,
 * sonra tahsilat, sonra vergi, en sonda kurulum ve yetki.
 *
 * `permission` alanı sekmeyi görmek için gereken izni söylüyor; kullanıcının
 * izni yoksa sekme hiç çizilmiyor.
 */
export interface AccountingTab {
  id: string
  label: string
  icon: typeof BookOpen
  permission?: string
  /** Yalnız yöneticide görünür; uzman ve kasa operatörü görmez. */
  managerOnly?: boolean
}

export const ACCOUNTING_TABS: AccountingTab[] = [
  { id: 'ozet',        label: 'Özet',              icon: LayoutGrid },
  { id: 'fisler',      label: 'Yevmiye Fişleri',   icon: BookOpen,     permission: 'accounting.journal.view' },
  { id: 'hesap-plani', label: 'Hesap Planı',       icon: Calculator,   permission: 'accounting.chart.view' },
  { id: 'donemler',    label: 'Dönemler',          icon: CalendarRange, permission: 'accounting.period.view' },
  { id: 'belgeler',    label: 'Belgeler',          icon: FileText,     permission: 'accounting.document.view' },
  { id: 'cariler',     label: 'Cari Hesaplar',     icon: Users,        permission: 'accounting.partner.view' },
  { id: 'banka',       label: 'Banka & Kasa',      icon: Landmark,     permission: 'accounting.bank.view' },
  { id: 'odemeler',    label: 'Tahsilat & Ödeme',  icon: CreditCard,   permission: 'accounting.bank.view' },
  { id: 'kdv',         label: 'KDV Merkezi',       icon: Percent,      permission: 'accounting.vat.view' },
  { id: 'raporlar',    label: 'Defter Raporları',  icon: Scale,        permission: 'accounting.report.view' },
  { id: 'doviz',       label: 'Döviz & Kur',       icon: Coins,        permission: 'accounting.report.view' },
  { id: 'depo-koprusu', label: 'Depo Köprüsü',     icon: Warehouse,    permission: 'accounting.inventory.view' },
  { id: 'kurulum',     label: 'Kurulum',           icon: Settings2,    permission: 'accounting.setup.manage', managerOnly: true },
  { id: 'yetkiler',    label: 'Yetkiler',          icon: ShieldCheck,  permission: 'accounting.audit.view',   managerOnly: true },
]

/** Kenar menüde alt başlık olarak görünecek sekmeler. */
export const ACCOUNTING_SIDEBAR_TABS = ACCOUNTING_TABS.map(t => ({ id: t.id, label: t.label }))

export const DEFAULT_TAB = 'ozet'

// ─── Sekme adresi ─────────────────────────────────────────────────

import { useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

/**
 * Aktif sekmeyi adres çubuğunda tutar.
 *
 * Depo modülündeki useTabParam ile aynı davranış: sekme paylaşılabilir
 * bağlantı olur ve geri tuşu çalışır.
 */
export function useAccountingTab(validIds: string[]) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const raw = searchParams.get('tab')
  const activeTab = raw && validIds.includes(raw) ? raw : DEFAULT_TAB

  const setActiveTab = useCallback((id: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (id === DEFAULT_TAB) params.delete('tab')
    else params.set('tab', id)
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [searchParams, router, pathname])

  return [activeTab, setActiveTab] as const
}
