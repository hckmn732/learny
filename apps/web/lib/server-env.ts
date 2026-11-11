// Single adapter of apps/web to the server configuration (SPEC-009, ET-1, ET-6).
// This is the only file of the application allowed to import `@learny/config/server`
// (enforced by the ESLint boundary in eslint.config.mjs).
import {
  parsePublicEnv,
  parseServerEnv,
  type PublicEnv,
  type ServerEnv,
} from '@learny/config/server';

type Env = Readonly<Record<string, string | undefined>>;

let cached: ServerEnv | undefined;

/**
 * Validates the environment at server startup (called from instrumentation.ts). A production
 * environment that is incomplete throws before any request is served (EF-1, CA-2).
 */
export function assertServerEnv(env: Env = process.env): ServerEnv {
  cached = parseServerEnv(env);
  return cached;
}

/** Typed server configuration, validated once per process. */
export function getServerEnv(env: Env = process.env): ServerEnv {
  cached ??= parseServerEnv(env);
  return cached;
}

/** The six public values a browser may receive (EF-2). */
export function getPublicEnv(env: Env = process.env): PublicEnv {
  return parsePublicEnv(env);
}

/** Test helper: forget the memoised configuration between two environments. */
export function resetServerEnv(): void {
  cached = undefined;
}
