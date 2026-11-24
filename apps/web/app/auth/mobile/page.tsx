import type { Metadata } from 'next';

import { fr } from '@learny/i18n';

const t = fr.mobile.auth.bridge;

export const metadata: Metadata = { title: `${t.title} — Learny` };

interface AuthMobilePageProps {
  searchParams: Promise<{ code?: string | string[] }>;
}

/** Deep link of the callback of the application (ADR-3008 § 4). */
const CALLBACK = 'learny://auth/callback';

/**
 * SPEC-3101 EF-8 — minimum static page that hands a magic link back to the application.
 *
 * Supabase sends the link of the e-mails to `/auth/mobile`; when the platform does not open the
 * application by itself, this page shows the brand, « Ouverture de l'application… » and a button
 * that opens the same code through the `learny` scheme. It modifies no other page of the web
 * application and needs no session (ADR-3008 § 4).
 */
export default async function AuthMobilePage({ searchParams }: AuthMobilePageProps) {
  const params = await searchParams;
  const raw = params.code;
  const code = Array.isArray(raw) ? raw[0] : raw;
  const target =
    code === undefined || code === '' ? CALLBACK : `${CALLBACK}?code=${encodeURIComponent(code)}`;

  return (
    <main>
      <p>{t.eyebrow}</p>
      <h1>{t.title}</h1>
      <p>{t.body}</p>
      <p>
        <a href={target}>{t.open}</a>
      </p>
    </main>
  );
}
