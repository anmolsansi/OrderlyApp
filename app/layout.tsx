import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

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
      <body>{children}</body>
    </html>
  );
}
