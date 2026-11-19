// Conditional Sentry integration of the web host (SPEC-010, EF-3, ET-4, CL-3, CL-4).
// The SDK is loaded lazily and only when its DSN is defined outside the test environment: an empty
// DSN initialises no client and triggers no network attempt.
import {
  buildSafeSentryEvent,
  sanitizeSentryEvent,
  type ErrorReporter,
  type SafeSentryEvent,
} from '@learny/core';

type Env = Readonly<Record<string, string | undefined>>;
type SentrySdk = typeof import('@sentry/nextjs');

let sdkPromise: Promise<SentrySdk> | undefined;
let serverInitialized = false;

function loadSdk(): Promise<SentrySdk> {
  sdkPromise ??= import('@sentry/nextjs');
  return sdkPromise;
}

function dsn(env: Env, key: 'SENTRY_DSN' | 'NEXT_PUBLIC_SENTRY_DSN'): string | undefined {
  const value = env[key]?.trim();
  return value === undefined || value === '' ? undefined : value;
}

/** Server integration: DSN defined and neither the runtime nor the application is in test. */
export function sentryServerEnabled(env: Env = process.env): boolean {
  return dsn(env, 'SENTRY_DSN') !== undefined && env.APP_ENV !== 'test' && env.NODE_ENV !== 'test';
}

/** Browser integration: only the public DSN, never enabled in a test build. */
export function sentryClientEnabled(env: Env = process.env): boolean {
  return dsn(env, 'NEXT_PUBLIC_SENTRY_DSN') !== undefined && env.NODE_ENV !== 'test';
}

function options(env: Env, key: 'SENTRY_DSN' | 'NEXT_PUBLIC_SENTRY_DSN') {
  return {
    dsn: dsn(env, key),
    environment: env.APP_ENV ?? env.NODE_ENV ?? 'development',
    sendDefaultPii: false,
    // No performance tracing in V1: errors only (ADR-0043).
    tracesSampleRate: 0,
    beforeSend: (event: unknown) => sanitizeSentryEvent(event) as unknown,
  };
}

/** Initialises the server SDK; returns whether it is active (CL-4). Never throws. */
export async function initServerSentry(env: Env = process.env): Promise<boolean> {
  if (!sentryServerEnabled(env)) return false;
  try {
    const Sentry = await loadSdk();
    Sentry.init(options(env, 'SENTRY_DSN') as Parameters<typeof Sentry.init>[0]);
    serverInitialized = true;
    return true;
  } catch {
    // A telemetry failure never prevents the application from serving requests (CL-3).
    return false;
  }
}

/** Initialises the browser SDK; returns whether it is active. Never throws. */
export async function initClientSentry(env: Env = process.env): Promise<boolean> {
  if (!sentryClientEnabled(env)) return false;
  try {
    const Sentry = await loadSdk();
    Sentry.init(options(env, 'NEXT_PUBLIC_SENTRY_DSN') as Parameters<typeof Sentry.init>[0]);
    return true;
  } catch {
    return false;
  }
}

/** Test hook: forget the initialisation state between two environments. */
export function resetSentryForTests(): void {
  serverInitialized = false;
}

/**
 * Reporter used by the API wrapper. `transport` replaces the SDK in tests: the event handed to it
 * is exactly the safe event that would be sent (CA-2, CA-3).
 */
export function createServerReporter(
  env: Env = process.env,
  transport?: (event: SafeSentryEvent) => void,
): ErrorReporter {
  const enabled = sentryServerEnabled(env);
  return {
    enabled,
    capture(error, context) {
      if (!enabled) return undefined;
      const event = buildSafeSentryEvent(error, context ?? {});
      if (transport !== undefined) {
        transport(event);
        return event;
      }
      // Without a successful init no SDK call is made: a missing DSN sends nothing (CL-4).
      if (serverInitialized) {
        void loadSdk().then((Sentry) => {
          Sentry.captureEvent(event as unknown as Parameters<typeof Sentry.captureEvent>[0]);
        });
      }
      return event;
    },
  };
}

let defaultReporter: ErrorReporter | undefined;

/** Process-wide reporter of the API wrapper (initialised lazily from the environment). */
export function getServerReporter(): ErrorReporter {
  defaultReporter ??= createServerReporter();
  return defaultReporter;
}

export { sanitizeSentryEvent };
export type { SafeSentryEvent };
