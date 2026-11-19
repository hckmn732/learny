import type { Metadata } from 'next';

import { fr } from '@learny/i18n';

import { LegalPage } from '../../../components/legal/LegalPage';

const t = fr.legal.documents.confidentialite;

export const metadata: Metadata = { title: `${t.title} — Learny`, description: t.description };

/** SCR-19 — public privacy policy page, reachable without a session (BR-PLA-06). */
export default function ConfidentialitePage() {
  return <LegalPage document="confidentialite" />;
}
