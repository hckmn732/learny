// Owner-role SQL client and integration harness of the backend test suites
// (`@learny/testing/db`, formerly `@learny/db` and `@learny/db/testing`).
//
// The Python API now owns every runtime query: this module only serves the integration and
// end-to-end suites of `apps/web`, which need a service-role connection to seed and inspect rows.
import { sql } from 'drizzle-orm';

export * from './client';
export * from './harness';

// `sql` is re-exported so callers keep one import for the client and its template tag.
export { sql };
