import type { Metadata } from 'next';

import { VerifyEmailCard } from '../../../components/auth/VerifyEmailCard';
import { fr } from '../../../messages/fr';

const t = fr.auth.verify;

export const metadata: Metadata = { title: `${t.title} — Learny` };

// Verification step of SCR-01 (SPEC-601 EF-8). It reads the pending address from sessionStorage,
// so the page itself stays free of personal data and of database access.
export default function VerifyEmailPage() {
  return <VerifyEmailCard />;
}
