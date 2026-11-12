// Execution contexts of the push channel (SPEC-205). They are structural views of the service
// contexts of `@learny/services` (SPEC-201 ET-6): a user request carries the Row Level Security
// client of the learner, a system call (job, demonstration) carries the owner-role client. The
// package declares them itself so that `@learny/services` can depend on it, never the reverse.
import type { Clock, LearnyLogger } from '@learny/core';
import type { Db, UserDatabase } from '@learny/db';

export interface PushUserContext {
  userId: string | null;
  requestId: string;
  db: UserDatabase | null;
  clock: Clock;
  logger: LearnyLogger;
}

export interface PushSystemContext {
  requestId: string;
  sdb: Db;
  clock: Clock;
  logger: LearnyLogger;
}
