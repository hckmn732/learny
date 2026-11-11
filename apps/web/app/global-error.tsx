'use client';

import { ErrorView } from '../components/system/error-view';
import { fr } from '../messages/fr';

import { fontVariables } from './fonts';
import './globals.css';

// Replaces the root layout when it fails: it brings its own html and body (App Router).
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="fr" className={fontVariables}>
      <body className="bg-white font-sans text-[#111113]">
        <title>{fr.meta.title}</title>
        <ErrorView error={error} retry={retry} />
      </body>
    </html>
  );
}
