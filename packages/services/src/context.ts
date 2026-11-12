// Execution context of a service call (SPEC-201 ET-6).
import { clock as systemClock, type Clock, type LearnyLogger } from '@learny/core';
import { logger as rootLogger } from '@learny/core/server';
import { serviceDb, userDb, type Db, type UserDatabase } from '@learny/db';

export interface ServiceContext {
  userId: string | null;
  requestId: string;
  /** Row Level Security client of the user; `null` for a public request. */
  db: UserDatabase | null;
  clock: Clock;
  logger: LearnyLogger;
}

export interface CreateServiceContextOptions {
  userId: string | null;
  email?: string | null;
  requestId: string;
  logger?: LearnyLogger;
  clock?: Clock;
}

export function createServiceContext(options: CreateServiceContextOptions): ServiceContext {
  const email = options.email ?? undefined;
  return {
    userId: options.userId,
    requestId: options.requestId,
    db:
      options.userId === null
        ? null
        : userDb(
            email === undefined ? { userId: options.userId } : { userId: options.userId, email },
          ),
    clock: options.clock ?? systemClock,
    logger: options.logger ?? rootLogger,
  };
}

export type SystemContext = ServiceContext & { sdb: Db };

/** Context of a job or a webhook: the owner-role client bypasses RLS (explicit usages only). */
export function createSystemContext(options: {
  requestId: string;
  logger?: LearnyLogger;
  clock?: Clock;
}): SystemContext {
  return {
    userId: null,
    requestId: options.requestId,
    db: null,
    clock: options.clock ?? systemClock,
    logger: options.logger ?? rootLogger,
    sdb: serviceDb(),
  };
}
