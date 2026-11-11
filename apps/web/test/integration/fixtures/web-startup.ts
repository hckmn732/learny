// Started in its own process by config-startup.test.ts: runs the real web startup validation
// (SPEC-009, EF-1). Only the application environment is printed, never a value.
import { assertServerEnv } from '../../../lib/server-env';

const env = assertServerEnv();
console.info(`web:${env.APP_ENV}`);
