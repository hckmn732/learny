'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { api } from '@learny/api-client';
import type { TutorTone } from '@learny/contracts';
import { AppError } from '@learny/core';
import { fr } from '@learny/i18n/fr/onboarding';
import { Button, Card, FormError, TextField } from '@learny/ui';

import { formatFirstNames } from './formatFirstNames';
import { parseInviteCode } from './parseInviteCode';
import { StepHeading } from './StepHeading';

const t = fr.onboarding.depart;

export interface DepartureStepProps {
  firstName: string;
  tutorTone: TutorTone;
}

/** SPEC-602 EF-11 to EF-14 — departure, invitation and end of onboarding. */
export function DepartureStep({ firstName, tutorTone }: Readonly<DepartureStepProps>) {
  const router = useRouter();
  const [invite, setInvite] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteStatus, setInviteStatus] = useState<{ title: string; names: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const markDone = async (): Promise<void> => {
    await api.meOnboardingUpdate({ body: { step: 'done' } });
  };

  const finish = async (destination: string): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setSaveError(null);
    try {
      await markDone();
      router.push(destination);
      router.refresh();
    } catch {
      setSaveError(fr.onboarding.common.saveError);
      setBusy(false);
    }
  };

  const join = async (): Promise<void> => {
    if (busy) return;
    setInviteError(null);
    setInviteStatus(null);
    setSaveError(null);
    const code = parseInviteCode(invite);
    if (invite.trim() === '') {
      setInviteError(t.inviteEmpty);
      return;
    }
    if (code === null) {
      setInviteError(t.inviteInvalid);
      return;
    }
    setBusy(true);
    try {
      // The dedicated route call carries the Idempotency-Key the contract requires
      // (`invitationAccept.idempotent === true`); a plain `apiFetch` never sets it.
      const accepted = await api.invitationAccept({ params: { code } });
      await markDone();
      setInviteStatus({
        title: accepted.formationTitle,
        names: formatFirstNames(accepted.memberFirstNames),
      });
    } catch (cause) {
      if (cause instanceof AppError) {
        if (cause.status === 404) setInviteError(t.inviteNotFound);
        else if (cause.code === 'GROUP_FULL' || cause.status === 409) setInviteError(t.inviteFull);
        else if (cause.code === 'FORMATION_LIMIT_REACHED' || cause.status === 422)
          setInviteError(t.inviteFormationLimit);
        else setSaveError(fr.onboarding.common.saveError);
      } else {
        setSaveError(fr.onboarding.common.saveError);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-24" data-testid="onboarding-step-depart">
      <StepHeading
        subtitle={tutorTone === 'tu' ? t.subtitleTu : t.subtitleVous}
        title={t.welcome(firstName)}
      />

      <button
        className="flex items-center gap-16 rounded-24 bg-ink px-24 py-22 text-left text-white"
        data-testid="departure-create"
        onClick={() => {
          void finish('/formations/nouvelle');
        }}
        type="button"
      >
        <span
          aria-hidden="true"
          className="inline-flex size-48 shrink-0 items-center justify-center rounded-14 bg-lime text-26 font-600 text-ink"
        >
          +
        </span>
        <span className="flex flex-col gap-4">
          <span className="text-17 font-700">{t.createTitle}</span>
          <span className="text-13 text-on-dark-secondary">{t.createDescription}</span>
        </span>
      </button>

      <Card className="flex flex-col gap-12" padding="md">
        <span className="text-15 font-700">{t.inviteTitle}</span>
        <p className="m-0 text-13 text-ink-muted">{t.inviteDescription}</p>
        <div className="flex flex-wrap gap-8">
          <TextField
            className="flex-[1_1_13.75rem]"
            data-testid="invite-input"
            hideLabel
            label={t.invitePlaceholder}
            onChange={(event) => {
              setInvite(event.target.value);
              setInviteError(null);
            }}
            placeholder={t.invitePlaceholder}
            value={invite}
          />
          <Button
            className="bg-lime text-ink hover:brightness-95"
            data-testid="invite-join"
            disabled={busy}
            onClick={() => {
              void join();
            }}
            size="md"
            type="button"
            variant="dark"
          >
            {t.inviteJoin}
          </Button>
        </div>
        {inviteError === null ? null : (
          <p
            className="m-0 text-13 font-600 text-orange-ink"
            data-testid="invite-error"
            role="alert"
          >
            {inviteError}
          </p>
        )}
        {inviteStatus === null ? null : (
          <p
            className="m-0 rounded-12 bg-green-soft px-12 py-10 text-13 font-600 text-green-ink"
            data-testid="invite-status"
            role="status"
          >
            {t.inviteAccepted(inviteStatus.title, inviteStatus.names)}{' '}
            <Link
              className="text-green-ink underline"
              href="/accueil"
              onClick={() => {
                void markDone();
              }}
            >
              {t.inviteOpenHome}
            </Link>
          </p>
        )}
      </Card>

      {saveError === null ? null : <FormError>{saveError}</FormError>}

      <Link
        className="touch-target self-center text-14 font-600 text-indigo-ink"
        data-testid="departure-home"
        href="/accueil"
        onClick={(event) => {
          event.preventDefault();
          void finish('/accueil');
        }}
      >
        {t.home}
      </Link>
    </section>
  );
}
