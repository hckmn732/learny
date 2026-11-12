import { UserPlus } from 'lucide-react';
import type { Metadata } from 'next';

import { Card, Link } from '@learny/ui';

import { fr } from '../../../messages/fr';

const t = fr.auth.signup;

export const metadata: Metadata = { title: `${t.title} — Learny` };

// Account step shell of SCR-01 (SPEC-308 EF-4). The full form and its mutations are delivered by
// SPEC-601; this page already uses the shared layout, title, labels and links.
export default function SignUpPage() {
  return (
    <div className="flex flex-col gap-24" data-testid="auth-page-signup">
      <div className="flex flex-col gap-6">
        <h1 className="m-0 font-display text-32 font-600 tracking-title">{t.title}</h1>
        <p className="m-0 text-15 text-ink-muted">{t.subtitle}</p>
      </div>
      <Card className="flex flex-col gap-16" data-testid="auth-card">
        <span
          aria-hidden="true"
          className="inline-flex size-64 items-center justify-center rounded-20 bg-lime-softer text-lime-ink-strong"
        >
          <UserPlus aria-hidden="true" size={28} strokeWidth={1.8} />
        </span>
        <p className="m-0 text-15 leading-1.55 text-ink-secondary">{t.body}</p>
      </Card>
      <p className="m-0 text-center text-14 text-ink-muted">
        {t.switchText}{' '}
        <Link href="/connexion" weight="bold">
          {t.switchCta}
        </Link>
      </p>
    </div>
  );
}
