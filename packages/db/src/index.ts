// Public API of @learny/db (SPEC-101 ET-1).
export {
  DATABASE_HINT,
  DEFAULT_DATABASE_URL,
  annotateConnectionError,
  buildUserClaims,
  closeDb,
  createPostgresDatabase,
  serviceDb,
  userDb,
} from './client';
export type {
  DatabaseHandle,
  DatabaseOptions,
  Db,
  DbTx,
  UserContext,
  UserDatabase,
} from './client';

// Compatibility alias named by the package contract; `userDb` is the canonical entry point.
export { userDb as createUserDb } from './client';

export { sql } from 'drizzle-orm';

export * as schema from './schema/index';
