import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'BytePanel — Depo ve stok yönetimi',
  description:
    'Stok hareketini hareket defterinden takip edin; kalite kontrol, son kullanma tarihi, stok riski, satın alma ve raporlama tek panelde.',
}

/** Tanıtım sayfası panelden bağımsız: her zaman koyu tema, kullanıcı ayarına bakmaz. */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <div className="dark bg-zinc-950 text-zinc-100">{children}</div>
}
