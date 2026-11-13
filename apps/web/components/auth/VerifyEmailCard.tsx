'use client';

import { ChevronLeft, Mail } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useSyncExternalStore } from 'react';

import { AppError, clock } from '@learny/core';
import { Button, Card } from '@learny/ui';

import { api } from '../../lib/api-client';
import {
  pendingAuthSnapshot,
  saveAuthDraft,
  savePendingAuth,
  subscribePendingAuth,
} from '../../lib/auth/pending-auth';
import { useClock } from '../../lib/auth/use-clock';
import { fr } from '../../messages/fr';

const t = fr.auth;

const RESEND_SECONDS = 60;

function remainingSeconds(sentAt: string | null, now: Date | null): number {
  if (sentAt === null) return 0;
  const sent = Date.parse(sentAt);
  if (Number.isNaN(sent)) return 0;
  if (now === null) return RESEND_SECONDS;
  const remaining = Math.ceil((sent + RESEND_SECONDS * 1000 - now.getTime()) / 1000);
  return Math.min(RESEND_SECONDS, Math.max(0, remaining));
}

/**
 * Verification step of SCR-01 (SPEC-601 EF-8 to EF-10, CL-2, CL-3). The address never enters the
 * URL: it is read from `sessionStorage`, and the resend countdown restarts from `sentAt` after a
 * reload. The clock is the injected one (ADR-0047).
 */
export function VerifyEmailCard() {
  const router = useRouter();
  const now = useClock();
  const pending = useSyncExternalStore(subscribePendingAuth, pendingAuthSnapshot, () => null);
  const [sentAt, setSentAt] = useState<string | null>(null);
  const [statusOverride, setStatusOverride] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const email = pending?.email ?? t.verify.unknownAddress;
  const method = pending?.method ?? 'magic';
  const effectiveSentAt = sentAt ?? pending?.sentAt ?? null;
  const remaining = remainingSeconds(effectiveSentAt, now);
  const waiting = effectiveSentAt !== null && (now === null || remaining > 0);
  const status =
    statusOverride ??
    (pending?.notice === 'confirmation_resent' ? t.errors.confirmationResent : null);

  const back = (): void => {
    if (pending !== null) saveAuthDraft({ email: pending.email, method: pending.method });
    router.push(pending?.intent === 'login' ? '/connexion' : '/inscription');
  };

  const confirm = async (): Promise<void> => {
    if (confirming) return;
    setConfirming(true);
    setError(null);
    try {
      const me = await api.meGet({});
      router.push(me.onboardingStep === 'done' ? '/accueil' : `/premiers-pas/${me.onboardingStep}`);
      router.refresh();
    } catch (cause) {
      if (cause instanceof AppError && cause.code === 'NETWORK_ERROR') {
        setError(t.errors.network);
      } else {
        // EF-10 — the link was opened in another browser: the message explains what to do.
        setStatusOverride(t.errors.linkNotOpened);
      }
    } finally {
      setConfirming(false);
    }
  };

  const resend = async (): Promise<void> => {
    if (pending === null || sending || waiting) return;
    setSending(true);
    setError(null);
    setStatusOverride(null);
    try {
      await api.authResend({
        body: {
          email: pending.email,
          kind: pending.method === 'password' ? 'signup' : 'magic_link',
        },
      });
      const sent = clock.now().toISOString();
      setSentAt(sent);
      setStatusOverride(t.verify.resent);
      savePendingAuth({ ...pending, sentAt: sent });
    } catch (cause) {
      if (
        cause instanceof AppError &&
        (cause.code === 'RATE_LIMITED' || cause.code === 'RESEND_TOO_SOON')
      ) {
        const seconds = Math.min(
          RESEND_SECONDS,
          Math.max(1, cause.retryAfterSec ?? RESEND_SECONDS),
        );
        setError(t.errors.resendWait(seconds));
        // Restart the countdown at the delay announced by the server.
        const sent = new Date(
          clock.now().getTime() - (RESEND_SECONDS - seconds) * 1000,
        ).toISOString();
        setSentAt(sent);
      } else {
        setError(t.errors.network);
      }
    } finally {
      setSending(false);
    }
  };

  const resendLabel = waiting ? t.verify.resendCountdown(remaining) : t.verify.resend;
  const text = method === 'password' ? t.verify.passwordText(email) : t.verify.magicText(email);

  return (
    <div className="flex flex-col gap-24" data-testid="auth-page-verify">
      <Button
        className="self-start"
        data-testid="auth-back"
        leadingIcon={ChevronLeft}
        onClick={back}
        size="sm"
        variant="ghost"
      >
        {t.verify.back}
      </Button>

      <Card
        className="flex flex-col items-center gap-18 p-32 text-center"
        data-testid="verify-card"
        padding="none"
      >
        <span
          aria-hidden="true"
          className="inline-flex size-64 items-center justify-center rounded-20 bg-lime-softer text-lime-ink-strong"
        >
          <Mail aria-hidden="true" size={28} strokeWidth={1.8} />
        </span>
        <h1 className="m-0 font-display text-28 font-600 tracking-heading">{t.verify.title}</h1>
        <p className="m-0 text-15 leading-1.55 text-ink-secondary">{text}</p>
        <Button
          data-testid="verify-confirm"
          loading={confirming}
          onClick={() => {
            void confirm();
          }}
          size="lg"
          variant="dark"
        >
          {t.verify.confirm}
        </Button>
        <p className="m-0 text-13 text-ink-muted">
          {t.verify.resendBefore}
          <button
            className="inline cursor-pointer border-0 bg-transparent p-0 font-700 text-indigo-ink underline underline-offset-2 disabled:cursor-not-allowed disabled:text-ink-muted disabled:no-underline"
            data-testid="verify-resend"
            disabled={pending === null || waiting || sending}
            onClick={() => {
              void resend();
            }}
            type="button"
          >
            {resendLabel}
          </button>
          {t.verify.resendAfter}
        </p>
        {status !== null ? (
          <p
            className="m-0 text-13 font-600 text-green-ink"
            data-testid="verify-status"
            role="status"
          >
            {status}
          </p>
        ) : null}
        {error !== null ? (
          <p
            className="m-0 rounded-12 bg-orange-soft px-12 py-10 text-13 font-600 text-orange-ink"
            data-testid="auth-error"
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </Card>
    </div>
  );
}
