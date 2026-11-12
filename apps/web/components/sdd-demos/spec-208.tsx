'use client';

import { useState } from 'react';

import { RATE_PROFILE_NAMES, RATE_PROFILES, type RateProfileName } from '@learny/contracts';

import { ApiError, api } from '../../lib/api-client';
import { fr } from '../../messages/fr';
import { BaseCard, BaseTokenStyle } from '../sdd/base-tokens';

const t = fr.sdd.spec208;

const buttonClass =
  'rounded-[12px] bg-ink px-4 py-2 text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2';

function messageOf(error: unknown): string {
  return error instanceof ApiError ? `${error.code} : ${error.detail}` : String(error);
}

function ProfileCard({ profile }: { profile: RateProfileName }) {
  const spec = RATE_PROFILES[profile];
  const [remaining, setRemaining] = useState<number>(spec.capacity);
  const [result, setResult] = useState<string>('');
  const [busy, setBusy] = useState(false);

  async function burst() {
    setBusy(true);
    try {
      const output = await api.devRateLimitBurst({ body: { profile } });
      setRemaining(output.remaining);
      setResult(t.profiles.result(output.accepted, output.refused, output.retryAfterSeconds));
    } catch (error) {
      setResult(messageOf(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article
      data-testid={`spec-208-profile-${profile}`}
      className="rounded-[16px] border border-solid border-border p-4"
    >
      <h3 className="font-display text-lg font-semibold">{t.profiles.names[profile]}</h3>
      <ul className="mt-2 space-y-1 text-sm">
        <li>{t.profiles.capacity(spec.capacity)}</li>
        <li>{t.profiles.refill(spec.secondsPerToken)}</li>
        <li>{t.profiles.key[spec.key]}</li>
        <li>
          {t.profiles.remaining} :{' '}
          <strong data-testid={`spec-208-remaining-${profile}`}>{remaining}</strong>
        </li>
      </ul>
      <button
        type="button"
        className={`${buttonClass} mt-3`}
        disabled={busy}
        onClick={() => void burst()}
      >
        {t.profiles.burst}
      </button>
      <p
        role="status"
        aria-live="polite"
        aria-busy={busy}
        data-testid={`spec-208-burst-${profile}`}
        className="mt-3 min-h-6 text-sm"
      >
        {busy ? t.loading : result}
      </p>
    </article>
  );
}

function OriginCard() {
  const [result, setResult] = useState<string>('');
  const [busy, setBusy] = useState(false);

  async function send(mode: 'same' | 'foreign') {
    setBusy(true);
    try {
      const output = await api.devRateLimitOrigin({ body: { mode } });
      setResult(
        output.code === null
          ? t.origin.accepted(output.status)
          : t.origin.refused(output.status, output.code, output.detail ?? ''),
      );
    } catch (error) {
      setResult(messageOf(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <BaseCard testId="spec-208-origin" title={t.origin.title}>
      <p className="mb-3 text-sm">{t.origin.intro}</p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className={buttonClass}
          disabled={busy}
          onClick={() => void send('same')}
        >
          {t.origin.same}
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={busy}
          onClick={() => void send('foreign')}
        >
          {t.origin.foreign}
        </button>
      </div>
      <p
        role="status"
        aria-live="polite"
        data-testid="spec-208-origin-result"
        className="mt-3 min-h-6 text-sm"
      >
        {result}
      </p>
    </BaseCard>
  );
}

function PurgeCard() {
  const [counts, setCounts] = useState<{ keys: number; buckets: number } | null>(null);
  const [error, setError] = useState<string>('');
  const [busy, setBusy] = useState(false);

  async function purge() {
    setBusy(true);
    setError('');
    try {
      const output = await api.devRateLimitPurge({});
      setCounts({ keys: output.idempotencyKeys, buckets: output.rateLimitBuckets });
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <BaseCard testId="spec-208-purge" title={t.purge.title}>
      <p className="mb-3 text-sm">{t.purge.intro}</p>
      <button type="button" className={buttonClass} disabled={busy} onClick={() => void purge()}>
        {t.purge.action}
      </button>
      <div role="status" aria-live="polite" aria-busy={busy} className="mt-3 text-sm">
        {error !== '' ? <p>{error}</p> : null}
        {counts === null ? (
          <p>{t.purge.none}</p>
        ) : (
          <ul className="space-y-1">
            <li>
              {t.purge.keys} : <strong data-testid="spec-208-purge-keys">{counts.keys}</strong>
            </li>
            <li>
              {t.purge.buckets} :{' '}
              <strong data-testid="spec-208-purge-buckets">{counts.buckets}</strong>
            </li>
          </ul>
        )}
      </div>
    </BaseCard>
  );
}

export default function Spec208Demo() {
  return (
    <>
      <BaseTokenStyle />
      <BaseCard testId="spec-208-profiles" title={t.profiles.title}>
        <p className="mb-4 text-sm">{t.profiles.intro}</p>
        <div className="grid gap-4 md:grid-cols-3">
          {RATE_PROFILE_NAMES.map((profile) => (
            <ProfileCard key={profile} profile={profile} />
          ))}
        </div>
      </BaseCard>
      <OriginCard />
      <PurgeCard />
    </>
  );
}
