import type { Metadata } from 'next';

import { LegalPage } from '../../../components/legal/LegalPage';
import { fr } from '../../../messages/fr';

const t = fr.legal.documents.mentions;

export const metadata: Metadata = { title: `${t.title} — Learny`, description: t.description };

/** SCR-19 — public legal notice page, reachable without a session (BR-PLA-06). */
export default function MentionsPage() {
  return <LegalPage document="mentions" />;
}
