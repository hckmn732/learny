import { createHmac, timingSafeEqual } from 'node:crypto';

import { ONBOARDING_STEP_VALUES, type OnboardingStep } from '@learny/contracts/me';

export const ONBOARDING_TICKET_COOKIE = 'learny_ob';
export const ONBOARDING_TICKET_TTL_MS = 60_000;

interface TicketPayload {
  u: string;
  s: OnboardingStep;
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

export function createOnboardingTicket(
  input: { userId: string; step: OnboardingStep; now: Date },
  key = secret(),
): string | null {
  if (key === null) return null;
  const encoded = Buffer.from(
    JSON.stringify({
      u: input.userId,
      s: input.step,
      t: input.now.getTime(),
    } satisfies TicketPayload),
    'utf8',
  ).toString('base64url');
  return `${encoded}.${signature(encoded, key)}`;
}

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
