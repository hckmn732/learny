import NextLink from 'next/link';

import { Card } from '@learny/ui';

import { InvitationJoin } from '../../../components/group/InvitationJoin';
import { loadInvitationPage } from '../../../lib/group-page';
import { fr } from '../../../messages/fr';

export const dynamic = 'force-dynamic';

interface InvitationPageProps {
  params: Promise<{ code: string }>;
}

const t = fr.group.invitePage;

/**
 * SCR-17 — public `/invitation/[code]` (SPEC-724 EF-2, BR-GRP-02). The page reveals only the
 * formation title and the capacity; an unknown or rotated code keeps a neutral message and never
 * exposes the private group.
 */
export default async function InvitationPage({ params }: InvitationPageProps) {
  const { code } = await params;
  const state = await loadInvitationPage(code);

  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-[640px] flex-col justify-center px-16 py-40"
      data-testid="invitation-page"
    >
      <NextLink
        className="mb-24 self-start font-display text-22 font-600 no-underline text-ink"
        href="/"
      >
        Learny
      </NextLink>
      <Card className="rounded-24 border border-solid border-border bg-surface p-32">
        {state.kind === 'ok' ? (
          <InvitationJoin
            code={state.preview.code}
            preview={state.preview}
            signedIn={state.signedIn}
          />
        ) : state.kind === 'invalid' ? (
          <div className="flex flex-col gap-8" data-testid="group-invitation-invalid" role="status">
            <p className="m-0 text-14 text-ink-muted">{t.eyebrow}</p>
            <h1 className="m-0 font-display text-28 font-600 tracking-heading">{t.errorTitle}</h1>
            <p className="m-0 text-15 leading-1.55 text-ink-muted">{t.errorText}</p>
            <NextLink className="mt-8 text-14 font-600 text-ink underline" href="/accueil">
              {t.backHome}
            </NextLink>
          </div>
        ) : (
          <div
            className="flex flex-col gap-8"
            data-testid="group-invitation-not-found"
            role="status"
          >
            <p className="m-0 text-14 text-ink-muted">{t.eyebrow}</p>
            <h1 className="m-0 font-display text-28 font-600 tracking-heading">
              {t.notFoundTitle}
            </h1>
            <p className="m-0 text-15 leading-1.55 text-ink-muted">{t.notFoundText}</p>
            <NextLink className="mt-8 text-14 font-600 text-ink underline" href="/accueil">
              {t.backHome}
            </NextLink>
          </div>
        )}
      </Card>
    </main>
  );
}
