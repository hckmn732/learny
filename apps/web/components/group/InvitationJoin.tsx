'use client';

import { Check, UsersRound } from 'lucide-react';
import NextLink from 'next/link';
import { useState } from 'react';

import type { InvitationPreview } from '@learny/contracts';
import { AppError } from '@learny/core';
import { Button, FormError } from '@learny/ui';

import { api } from '../../lib/api-client';
import { fr } from '../../messages/fr';
import { formatFirstNames } from '../onboarding/formatFirstNames';

const t = fr.group.invitePage;

interface Accepted {
  formationId: string;
  formationTitle: string;
  memberFirstNames: string[];
}

/** EF-2 — join by code from the public invitation page (BR-GRP-02). */
export function InvitationJoin({
  code,
  preview,
  signedIn,
}: Readonly<{ code: string; preview: InvitationPreview; signedIn: boolean }>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<Accepted | null>(null);

  const join = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.invitationAccept({ params: { code } });
      setAccepted(result);
    } catch (cause) {
      if (cause instanceof AppError) {
        if (cause.status === 404) setError(t.notFoundText);
        else if (cause.code === 'GROUP_FULL' || cause.code === 'CONFLICT') setError(t.fullText);
        else if (
          cause.code === 'FORMATION_LIMIT_REACHED' ||
          (cause.code === 'VALIDATION_FAILED' && cause.status === 422)
        )
          setError(t.limitText);
        else setError(t.joinError);
      } else setError(t.joinError);
    } finally {
      setBusy(false);
    }
  };

  if (accepted !== null) {
    return (
      <div className="flex flex-col items-center gap-12 text-center" data-testid="group-joined">
        <span
          aria-hidden="true"
          className="inline-flex size-56 items-center justify-center rounded-full bg-lime text-ink"
        >
          <Check aria-hidden="true" size={26} strokeWidth={2.4} />
        </span>
        <h2 className="m-0 font-display text-22 font-600 tracking-heading">{t.acceptedTitle}</h2>
        <p className="m-0 max-w-[460px] text-15 leading-1.55 text-ink-muted">
          {t.acceptedText(accepted.formationTitle, formatFirstNames(accepted.memberFirstNames))}
        </p>
        <Button asChild size="lg" variant="dark">
          <NextLink href={`/formations/${encodeURIComponent(accepted.formationId)}/programme`}>
            {t.openFormation}
          </NextLink>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-16">
      <div className="flex flex-col gap-6">
        <span className="inline-flex items-center gap-6 text-13 font-600 text-ink-muted">
          <UsersRound aria-hidden="true" size={15} strokeWidth={2} />
          {t.capacity(preview.memberCount, preview.maxMembers)}
        </span>
        <h1 className="m-0 font-display text-34 font-600 tracking-title">
          {preview.formationTitle}
        </h1>
        <p className="m-0 text-14 leading-1.55 text-ink-muted">{t.privacy}</p>
      </div>

      {preview.full ? (
        <p
          className="m-0 rounded-12 bg-orange-soft px-12 py-10 text-13 font-600 text-orange-ink"
          data-testid="group-full"
          role="status"
        >
          {t.fullText}
        </p>
      ) : null}

      {error === null ? null : (
        <FormError data-testid="group-join-error" role="alert">
          {error}
        </FormError>
      )}

      {signedIn ? (
        <Button
          data-testid="group-join"
          disabled={preview.full}
          loading={busy}
          onClick={() => void join()}
          size="xl"
          type="button"
          variant="lime"
        >
          {busy ? t.joining : t.join}
        </Button>
      ) : (
        <div className="flex flex-col gap-8">
          <p className="m-0 text-13 leading-1.5 text-ink-muted">{t.signedOutHint}</p>
          <Button asChild data-testid="group-join" size="xl" variant="lime">
            <NextLink href={`/connexion?suite=${encodeURIComponent(`/invitation/${code}`)}`}>
              {t.signIn}
            </NextLink>
          </Button>
        </div>
      )}
    </div>
  );
}
