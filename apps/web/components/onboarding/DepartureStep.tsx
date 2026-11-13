'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { z } from 'zod';

import type { TutorTone } from '@learny/contracts';
import { AppError } from '@learny/core';
import { Button, Card, FormError, Link as UiLink, TextField } from '@learny/ui';

import { api, apiFetch } from '../../lib/api-client';
import { fr } from '../../messages/fr';

import { formatFirstNames } from './formatFirstNames';
import { parseInviteCode } from './parseInviteCode';
import { StepHeading } from './StepHeading';

const t = fr.onboarding.depart;

const InvitationAccepted = z.object({
  formationId: z.string().min(1),
  formationTitle: z.string().min(1),
  memberFirstNames: z.array(z.string()),
});

export interface DepartureStepProps {
  firstName: string;
  tutorTone: TutorTone;
  payment: 'ok' | 'annule' | undefined;
}

/** SPEC-602 EF-11 to EF-14 — departure, invitation, payment return and end of onboarding. */
export function DepartureStep({ firstName, tutorTone, payment }: Readonly<DepartureStepProps>) {
  const router = useRouter();
  const [invite, setInvite] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteStatus, setInviteStatus] = useState<{ title: string; names: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [billing, setBilling] = useState<string | null>(payment === 'ok' ? t.paymentPending : null);
  const [activated, setActivated] = useState(false);

  useEffect(() => {
    if (payment !== 'ok') return;
    let cancelled = false;
    let tries = 0;
    const check = async (): Promise<void> => {
      try {
        const subscription = await api.billingSubscription({});
        if (!cancelled && subscription.status === 'active') {
          setActivated(true);
          setBilling(t.paymentActivated);
        }
      } catch {
        // CL-7 — a late webhook is not an error: the polling stops after 30 seconds.
      }
    };
    void check();
    const timer = setInterval(() => {
      tries += 1;
      if (tries >= 10) {
        clearInterval(timer);
        return;
      }
      void check();
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [payment]);

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
      const accepted = await apiFetch({
        method: 'POST',
        path: `/invitations/${code}/accept`,
        output: InvitationAccepted,
      });
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

  const resumePayment = async (): Promise<void> => {
    setSaveError(null);
    try {
      const { url } = await api.billingCheckout({
        body: {
          successPath: '/premiers-pas/depart?abonnement=ok',
          cancelPath: '/premiers-pas/depart?abonnement=annule',
        },
      });
      window.location.assign(url);
    } catch {
      setSaveError(fr.onboarding.common.saveError);
    }
  };

  return (
    <section className="flex flex-col gap-24" data-testid="onboarding-step-depart">
      <StepHeading
        subtitle={tutorTone === 'tu' ? t.subtitleTu : t.subtitleVous}
        title={t.welcome(firstName)}
      />
      {payment === 'ok' ? (
        <p
          className={
            activated
              ? 'm-0 rounded-12 bg-green-soft px-12 py-10 text-13 font-600 text-green-ink'
              : 'm-0 rounded-12 bg-canvas px-12 py-10 text-13 font-600 text-ink-muted'
          }
          data-testid="billing-status"
          role="status"
        >
          {billing ?? t.paymentPending}
        </p>
      ) : null}
      {payment === 'annule' ? (
        <div className="flex flex-col gap-10" data-testid="billing-status">
          <FormError>{t.paymentCancelled}</FormError>
          <div className="flex flex-wrap items-center gap-12">
            <Button
              onClick={() => {
                void resumePayment();
              }}
              size="md"
              type="button"
              variant="outline"
            >
              {t.resumePayment}
            </Button>
            <UiLink href="/premiers-pas/ia">{t.useOwnKey}</UiLink>
          </div>
        </div>
      ) : null}

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
        className="self-center text-14 font-600 text-indigo-ink"
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
