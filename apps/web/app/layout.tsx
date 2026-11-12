import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { fontVariables } from '../lib/fonts';
import { fr } from '../messages/fr';

import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: fr.meta.title,
  description: fr.meta.description,
  applicationName: fr.meta.title,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="fr" className={fontVariables}>
      <body className="bg-canvas text-ink font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
