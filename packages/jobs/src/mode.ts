// Execution mode of the jobs (SPEC-203 EF-6, ADR-0122): real Inngest, or in-process (tests).
import { parseServerEnv } from '@learny/config/server';

export type JobsMode = 'inngest' | 'inline';

type Env = Readonly<Record<string, string | undefined>>;

let cache: { key: string; mode: JobsMode } | undefined;

/**
 * Resolves `JOBS_MODE` through the validated configuration (default `inline` in the `test`
 * environment, `inngest` elsewhere). `inline` is refused in production: the configuration fails
 * at startup, and this guard refuses it again at emission time (defence in depth).
 */
export function resolveJobsMode(env: Env = process.env): JobsMode {
  const key = `${env.APP_ENV ?? ''}|${env.JOBS_MODE ?? ''}|${env.NODE_ENV ?? ''}`;
  if (cache?.key === key) return cache.mode;
  const mode: JobsMode = parseServerEnv(env).JOBS_MODE === 'inline' ? 'inline' : 'inngest';
  if (mode === 'inline' && env.APP_ENV === 'production') {
    throw new Error('JOBS_MODE=inline est interdit en production.');
  }
  cache = { key, mode };
  return mode;
}
