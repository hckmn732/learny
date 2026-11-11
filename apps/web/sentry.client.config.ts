// Browser Sentry configuration (SPEC-010, ET-4).
// Only NEXT_PUBLIC_SENTRY_DSN is read, so no server secret reaches the bundle; the integration is
// inactive when the DSN is empty or the build is a test build.
import { initClientSentry } from './lib/sentry';

export function registerClientSentry(): Promise<boolean> {
  return initClientSentry({
    ...(process.env.NEXT_PUBLIC_SENTRY_DSN === undefined
      ? {}
      : { NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN }),
    NODE_ENV: process.env.NODE_ENV,
  });
}
