import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { fr } from '@learny/i18n/fr/meta';
import { colors } from '@learny/ui/tokens';

import { fontVariables } from '../lib/fonts';

import 'katex/dist/katex.min.css';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: fr.meta.title,
  description: fr.meta.description,
  applicationName: fr.meta.title,
  // SPEC-801 EF-1 — iOS home-screen icon and browser theme colour.
  icons: { apple: '/icons/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  themeColor: colors.ink,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="fr" className={fontVariables}>
      <head>
        {process.env.CLOCK_FIXED_AT === undefined ? null : (
          <meta name="learny-clock-fixed-at" content={process.env.CLOCK_FIXED_AT} />
        )}
      </head>
      <body className="bg-canvas text-ink font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
