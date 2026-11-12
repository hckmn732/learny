'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ApiError, api } from '../../lib/api-client';
import { fr } from '../../messages/fr';
import { BaseCard } from '../sdd/base-tokens';

const t = fr.sdd.spec202;

const buttonClass =
  'rounded-[12px] bg-ink px-4 py-2 text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2';
const inputClass = 'mb-3 mt-1 w-full rounded-[12px] border border-solid border-border px-3 py-2';

function timezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

/** Seconds announced by a RESEND_TOO_SOON answer (« … dans 37 secondes. »). */
function secondsFrom(error: ApiError): number {
  const match = /dans (\d+) secondes/.exec(error.detail);
  return match?.[1] === undefined ? 60 : Number(match[1]);
}

function messageOf(error: unknown): string {
  if (error instanceof ApiError) {
    return error.errors?.[0]?.message === undefined
      ? error.detail
      : `${error.detail} ${error.errors[0].message}`;
  }
  return String(error);
}

interface Result {
  text: string;
  tone: 'ok' | 'error';
}

function useCountdown(): [number, (seconds: number) => void] {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (remaining <= 0) return undefined;
    const timer = setTimeout(() => {
      setRemaining((value) => value - 1);
    }, 1000);
    return () => {
      clearTimeout(timer);
    };
  }, [remaining]);
  return [remaining, setRemaining];
}

function ResultLine({
  testId,
  result,
  countdown,
}: {
  testId: string;
  result: Result | null;
  countdown: number;
}) {
  const text = countdown > 0 ? t.resendIn(countdown) : result?.text;
  return (
    <p
      role="status"
      aria-live="polite"
      data-testid={testId}
      className={`mt-3 min-h-6 text-sm ${result?.tone === 'error' ? 'text-danger' : ''}`}
    >
      {text}
    </p>
  );
}

export function MagicLinkCard() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [countdown, setCountdown] = useCountdown();

  async function send(mode: 'sign-up' | 'sign-in') {
    setBusy(true);
    setResult(null);
    try {
      const zone = timezone();
      await api.authMagicLink({
        body:
          mode === 'sign-up'
            ? {
                mode,
                email,
                acceptedTerms: true,
                ...(zone === undefined ? {} : { timezone: zone }),
              }
            : { mode, email },
      });
      setResult({ text: t.magic.sent, tone: 'ok' });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'RESEND_TOO_SOON') {
        setCountdown(secondsFrom(error));
      }
      setResult({ text: messageOf(error), tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <BaseCard testId="auth-magic" title={t.magic.title}>
      <p className="mb-3 text-sm">{t.magic.intro}</p>
      <label htmlFor="auth-email" className="block text-sm font-semibold">
        {t.magic.emailLabel}
      </label>
      <input
        id="auth-email"
        data-testid="auth-email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(event) => {
          setEmail(event.target.value);
        }}
        className={inputClass}
      />
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className={buttonClass}
          disabled={busy || email === ''}
          onClick={() => void send('sign-up')}
        >
          {t.magic.signUp}
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={busy || email === ''}
          onClick={() => void send('sign-in')}
        >
          {t.magic.signIn}
        </button>
      </div>
      <ResultLine testId="auth-result" result={result} countdown={countdown} />
    </BaseCard>
  );
}

export function PasswordCard() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function signUp() {
    setBusy(true);
    setResult(null);
    try {
      const zone = timezone();
      await api.authSignUp({
        body: {
          email,
          password,
          acceptedTerms: true,
          ...(zone === undefined ? {} : { timezone: zone }),
        },
      });
      setResult({ text: t.password.created, tone: 'ok' });
    } catch (error) {
      setResult({ text: messageOf(error), tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function signIn() {
    setBusy(true);
    setResult(null);
    try {
      const { destination } = await api.authSignIn({ body: { email, password } });
      setResult({ text: t.password.signedIn(destination), tone: 'ok' });
      router.refresh();
    } catch (error) {
      setResult({ text: messageOf(error), tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <BaseCard testId="auth-password" title={t.password.title}>
      <p className="mb-3 text-sm">{t.password.intro}</p>
      <label htmlFor="auth-password-email" className="block text-sm font-semibold">
        {t.password.emailLabel}
      </label>
      <input
        id="auth-password-email"
        data-testid="auth-password-email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(event) => {
          setEmail(event.target.value);
        }}
        className={inputClass}
      />
      <label htmlFor="auth-password-value" className="block text-sm font-semibold">
        {t.password.passwordLabel}
      </label>
      <input
        id="auth-password-value"
        data-testid="auth-password-value"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(event) => {
          setPassword(event.target.value);
        }}
        className={inputClass}
      />
      <p className="mb-3 text-xs">{t.password.terms}</p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className={buttonClass}
          disabled={busy || email === ''}
          onClick={() => void signUp()}
        >
          {t.password.signUp}
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={busy || email === ''}
          onClick={() => void signIn()}
        >
          {t.password.signIn}
        </button>
      </div>
      <ResultLine testId="auth-password-result" result={result} countdown={0} />
    </BaseCard>
  );
}

export function SignOutCard() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function signOut() {
    setBusy(true);
    try {
      await api.authSignOut({});
      setResult({ text: t.signOut.done, tone: 'ok' });
      router.refresh();
    } catch (error) {
      setResult({ text: messageOf(error), tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <BaseCard testId="auth-sign-out-card" title={t.signOut.action}>
      <button
        type="button"
        data-testid="auth-sign-out"
        className={buttonClass}
        disabled={busy}
        onClick={() => void signOut()}
      >
        {t.signOut.action}
      </button>
      <ResultLine testId="auth-sign-out-result" result={result} countdown={0} />
    </BaseCard>
  );
}
