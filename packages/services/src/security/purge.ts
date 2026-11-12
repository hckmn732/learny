// The purge lives in `@learny/db` (shared with the hourly job of `@learny/jobs`, SPEC-208 EF-7).
export { SECURITY_RETENTION_MS, purgeSecurityRows, type SecurityPurgeResult } from '@learny/db';
