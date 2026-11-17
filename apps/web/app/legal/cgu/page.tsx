import type { Metadata } from 'next';

import { LegalPage } from '../../../components/legal/LegalPage';
import { fr } from '../../../messages/fr';

const t = fr.legal.documents.cgu;

export const metadata: Metadata = { title: `${t.title} — Learny`, description: t.description };

/** SCR-19 — public CGU page, reachable without a session (BR-PLA-06). */
export default function CguPage() {
  return <LegalPage document="cgu" />;
}
