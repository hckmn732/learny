// Server Sentry configuration of the web host (SPEC-010, ET-4).
// Loaded by instrumentation.ts after the environment validation; inactive without SENTRY_DSN.
import { initServerSentry } from './lib/sentry';

export function registerServerSentry(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<boolean> {
  return initServerSentry(env);
}
