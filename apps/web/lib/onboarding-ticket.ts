// Signed onboarding step ticket (SPEC-602 ET-3, ADR-0160).
//
// The proxy may trust the step for 60 seconds without reading `profiles`: the cookie carries the
// user, the step and the issue instant, signed with the application encryption secret. A forged or
// expired ticket is ignored. `PATCH /me/onboarding` expires it explicitly, so a step change is
// visible on the very next navigation.
import { createHmac, timingSafeEqual } from 'node:crypto';

import { ONBOARDING_STEP_VALUES, type OnboardingStep } from '@learny/contracts';

export const ONBOARDING_TICKET_COOKIE = 'learny_ob';
export const ONBOARDING_TICKET_TTL_MS = 60_000;

interface TicketPayload {
  /** User identifier. */
  u: string;
  /** Onboarding step. */
  s: OnboardingStep;
  /** Issue instant, Unix milliseconds. */
  t: number;
}

export interface OnboardingTicket {
  userId: string;
  step: OnboardingStep;
  issuedAt: number;
}

function secret(): string | null {
  const value = process.env.APP_ENCRYPTION_KEY;
  return value === undefined || value.trim() === '' ? null : value;
}

function signature(payload: string, key: string): string {
  return createHmac('sha256', key).update(payload).digest('base64url');
}

function isStep(value: unknown): value is OnboardingStep {
  return typeof value === 'string' && (ONBOARDING_STEP_VALUES as readonly string[]).includes(value);
}

/** Creates the cookie value; `null` when the application has no encryption secret. */
export function createOnboardingTicket(
  input: { userId: string; step: OnboardingStep; now: Date },
  key = secret(),
): string | null {
  if (key === null) return null;
  const payload: TicketPayload = {
    u: input.userId,
    s: input.step,
    t: input.now.getTime(),
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${encoded}.${signature(encoded, key)}`;
}

/**
 * Verifies a ticket for `userId` at `now`. Returns `null` for a missing, malformed, expired or
 * foreign ticket: the caller then reads the profile, which stays the source of truth.
 */
export function readOnboardingTicket(
  value: string | undefined,
  input: { userId: string; now: Date },
  key = secret(),
): OnboardingTicket | null {
  if (key === null || value === undefined) return null;
  const [encoded = '', provided = ''] = value.split('.');
  if (encoded === '' || provided === '') return null;
  const expected = signature(encoded, key);
  const providedBytes = Buffer.from(provided, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  if (
    providedBytes.length !== expectedBytes.length ||
    !timingSafeEqual(providedBytes, expectedBytes)
  ) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as unknown;
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object') return null;
  const payload = parsed as Partial<TicketPayload>;
  if (
    typeof payload.u !== 'string' ||
    payload.u !== input.userId ||
    !isStep(payload.s) ||
    typeof payload.t !== 'number' ||
    !Number.isFinite(payload.t)
  ) {
    return null;
  }
  const age = input.now.getTime() - payload.t;
  if (age < 0 || age > ONBOARDING_TICKET_TTL_MS) return null;
  return { userId: payload.u, step: payload.s, issuedAt: payload.t };
}
