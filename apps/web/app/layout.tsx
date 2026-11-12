import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { fr } from '../messages/fr';

import { fontVariables } from './fonts';
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
      <body className="bg-white font-sans text-[#111113]">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
