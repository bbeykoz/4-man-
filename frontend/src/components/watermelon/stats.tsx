'use client';

// watermelon "stats 2" bloğu. Düzen, animasyonlar ve gradyanlar aslındaki gibi;
// import yolu @/components/ui/card, sayılar ve metinler depo işine göre Türkçe.
import { Card, CardContent } from '@/components/ui/card';
import { FaBolt, FaRocket, FaShieldAlt } from 'react-icons/fa';

const stats = [
  {
    icon: FaBolt,
    pillBg: 'bg-amber-500/10',
    pillText: 'text-amber-600',
    glowColor: 'rgba(245,158,11,0.15)',
    accentGradient: 'from-amber-400 via-orange-400 to-rose-400',
    label: 'Aylık stok hareketi',
    metric: '372',
    subLabel: 'Tek depoda, tek ayda',
    description:
      'Giriş, çıkış, transfer ve sayım aynı deftere yazılır. Hiçbir kayıt silinmez, iptalde ters kayıt düşülür.',
  },
  {
    icon: FaRocket,
    pillBg: 'bg-cyan-500/10',
    pillText: 'text-cyan-600',
    glowColor: 'rgba(6,182,212,0.15)',
    accentGradient: 'from-cyan-400 via-blue-400 to-indigo-400',
    label: 'Ortalama çıkış süresi',
    metric: '2,4 sa',
    subLabel: 'Kayıttan sevkiyata',
    description:
      'Kalite kontrolü, lot seçimi ve onay tek ekranda ilerler. FEFO ile hangi lotun çıkacağı kendiliğinden belirlenir.',
  },
  {
    icon: FaShieldAlt,
    pillBg: 'bg-emerald-500/10',
    pillText: 'text-emerald-600',
    glowColor: 'rgba(16,185,129,0.15)',
    accentGradient: 'from-emerald-400 via-teal-400 to-cyan-400',
    label: 'Sayım doğruluğu',
    metric: '%99,4',
    subLabel: 'Fark payı ±%2 altında',
    description:
      'Sayım farkı, hasar ve iade oranları gece taramasında kontrol edilir; sapma varsa yetkiliye bildirilir.',
  },
];

export default function Stats() {
  return (
    <>
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-4px); }
        }
        .stat-card {
          transition: all 0.5s cubic-bezier(0.23, 1, 0.32, 1);
        }
        .stat-card:hover .accent-bar {
          height: 100% !important;
          top: 0 !important;
          transition: all 0.6s cubic-bezier(0.23, 1, 0.32, 1);
        }
        .stat-card .accent-bar {
          transition: all 0.5s cubic-bezier(0.23, 1, 0.32, 1);
        }
        .stat-card:hover .card-glow {
          opacity: 1;
        }
        .card-glow {
          transition: opacity 0.5s cubic-bezier(0.23, 1, 0.32, 1);
        }
        .stat-card:hover .metric-value {
          animation: float 3s ease-in-out infinite;
        }
        .stat-card:hover .pill-badge {
          transform: scale(1.03);
          box-shadow: 0 0 0 1px currentColor;
        }
        .pill-badge {
          transition: all 0.4s cubic-bezier(0.23, 1, 0.32, 1);
        }
        .stat-card:hover .shimmer-line {
          animation: shimmer 2s linear infinite;
          background-size: 200% 100%;
        }
        .stat-card:hover .stat-icon {
          transform: rotate(-8deg) scale(1.15);
        }
        .stat-icon {
          transition: transform 0.4s cubic-bezier(0.23, 1, 0.32, 1);
        }
        .stat-card:hover .desc-text {
          color: var(--foreground);
        }
        .desc-text {
          transition: color 0.4s ease;
        }
      `}</style>

      <section className="w-full px-4 py-16 md:px-8">
        <div className="mx-auto max-w-6xl text-center">
          <h2 className="text-foreground mt-8 text-4xl leading-[1.1] font-bold tracking-tight md:text-5xl lg:text-[3.5rem]">
            Depoyu rakamla yöneten ekipler için
            <span className="block bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500 bg-clip-text text-transparent">
              tahmine yer yok
            </span>
          </h2>

          <p className="text-muted-foreground mx-auto mt-5 max-w-xl text-base leading-relaxed md:text-lg">
            Sayılar panelden geliyor: hareket defteri, kalite kontrol ve sayım
            kayıtları. Tek ekranda toplanır, tek tıkla Excel&apos;e iner.
          </p>

          <div className="mt-16 grid grid-cols-1 gap-5 md:grid-cols-3">
            {stats.map((stat) => (
              <Card
                key={stat.label}
                className="stat-card group bg-background relative overflow-hidden rounded-none p-0 shadow-[0px_0px_0px_1px_rgba(0,0,0,0.08),0px_1px_2px_-1px_rgba(0,0,0,0.08),0px_2px_4px_0px_rgba(0,0,0,0.06)] ring-0 transition-shadow duration-300 hover:shadow-[0px_0px_0px_1px_rgba(0,0,0,0.08),0px_1px_2px_-1px_rgba(0,0,0,0.08),0px_4px_4px_0px_rgba(0,0,0,0.1)]"
              >
                <div
                  className="card-glow pointer-events-none absolute inset-0 rounded-none opacity-0"
                  style={{
                    background: `radial-gradient(600px circle at 50% 0%, ${stat.glowColor}, transparent 60%)`,
                  }}
                />

                <div
                  className={`accent-bar absolute top-[20%] left-0 h-[60%] w-[3px] rounded-full bg-gradient-to-b ${stat.accentGradient}`}
                />

                <CardContent className="relative flex h-full flex-col p-7 text-left">
                  <div className="flex items-center">
                    <span
                      className={`pill-badge inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold tracking-wide uppercase ${stat.pillBg} ${stat.pillText}`}
                    >
                      <stat.icon className="stat-icon size-3" />
                      {stat.label}
                    </span>
                  </div>

                  <div className="mt-8 flex items-baseline gap-1">
                    <span className="metric-value text-foreground text-6xl font-bold tracking-tighter">
                      {stat.metric}
                    </span>
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <div
                      className={`shimmer-line h-[2px] w-8 rounded-full bg-gradient-to-r ${stat.accentGradient}`}
                      style={{
                        backgroundImage: `linear-gradient(90deg, transparent, currentColor, transparent)`,
                      }}
                    />
                    <p className="text-foreground text-sm font-medium">
                      {stat.subLabel}
                    </p>
                  </div>

                  <p className="desc-text text-muted-foreground mt-6 text-sm leading-relaxed">
                    {stat.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
