// Stripe event shape used by the application, and the webhook signature scheme (SPEC-210 EF-4,
// ET-2). The real gateway verifies with the SDK; the simulated one verifies with `verifySignature`,
// which implements the same documented scheme: `t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.body">`.
import { createHmac, timingSafeEqual } from 'node:crypto';

import { AppError } from '@learny/core';

import { WEBHOOK_TOLERANCE_SECONDS } from './config';

/** The part of a Stripe event the application reads (everything else is ignored). */
export interface StripeEvent {
  id: string;
  type: string;
  /** Unix seconds, as Stripe sends it. */
  created: number;
  /** `metadata.userId` of the event object, when it carries one. */
  userId: string | null;
  customerId: string | null;
  subscriptionId: string | null;
}

/** Types the service applies (EF-4); every other type is acknowledged and ignored. */
export const HANDLED_EVENT_TYPES = [
  'checkout.session.completed',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_failed',
] as const;

export function isHandledEventType(type: string): boolean {
  return (HANDLED_EVENT_TYPES as readonly string[]).includes(type);
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string | null {
  if (typeof value === 'string' && value !== '') return value;
  // An expanded object carries its identifier.
  const id = asRecord(value).id;
  return typeof id === 'string' && id !== '' ? id : null;
}

function metadataUserId(object: Record<string, unknown>): string | null {
  const direct = asRecord(object.metadata).userId;
  if (typeof direct === 'string' && direct !== '') return direct;
  const details = asRecord(asRecord(object.subscription_details).metadata).userId;
  return typeof details === 'string' && details !== '' ? details : null;
}

/** Reads the fields the service needs from a raw (already authenticated) Stripe event. */
export function normalizeStripeEvent(raw: unknown): StripeEvent {
  const event = asRecord(raw);
  const object = asRecord(asRecord(event.data).object);
  const id = typeof event.id === 'string' ? event.id : '';
  const type = typeof event.type === 'string' ? event.type : '';
  const created = typeof event.created === 'number' ? event.created : Number.NaN;
  if (id === '' || type === '' || !Number.isFinite(created)) {
    throw new AppError('INVALID_SIGNATURE', 'Événement Stripe illisible.');
  }
  const isSubscription = type.startsWith('customer.subscription.');
  return {
    id,
    type,
    created,
    userId: metadataUserId(object) ?? asString(object.client_reference_id),
    customerId: asString(object.customer),
    subscriptionId: isSubscription ? asString(object.id) : asString(object.subscription),
  };
}

export function signaturePayload(timestamp: number, payload: string): string {
  return `${String(timestamp)}.${payload}`;
}

/** `t=…,v1=…` header for `payload` signed at `at` (simulated gateway and tests). */
export function signPayload(payload: string, webhookSecret: string, at: Date): string {
  const timestamp = Math.floor(at.getTime() / 1000);
  const digest = createHmac('sha256', webhookSecret)
    .update(signaturePayload(timestamp, payload))
    .digest('hex');
  return `t=${String(timestamp)},v1=${digest}`;
}

/**
 * Verifies a `Stripe-Signature` header (CL-3). Throws `INVALID_SIGNATURE` when the header is
 * missing or malformed, no `v1` signature matches, or the timestamp is older than the tolerance.
 */
export function verifySignature(
  payload: string,
  header: string | null,
  webhookSecret: string,
  now: Date,
  toleranceSeconds = WEBHOOK_TOLERANCE_SECONDS,
): void {
  const invalid = (detail: string): AppError => new AppError('INVALID_SIGNATURE', detail);
  if (header === null || header.trim() === '') throw invalid('Signature du webhook absente.');
  let timestamp = Number.NaN;
  const candidates: string[] = [];
  for (const part of header.split(',')) {
    const [key, value] = part.split('=', 2);
    if (key?.trim() === 't' && value !== undefined) timestamp = Number(value);
    if (key?.trim() === 'v1' && value !== undefined) candidates.push(value.trim());
  }
  if (!Number.isInteger(timestamp) || candidates.length === 0) {
    throw invalid('Signature du webhook illisible.');
  }
  const expected = createHmac('sha256', webhookSecret)
    .update(signaturePayload(timestamp, payload))
    .digest();
  const matches = candidates.some((candidate) => {
    const bytes = Buffer.from(candidate, 'hex');
    return bytes.length === expected.length && timingSafeEqual(bytes, expected);
  });
  if (!matches) throw invalid('Signature du webhook invalide.');
  if (Math.floor(now.getTime() / 1000) - timestamp > toleranceSeconds) {
    throw invalid('Signature du webhook expirée.');
  }
}
