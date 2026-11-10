'use client'

/**
 * Muhasebe modülü.
 *
 * Eski düz kayıt listesi kaldırıldı; yerine çift taraflı muhasebe çekirdeğinin
 * ekranları geldi. Sekmeler iş akışını izliyor: defter → belge → tahsilat →
 * vergi → kurulum.
 *
 * Sekmeler izne göre çiziliyor; yetkisi olmayan kullanıcı sekmeyi hiç görmüyor.
 */
import { Suspense } from 'react'
import { PageHeader } from '@/components/common/PageHeader'
import { BrandLoaderBlock } from '@/components/common/BrandLoader'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { ACCOUNTING_TABS, useAccountingTab } from '@/components/accounting/tabs'
import { DashboardPanel } from '@/components/accounting/DashboardPanel'
import { OverviewPanel } from '@/components/accounting/OverviewPanel'
import { JournalPanel } from '@/components/accounting/JournalPanel'
import { ChartPanel } from '@/components/accounting/ChartPanel'
import { PeriodsPanel } from '@/components/accounting/PeriodsPanel'
import { DocumentsPanel } from '@/components/accounting/DocumentsPanel'
import { PartnersPanel } from '@/components/accounting/PartnersPanel'
import { BankingPanel } from '@/components/accounting/BankingPanel'
import { PaymentsPanel } from '@/components/accounting/PaymentsPanel'
import { VatPanel } from '@/components/accounting/VatPanel'
import { ReportsPanel } from '@/components/accounting/ReportsPanel'
import { CurrencyPanel } from '@/components/accounting/CurrencyPanel'
import { InventoryBridgePanel } from '@/components/accounting/InventoryBridgePanel'
import { SetupPanel } from '@/components/accounting/SetupPanel'
import { AuthorizationPanel } from '@/components/accounting/AuthorizationPanel'

export default function AccountingPage() {
  return (
    <Suspense fallback={<BrandLoaderBlock />}>
      <AccountingContent />
    </Suspense>
  )
}

function AccountingContent() {
  const hasPermission = useAuthStore(s => s.hasPermission)

  // İzni olmayan sekme hiç çizilmiyor; "yetkiniz yok" ekranı göstermek yerine
  // sekmeyi gizlemek daha az kafa karıştırıyor.
  const sekmeler = ACCOUNTING_TABS.filter(t => !t.permission || hasPermission(t.permission))
  const [aktif, setAktif] = useAccountingTab(sekmeler.map(t => t.id))

  return (
    <div className="space-y-4">
      <PageHeader
        title="Muhasebe"
        description="Çift taraflı defter, belgeler, cari hesaplar, banka ve vergi"
      />

      <div className="-mx-1 overflow-x-auto px-1">
        <div className="flex min-w-max gap-1 rounded-xl border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-900">
          {sekmeler.map(t => {
            const Icon = t.icon
            const secili = aktif === t.id

            return (
              <button
                key={t.id}
                onClick={() => setAktif(t.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors',
                  secili
                    ? 'bg-blue-600 text-white'
                    : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800',
                )}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {aktif === 'ozet'         && (
        <div className="space-y-4">
          <DashboardPanel onNavigate={setAktif} />
          <OverviewPanel onNavigate={setAktif} />
        </div>
      )}
      {aktif === 'fisler'       && <JournalPanel />}
      {aktif === 'hesap-plani'  && <ChartPanel />}
      {aktif === 'donemler'     && <PeriodsPanel />}
      {aktif === 'belgeler'     && <DocumentsPanel />}
      {aktif === 'cariler'      && <PartnersPanel />}
      {aktif === 'banka'        && <BankingPanel />}
      {aktif === 'odemeler'     && <PaymentsPanel />}
      {aktif === 'kdv'          && <VatPanel />}
      {aktif === 'raporlar'     && <ReportsPanel />}
      {aktif === 'doviz'        && <CurrencyPanel />}
      {aktif === 'depo-koprusu' && <InventoryBridgePanel />}
      {aktif === 'kurulum'      && <SetupPanel />}
      {aktif === 'yetkiler'     && <AuthorizationPanel />}
    </div>
  )
}
