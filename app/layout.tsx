import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { IBM_Plex_Sans } from 'next/font/google';
import './globals.css';
import { ThemeToggle } from './components/ThemeToggle';

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-orderly-live-sans',
});

const themeBootstrap = `(function () {
  var theme = 'light';
  try {
    var saved = window.localStorage.getItem('orderlyapp.theme.v1');
    if (saved === 'light' || saved === 'dark') theme = saved;
  } catch (_error) {
    // Storage can be denied at the property or method boundary.
  }
  document.documentElement.setAttribute('data-theme', theme);
})();`;

export const metadata: Metadata = {
  title: 'OrderlyApp',
  description: 'Voice-first food ordering app in active development.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        {/* Runs before body parsing, independent of React hydration and storage availability. */}
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className={plexSans.variable}>
        <header aria-label="Appearance" className="live-theme-header">
          <div className="live-theme-header-inner">
            <span className="live-theme-identity">OrderlyApp appearance</span>
            <ThemeToggle />
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
