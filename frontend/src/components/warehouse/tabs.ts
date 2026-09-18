'use client'

import { useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  Layers, SlidersHorizontal, ArrowLeftRight, Boxes, ShieldAlert, ShoppingCart, CalendarClock,
  Shuffle, Siren, FlaskConical, Gauge, Grid3x3, LineChart, Package,
} from 'lucide-react'

/** Depo Müdürü ve Depo Kontrolcüsü sayfalarının sekmeleri; kenar menüdeki alt başlıklar da buradan gelir. */
export const WAREHOUSE_TABS = [
  { id: 'depolama',      label: 'Depolama',               icon: Layers },
  { id: 'stok',          label: 'Stok Kontrolü',          icon: SlidersHorizontal },
  { id: 'yukleme',       label: 'Yükleme – Boşaltma',     icon: ArrowLeftRight },
  { id: 'stok-durumu',   label: 'Stok Durumu',            icon: Boxes },
  { id: 'stok-riski',    label: 'Stok Riski',             icon: ShieldAlert },
  { id: 'satin-alma',    label: 'Satın Alma',             icon: ShoppingCart },
  { id: 'skt-olu-stok',  label: 'SKT & Ölü Stok',         icon: CalendarClock },
  { id: 'depo-transfer', label: 'Depo Transferleri',      icon: Shuffle },
  { id: 'anomaliler',    label: 'Anomaliler',             icon: Siren },
  { id: 'what-if',       label: 'What-if Simülasyonu',    icon: FlaskConical },
  { id: 'depo-kpi',      label: 'Depo KPI',               icon: Gauge },
  { id: 'abc-xyz',       label: 'ABC / XYZ',              icon: Grid3x3 },
  { id: 'raporlar',      label: 'Raporlar',               icon: LineChart },
  { id: 'paketleme',     label: 'Paketleme & Etiketleme', icon: Package },
]

/** Kenar menüde alt başlığı olan sayfalar (sadece aktif depo departmanları). */
export const SIDEBAR_SUB_TABS: Record<string, { id: string; label: string }[]> = {
  '/modules/warehouse':         WAREHOUSE_TABS,
  '/modules/warehouse-control': WAREHOUSE_TABS,
}

/** Aktif sekme URL'deki ?tab= değerinden okunur; böylece kenar menü bağlantıları doğru sekmeyi açar. */
export function useTabParam(defaultTab: string, validIds: string[]) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const raw = searchParams.get('tab')
  const activeTab = raw && validIds.includes(raw) ? raw : defaultTab

  const setActiveTab = useCallback((id: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (id === defaultTab) params.delete('tab')
    else params.set('tab', id)
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [searchParams, router, pathname, defaultTab])

  return [activeTab, setActiveTab] as const
}
