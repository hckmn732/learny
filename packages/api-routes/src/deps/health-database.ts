// Database probe of the health route (SPEC-006 EF-2, SPEC-010 EF-5, SPEC-012 CL-2), wired at
// startup by instrumentation.ts now that the SPEC-101 client exists. Server-only: client
// components keep importing lib/health.ts, which never loads the database package.
import { pingDatabase } from '@learny/db';

import { setDatabaseQuery } from './health';

/**
 * Registers the `select 1` probe when a database connection is explicitly configured. Without
 * `DATABASE_URL` the route keeps answering `not_configured` rather than probing a local default.
 * Returns whether the probe is registered.
 */
export function registerDatabaseHealth(
  env: { readonly DATABASE_URL?: string | undefined },
  ping: () => Promise<void> = pingDatabase,
): boolean {
  const configured = env.DATABASE_URL !== undefined;
  setDatabaseQuery(configured ? () => ping() : null);
  return configured;
}
