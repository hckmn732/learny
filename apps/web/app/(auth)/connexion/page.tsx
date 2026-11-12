import { LogIn } from 'lucide-react';
import type { Metadata } from 'next';

import { Card, Link } from '@learny/ui';

import { fr } from '../../../messages/fr';

const t = fr.auth.signIn;

export const metadata: Metadata = { title: `${t.title} — Learny` };

// Sign-in step shell of SCR-01 (SPEC-308 EF-4). SPEC-601 adds the two methods and their calls.
export default function SignInPage() {
  return (
    <div className="flex flex-col gap-24" data-testid="auth-page-signin">
      <div className="flex flex-col gap-6">
        <h1 className="m-0 font-display text-32 font-600 tracking-title">{t.title}</h1>
        <p className="m-0 text-15 text-ink-muted">{t.subtitle}</p>
      </div>
      <Card className="flex flex-col gap-16" data-testid="auth-card">
        <span
          aria-hidden="true"
          className="inline-flex size-64 items-center justify-center rounded-20 bg-indigo-soft text-indigo-ink"
        >
          <LogIn aria-hidden="true" size={28} strokeWidth={1.8} />
        </span>
        <p className="m-0 text-15 leading-1.55 text-ink-secondary">{t.body}</p>
      </Card>
      <p className="m-0 text-center text-14 text-ink-muted">
        {t.switchText}{' '}
        <Link href="/inscription" weight="bold">
          {t.switchCta}
        </Link>
      </p>
    </div>
  );
}
