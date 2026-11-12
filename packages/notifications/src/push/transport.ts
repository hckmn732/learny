// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- ambient typing of the untyped ESM package, also loaded when apps/web compiles this file
/// <reference path="./web-push.d.ts" />
// Push transports (SPEC-205 EF-5, EF-6, ET-2, ET-3). The live transport wraps `web-push`
// (ADR-0055) with the VAPID keys read on the server; the mock transport simulates the push
// service deterministically from the endpoint itself, so tests and demonstrations never touch the
// network. The private key never leaves this module's caller (`@learny/config/server`).
import type { PushMode } from '@learny/config';
import { MOCK_PUSH_HOST, MOCK_PUSH_OUTCOMES, type MockPushOutcome } from '@learny/contracts';
import { AppError } from '@learny/core';

import { PUSH_PAYLOAD_MAX_BYTES } from './payload';

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushSendOptions {
  /** Seconds the push service may keep the message (RFC 8030 TTL header). */
  ttl: number;
  /** Replaces a pending message with the same topic (RFC 8030 §5.4). */
  topic?: string;
}

/**
 * Result of one call to the push service. `gone` is definitive (404 or 410: the subscription no
 * longer exists); `transient` covers every other failure, network errors included (null status).
 */
export type PushSendResult =
  | { ok: true; statusCode: number }
  | { ok: false; statusCode: number | null; reason: 'gone' | 'transient' };

export interface PushTransport {
  readonly mode: PushMode;
  send(target: PushTarget, payload: string, options: PushSendOptions): Promise<PushSendResult>;
}

export interface VapidDetails {
  subject: string;
  publicKey: string;
  privateKey: string;
}

/** Statuses whose meaning is « the subscription is gone for good » (ADR-0055). */
export const GONE_STATUSES: ReadonlySet<number> = new Set([404, 410]);

export function classifyPushStatus(statusCode: number): PushSendResult {
  if (statusCode >= 200 && statusCode < 300) return { ok: true, statusCode };
  if (GONE_STATUSES.has(statusCode)) return { ok: false, statusCode, reason: 'gone' };
  return { ok: false, statusCode, reason: 'transient' };
}

// ---------------------------------------------------------------------------------------------
// Mock transport (EF-6): outcome chosen by the last path segment of the endpoint.

export const MOCK_STATUS: Record<MockPushOutcome, number> = {
  success: 201,
  missing: 404,
  gone: 410,
  transient: 503,
};

/** One simulated call, kept in memory for the tests and the demonstration (never persisted). */
export interface MockPushRecord {
  at: string;
  host: string;
  outcome: MockPushOutcome;
  statusCode: number;
  ttl: number;
  topic: string | null;
  payloadBytes: number;
  payload: string;
}

/** The simulated outcome read from an endpoint; `success` for any other path (EF-6). */
export function mockOutcomeOf(endpoint: string): MockPushOutcome {
  let last = '';
  try {
    const segments = new URL(endpoint).pathname.split('/').filter((part) => part !== '');
    last = segments[segments.length - 1] ?? '';
  } catch {
    return 'success';
  }
  return (MOCK_PUSH_OUTCOMES as readonly string[]).includes(last)
    ? (last as MockPushOutcome)
    : 'success';
}

/** Endpoint of the mock push service for a given outcome; `scope` keeps endpoints distinct. */
export function mockPushEndpoint(scope: string, outcome: MockPushOutcome): string {
  return `https://${MOCK_PUSH_HOST}/${encodeURIComponent(scope)}/${outcome}`;
}

export class MockPushTransport implements PushTransport {
  readonly mode = 'mock' as const;
  private readonly outbox: MockPushRecord[] = [];

  constructor(private readonly now: () => Date) {}

  send(target: PushTarget, payload: string, options: PushSendOptions): Promise<PushSendResult> {
    assertPayloadSize(payload);
    const outcome = mockOutcomeOf(target.endpoint);
    const statusCode = MOCK_STATUS[outcome];
    let host = '';
    try {
      host = new URL(target.endpoint).hostname;
    } catch {
      host = '';
    }
    this.outbox.push({
      at: this.now().toISOString(),
      host,
      outcome,
      statusCode,
      ttl: options.ttl,
      topic: options.topic ?? null,
      payloadBytes: Buffer.byteLength(payload, 'utf8'),
      payload,
    });
    return Promise.resolve(classifyPushStatus(statusCode));
  }

  /** Copy of the simulated calls, oldest first. */
  records(): MockPushRecord[] {
    return this.outbox.map((record) => ({ ...record }));
  }

  reset(): void {
    this.outbox.length = 0;
  }
}

function assertPayloadSize(payload: string): void {
  if (Buffer.byteLength(payload, 'utf8') > PUSH_PAYLOAD_MAX_BYTES) {
    throw new AppError('VALIDATION_FAILED', 'Notification push trop volumineuse.');
  }
}

// ---------------------------------------------------------------------------------------------
// Live transport (ADR-0055): `web-push`, VAPID on the server, no redirection followed.

/** Socket timeout of one push request; the job retries transient failures (SPEC-203). */
export const PUSH_REQUEST_TIMEOUT_MS = 10_000;

export class WebPushTransport implements PushTransport {
  readonly mode = 'live' as const;

  constructor(private readonly vapid: VapidDetails) {}

  async send(
    target: PushTarget,
    payload: string,
    options: PushSendOptions,
  ): Promise<PushSendResult> {
    assertPayloadSize(payload);
    const webPush = await import('web-push');
    try {
      // `web-push` issues one `https.request` and never follows a redirection (ET-3); the
      // request carries the encrypted payload and the VAPID headers only.
      const response = await webPush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        payload,
        {
          vapidDetails: this.vapid,
          TTL: options.ttl,
          timeout: PUSH_REQUEST_TIMEOUT_MS,
          ...(options.topic === undefined ? {} : { topic: options.topic }),
        },
      );
      return classifyPushStatus(response.statusCode);
    } catch (error) {
      if (error instanceof webPush.WebPushError) return classifyPushStatus(error.statusCode);
      return { ok: false, statusCode: null, reason: 'transient' };
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Factory

export interface PushTransportConfig {
  mode: PushMode;
  vapid?: { [K in keyof VapidDetails]?: string | undefined } | undefined;
  /** `CI` of the process environment: a live push service is refused there (EF-6). */
  ci?: string | undefined;
  now?: () => Date;
}

/**
 * EF-6, CL-8 — builds the transport of the current configuration. `live` needs the three VAPID
 * values and is refused in CI; the failure happens before any send is attempted.
 */
export function createPushTransport(config: PushTransportConfig): PushTransport {
  if (config.mode === 'mock') {
    return new MockPushTransport(config.now ?? (() => new Date(0)));
  }
  if (config.ci !== undefined && config.ci !== '' && config.ci !== 'false' && config.ci !== '0') {
    throw new AppError('SERVICE_UNAVAILABLE', 'PUSH_MODE=live est refusé en intégration continue.');
  }
  const { subject, publicKey, privateKey } = config.vapid ?? {};
  if (!subject || !publicKey || !privateKey) {
    throw new AppError(
      'SERVICE_UNAVAILABLE',
      'Le canal push n’est pas configuré (clés VAPID absentes).',
    );
  }
  return new WebPushTransport({ subject, publicKey, privateKey });
}
