import type { Metadata } from 'next';

import { AccountForm } from '../../../components/auth/AccountForm';
import { fr } from '../../../messages/fr';

const t = fr.auth.signIn;

export const metadata: Metadata = { title: `${t.title} — Learny` };

type SignInPageProps = {
  searchParams: Promise<{ erreur?: string | string[] }>;
};

/** EF-11 — expired or already-used links land on the sign-in screen with an explanatory alert. */
function errorFromQuery(value: string | string[] | undefined): string | undefined {
  const code = Array.isArray(value) ? value[0] : value;
  return code === 'lien-expire' || code === 'lien-invalide'
    ? fr.auth.errors.linkExpired
    : undefined;
}

// Sign-in step of SCR-01 (SPEC-601 EF-1, EF-4). `?connexion` of the mockup is this route.
export default async function SignInPage({ searchParams }: Readonly<SignInPageProps>) {
  const query = await searchParams;
  return <AccountForm initialError={errorFromQuery(query.erreur)} mode="login" />;
}
