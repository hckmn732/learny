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

export function sentryServerEnabled(env: Env = process.env): boolean {
  return dsn(env, 'SENTRY_DSN') !== undefined && env.APP_ENV !== 'test' && env.NODE_ENV !== 'test';
}

export function sentryClientEnabled(env: Env = process.env): boolean {
  return dsn(env, 'NEXT_PUBLIC_SENTRY_DSN') !== undefined && env.NODE_ENV !== 'test';
}

function options(env: Env, key: 'SENTRY_DSN' | 'NEXT_PUBLIC_SENTRY_DSN') {
  return {
    dsn: dsn(env, key),
    environment: env.APP_ENV ?? env.NODE_ENV ?? 'development',
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend: (event: unknown) => sanitizeSentryEvent(event) as unknown,
  };
}

export async function initServerSentry(env: Env = process.env): Promise<boolean> {
  if (!sentryServerEnabled(env)) return false;
  try {
    const Sentry = await loadSdk();
    Sentry.init(options(env, 'SENTRY_DSN') as Parameters<typeof Sentry.init>[0]);
    serverInitialized = true;
    return true;
  } catch {
    return false;
  }
}

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

export function resetSentryForTests(): void {
  serverInitialized = false;
}

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
export function getServerReporter(): ErrorReporter {
  defaultReporter ??= createServerReporter();
  return defaultReporter;
}

export { sanitizeSentryEvent };
export type { SafeSentryEvent };
