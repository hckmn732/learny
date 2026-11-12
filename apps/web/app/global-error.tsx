'use client';

import { ErrorView } from '../components/system/error-view';
import { fontVariables } from '../lib/fonts';
import { fr } from '../messages/fr';
import './globals.css';

// Replaces the root layout when it fails: it brings its own html and body (App Router).
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="fr" className={fontVariables}>
      <body className="bg-canvas text-ink font-sans">
        <title>{fr.meta.title}</title>
        <ErrorView error={error} retry={retry} />
      </body>
    </html>
  );
}
