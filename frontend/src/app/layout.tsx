import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: { default: 'BytePanel', template: '%s | BytePanel' },
  description: 'Kurumsal Yönetim Paneli',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (() => {
                const cleanNode = (node) => {
                  if (!node || typeof node.getAttributeNames !== 'function') return;
                  for (const name of node.getAttributeNames()) {
                    if (/^(bis_|__processed_)/.test(name)) {
                      node.removeAttribute(name);
                    }
                  }
                };

                const removeInjectedAttributes = () => {
                  try {
                    cleanNode(document.documentElement);
                    cleanNode(document.body);
                    document.querySelectorAll('*').forEach(cleanNode);
                  } catch (e) {}
                };

                try {
                  const s = JSON.parse(localStorage.getItem('bytepanel-ui') || '{}');
                  const t = s.state?.theme || 'system';
                  if (t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                    document.documentElement.classList.add('dark');
                  }
                } catch (e) {}

                removeInjectedAttributes();

                if (document.readyState === 'loading') {
                  document.addEventListener('DOMContentLoaded', removeInjectedAttributes, { once: true });
                }

                const observer = new MutationObserver((mutations) => {
                  for (const mutation of mutations) {
                    if (mutation.type === 'attributes') {
                      const name = mutation.attributeName || '';
                      if (/^(bis_|__processed_)/.test(name)) {
                        const target = mutation.target;
                        if (target && typeof target.removeAttribute === 'function') {
                          target.removeAttribute(name);
                        }
                      }
                    }
                  }
                  removeInjectedAttributes();
                });

                try {
                  observer.observe(document.documentElement, {
                    attributes: true,
                    subtree: true,
                    childList: true,
                  });
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className={`${inter.className} antialiased`} suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
