// Context handed to the handlers of the jobs (SPEC-203 ET-4). It has the shape of the services
// `SystemContext`: owner-role database client (no RLS), clock and logger. It is built here and not
// imported from `@learny/services` because services emit events through this package.
import { clock, type Clock, type LearnyLogger } from '@learny/core';
import { logger as rootLogger } from '@learny/core/server';
import { serviceDb, type Db, type UserDatabase } from '@learny/db';

export interface JobContext {
  userId: string | null;
  requestId: string;
  db: UserDatabase | null;
  clock: Clock;
  logger: LearnyLogger;
  /** Owner-role client: bypasses Row Level Security, explicit job usages only. */
  sdb: Db;
}

export function createJobContext(options: {
  requestId: string;
  logger?: LearnyLogger;
  clock?: Clock;
}): JobContext {
  return {
    userId: null,
    requestId: options.requestId,
    db: null,
    clock: options.clock ?? clock,
    logger: options.logger ?? rootLogger,
    sdb: serviceDb(),
  };
}
