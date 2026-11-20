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

function dsn(env: Env): string | undefined {
  const value = env.SENTRY_DSN?.trim();
  return value === undefined || value === '' ? undefined : value;
}

export function sentryEnabled(env: Env = process.env): boolean {
  return dsn(env) !== undefined && env.APP_ENV !== 'test' && env.NODE_ENV !== 'test';
}

export async function initApiSentry(env: Env = process.env): Promise<boolean> {
  if (!sentryEnabled(env)) return false;
  try {
    sdkPromise ??= import('@sentry/node');
    const Sentry = await sdkPromise;
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

export function createApiReporter(
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
        void sdkPromise?.then((Sentry) => {
          Sentry.captureEvent(event as unknown as Parameters<typeof Sentry.captureEvent>[0]);
        });
      }
      return event;
    },
  };
}
