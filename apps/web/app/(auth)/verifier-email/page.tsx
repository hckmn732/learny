import { Mail } from 'lucide-react';
import type { Metadata } from 'next';

import { Button, Card, Link } from '@learny/ui';

import { fr } from '../../../messages/fr';

const t = fr.auth.verify;

export const metadata: Metadata = { title: `${t.title} — Learny` };

// Verification step shell of SCR-01 (SPEC-308 EF-4). SPEC-601 wires the resend countdown and the
// real session check; the layout, heading, text and action are already shared.
export default function VerifyEmailPage() {
  return (
    <div className="flex flex-col gap-24" data-testid="auth-page-verify">
      <Card className="flex flex-col items-center gap-18 text-center" data-testid="auth-card">
        <span
          aria-hidden="true"
          className="inline-flex size-64 items-center justify-center rounded-20 bg-lime-softer text-lime-ink-strong"
        >
          <Mail aria-hidden="true" size={28} strokeWidth={1.8} />
        </span>
        <h1 className="m-0 font-display text-28 font-600 tracking-heading">{t.title}</h1>
        <p className="m-0 max-w-[30rem] text-15 leading-1.55 text-ink-secondary">{t.body}</p>
        <Button asChild size="lg" variant="dark">
          <Link href="/premiers-pas/profil">{t.confirm}</Link>
        </Button>
        <Link href="/connexion" variant="subtle" weight="semibold">
          {t.back}
        </Link>
      </Card>
    </div>
  );
}
