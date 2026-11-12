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

// Six tables of the brick/activity/attempt domain and their enumerations (SPEC-106 EF-6). They are
// also reachable as `schema.*`; the named exports give services their Drizzle types directly.
export {
  ACTIVITY_KINDS,
  ACTIVITY_STATUSES,
  ATTEMPT_STATUSES,
  BRICK_PURPOSES,
  BRICK_STATUSES,
  BRICK_TYPES,
  GRADERS,
  REPORT_STATUSES,
  activities,
  activityKind,
  activityStatus,
  answers,
  attemptStatus,
  attempts,
  brickPurpose,
  brickReports,
  brickStatus,
  brickType,
  brickVersions,
  bricks,
  grader,
  reportStatus,
} from './schema/bricks-activities';
export type {
  Activity,
  ActivityKind,
  ActivityStatus,
  Answer,
  Attempt,
  AttemptStatus,
  Brick,
  BrickPurpose,
  BrickReport,
  BrickStatus,
  BrickType,
  BrickVersion,
  Grader,
  NewActivity,
  NewAnswer,
  NewAttempt,
  NewBrick,
  NewBrickReport,
  NewBrickVersion,
  ReportStatus,
} from './schema/bricks-activities';

// Repositories validated at the boundary of the database (SPEC-106 ET-4, ET-5).
export * from './repositories/activities';
