import type { Metadata } from 'next';

import { AccountForm } from '../../../components/auth/AccountForm';
import { fr } from '../../../messages/fr';

const t = fr.auth.signup;

export const metadata: Metadata = { title: `${t.title} — Learny` };

// Account step of SCR-01 (SPEC-601 EF-1, EF-3). The page is a thin Server Component; the form is
// the only client component and talks exclusively to `/api/v1/auth/*`.
export default function SignUpPage() {
  return <AccountForm mode="signup" />;
}
