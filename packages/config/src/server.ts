// Server entry point of @learny/config (`@learny/config/server`).
// Everything here may read or describe a secret: a client component must never import this module
// (SPEC-009, ET-6). The ESLint boundary of apps/web only allows it from `lib/server-env.ts`.
export {
  DOCUMENTED_ENV_KEYS,
  PRODUCTION_REQUIRED_KEYS,
  RUNTIME_ENV_KEYS,
  SERVER_ENV_KEYS,
  STANDARD_ENV_KEYS,
  TOOLING_ENV_KEYS,
  envDefaults,
  parseServerEnv,
  serverEnvSchema,
} from './env';
export type { ServerEnv, ServerEnvKey } from './env';
export { PUBLIC_ENV_KEYS, parsePublicEnv, publicEnvSchema } from './env-public';
export type { PublicEnv, PublicEnvKey } from './env-public';
export {
  APP_ENVS,
  EMAIL_MODES,
  EnvConfigError,
  LLM_MODES,
  PUSH_MODES,
  STRIPE_MODES,
} from './env-shared';
export type {
  AppEnv,
  EmailMode,
  EnvInput,
  EnvIssue,
  EnvIssueCode,
  LlmMode,
  PushMode,
  StripeMode,
} from './env-shared';
