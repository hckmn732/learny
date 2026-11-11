// Conditional Sentry integration of the self-hosted worker (SPEC-010, EF-3/EF-4, ET-4).
// The Node SDK is loaded lazily and only when SENTRY_DSN is defined outside the test environment.
import {
  buildSafeSentryEvent,
  sanitizeSentryEvent,
  type ErrorReporter,
  type SafeSentryEvent,
} from '@learny/core';

type Env = Readonly<Record<string, string | undefined>>;
type SentrySdk = typeof import('@sentry/node');

let sdkPromise: Promise<SentrySdk> | undefined;
let initialized = false;

function loadSdk(): Promise<SentrySdk> {
  sdkPromise ??= import('@sentry/node');
  return sdkPromise;
}

function dsn(env: Env): string | undefined {
  const value = env.SENTRY_DSN?.trim();
  return value === undefined || value === '' ? undefined : value;
}

export function sentryEnabled(env: Env = process.env): boolean {
  return dsn(env) !== undefined && env.APP_ENV !== 'test' && env.NODE_ENV !== 'test';
}

/** Initialises the Node SDK; returns whether it is active. Never throws (CL-3, CL-4). */
export async function initWorkerSentry(env: Env = process.env): Promise<boolean> {
  if (!sentryEnabled(env)) return false;
  try {
    const Sentry = await loadSdk();
    Sentry.init({
      dsn: dsn(env),
      environment: env.APP_ENV ?? env.NODE_ENV ?? 'development',
      sendDefaultPii: false,
      tracesSampleRate: 0,
      beforeSend: (event: unknown) => sanitizeSentryEvent(event) as unknown,
    } as Parameters<typeof Sentry.init>[0]);
    initialized = true;
    return true;
  } catch {
    return false;
  }
}

/** Test hook: forget the initialisation state between two environments. */
export function resetWorkerSentryForTests(): void {
  initialized = false;
}

/** Reporter injected into the job registry; a fake transport can capture events in tests. */
export function createWorkerReporter(
  env: Env = process.env,
  transport?: (event: SafeSentryEvent) => void,
): ErrorReporter {
  const enabled = sentryEnabled(env);
  return {
    enabled,
    capture(error, context) {
      if (!enabled) return undefined;
      const event = buildSafeSentryEvent(error, context ?? {});
      if (transport !== undefined) {
        transport(event);
        return event;
      }
      if (initialized) {
        void loadSdk().then((Sentry) => {
          Sentry.captureEvent(event as unknown as Parameters<typeof Sentry.captureEvent>[0]);
        });
      }
      return event;
    },
  };
}
