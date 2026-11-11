// Deterministic data of the SPEC-010 demonstration (ADR-0049). Everything is computed in memory:
// no real secret, no Sentry event and no external probe is involved.
import type { HealthResponse } from '@learny/contracts';
import { AppError, clock, type Clock } from '@learny/core';
import {
  createLogCapture,
  createLogger,
  requestContext,
  resolveRequestId,
  runWithRequestContext,
} from '@learny/core/server';

import { problemDetails, type ProblemDetails } from './api/handler';
import { getHealth, probeDatabase } from './health';

/** Safe, bounded identifier reused by the four sections of the page. */
export const DEMO_REQUEST_ID = resolveRequestId('req-spec010-demo');
export const DEMO_USER_ID = 'user-spec010-demo';
/** Clearly fictitious values; only their redacted form may reach the page. */
export const DEMO_EMAIL = 'demo-spec010@example.test';
export const DEMO_API_KEY = 'sk-demo-spec010-not-a-secret'; // learny-test-only
export const DEMO_APPORT = 'apport-demo-spec010-not-real';

export interface ObservabilityDemo {
  requestId: string;
  userId: string;
  log: string;
  logRecord: Record<string, unknown>;
  error: ProblemDetails;
  errorJson: string;
  health: HealthResponse;
  demoProbes: {
    ok: 'ok' | 'unavailable' | 'not_configured';
    unavailable: 'ok' | 'unavailable' | 'not_configured';
    notConfigured: 'ok' | 'unavailable' | 'not_configured';
  };
}

export async function buildObservabilityDemo(now: Clock = clock): Promise<ObservabilityDemo> {
  const capture = createLogCapture();
  runWithRequestContext(requestContext(DEMO_REQUEST_ID, DEMO_USER_ID), () => {
    const logger = createLogger({
      route: '/api/v1/demo',
      spec: 'SPEC-010',
      clock: now,
      destination: capture.destination,
    });
    // The fictitious address and key are scrubbed before serialisation: the page proves it.
    logger.warn(`requête de ${DEMO_EMAIL} avec la clé ${DEMO_API_KEY}`, {
      method: 'POST',
      route: '/api/v1/demo',
      status: 400,
      code: 'VALIDATION_FAILED',
      durationMs: 12,
    });
    // A nested payload is dropped by the allow-list, never serialised (CL-2).
    logger.error('apport refusé', {
      code: 'VALIDATION_FAILED',
      status: 422,
      apport: DEMO_APPORT,
    } as unknown as Parameters<typeof logger.error>[1]);
  });

  const records = capture.records();
  const logRecord = records[0] ?? {};
  const error = problemDetails(
    new AppError('VALIDATION_FAILED', 'Un champ est invalide.', { status: 400 }),
    DEMO_REQUEST_ID,
  );
  const health = await getHealth({
    query: () => Promise.resolve([{ ok: 1 }]),
    env: { APP_VERSION: '0.0.0-demo', GIT_COMMIT: 'abcdef1' },
    timeoutMs: 100,
  });
  const [unavailable, notConfigured] = await Promise.all([
    probeDatabase(() => Promise.reject(new Error('sonde de démonstration en panne')), 100),
    probeDatabase(null, 100),
  ]);

  return {
    requestId: DEMO_REQUEST_ID,
    userId: DEMO_USER_ID,
    log: JSON.stringify(logRecord, null, 2),
    logRecord,
    error,
    errorJson: JSON.stringify(error, null, 2),
    health: health.body,
    demoProbes: {
      ok: await probeDatabase(() => Promise.resolve(1), 100),
      unavailable,
      notConfigured,
    },
  };
}
