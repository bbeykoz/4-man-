'use client';

// watermelon "integrations 1" bloğu. Düzen, kart gölgeleri ve sütun dizilimi aslındaki gibi.
// Marka logoları çıkarıldı: projede Stripe, Shopify, Slack gibi entegrasyonlar yok.
// Yerine panelde gerçekten çalışan yetenekler kondu; henüz bağlanmamış olan "yakında" etiketli.
import {
  Camera,
  Database,
  FileSpreadsheet,
  FileText,
  HardDriveDownload,
  Mail,
  type LucideIcon,
  Plug,
  QrCode,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Table,
  Users,
} from 'lucide-react';

interface Capability {
  name: string;
  icon: LucideIcon;
  soon?: boolean;
}

const capabilities: Capability[] = [
  { name: 'Excel içe aktarım', icon: FileSpreadsheet },
  { name: 'Excel raporlar', icon: Table },
  { name: 'PDF fatura', icon: FileText },
  { name: 'Barkod okuyucu', icon: ScanLine },
  { name: 'QR kod', icon: QrCode },
  { name: 'Kamerayla okutma', icon: Camera },
  { name: 'E-posta bildirimi', icon: Mail },
  { name: 'İki adımlı doğrulama', icon: ShieldCheck },
  { name: 'Rol ve yetki', icon: Users },
  { name: 'REST API', icon: Plug },
  { name: 'PostgreSQL', icon: Database },
  { name: 'Günlük yedek', icon: HardDriveDownload },
  { name: 'AI Copilot', icon: Sparkles, soon: true },
];

const columnLayout = [[0], [1, 2], [3, 4, 5], [6, 7, 8], [9, 10], [11], [12]];

function IntegrationCard({ app }: { app: Capability }) {
  const Icon = app.icon;
  return (
    <div
      title={app.soon ? `${app.name} — yakında` : app.name}
      className="group bg-muted/50 relative flex h-16 w-16 items-center justify-center rounded-lg shadow-[inset_0_0_2px_2px_rgba(255,255,255,1),inset_0_0_0_1px_rgba(0,0,0,0.2),0px_0px_0px_1px_rgba(0,0,0,0.08),0px_1px_2px_-1px_rgba(0,0,0,0.08),0px_2px_4px_0px_rgba(0,0,0,0.06)] sm:h-20 sm:w-20 lg:h-24 lg:w-24 dark:shadow-[inset_0_0_2px_2px_rgba(255,255,255,0.04),inset_0_0_0_1px_rgba(255,255,255,0.08),0px_0px_0px_1px_rgba(255,255,255,0.06),0px_1px_2px_-1px_rgba(0,0,0,0.5),0px_2px_4px_0px_rgba(0,0,0,0.4)]"
    >
      <Icon className="text-foreground h-6 w-6 sm:h-8 sm:w-8 lg:h-10 lg:w-10" />
      {app.soon && (
        <span className="bg-primary text-primary-foreground absolute -top-1.5 -right-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold">
          yakında
        </span>
      )}
      <span className="text-muted-foreground pointer-events-none absolute -bottom-5 text-[10px] whitespace-nowrap opacity-0 transition-opacity group-hover:opacity-100">
        {app.name}
      </span>
    </div>
  );
}

export default function Integrations() {
  return (
    <section className="bg-muted/50 relative h-full w-full overflow-hidden py-20">
      <div className="container mx-auto max-w-5xl px-4">
        <div className="animate-in fade-in slide-in-from-bottom-4 mx-auto mb-16 flex max-w-2xl flex-col items-center text-center duration-700 md:mb-12">
          <h2 className="text-foreground mb-6 text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl">
            Kutudan çıkan yetenekler
          </h2>
        </div>

        <div className="relative mx-auto mb-16 max-w-4xl md:mb-24">
          <div className="animate-in fade-in slide-in-from-bottom-8 flex flex-wrap justify-center gap-4 delay-200 duration-700 md:hidden">
            {capabilities.map((app) => (
              <IntegrationCard key={app.name} app={app} />
            ))}
          </div>

          <div className="hidden items-center justify-center gap-2 delay-200 duration-700 md:flex lg:gap-4">
            {columnLayout.map((colIndices, i) => (
              <div key={i} className="flex flex-col gap-2 lg:gap-4">
                {colIndices.map((index) => {
                  const app = capabilities[index];
                  return <IntegrationCard key={app.name} app={app} />;
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="animate-in fade-in slide-in-from-bottom-4 mx-auto flex max-w-lg flex-col items-center text-center delay-300 duration-700">
          <p className="text-muted-foreground mb-6 text-sm leading-relaxed sm:text-base">
            Ek ücret yok, ek kurulum yok. Hepsi panelin içinde hazır gelir; AI
            Copilot için altyapı kurulu, sağlayıcı bağlanınca açılır.
          </p>
        </div>
      </div>
    </section>
  );
}
