// Safe entry point of @learny/config: public environment, product constants and tooling rules.
// Server values live behind `@learny/config/server` (SPEC-009, ET-6).
export { EU_REGIONS, HOSTING_REGIONS, isEuRegion } from './platform';
export type { HostingService } from './platform';
export {
  COMMIT_SCOPE_PATTERN,
  COMMIT_TYPES,
  HEADER_MAX,
  MERGE_SUBJECT_MAX,
  SUBJECT_MAX,
  commitlintPlugin,
  commitlintRules,
} from './commit-rules';
export type { CommitType, ParsedCommit } from './commit-rules';
export {
  SECRET_ALLOW_MARKER,
  SECRET_PATTERNS,
  isForbiddenSecretFile,
  maskSecret,
  scanText,
} from './secret-patterns';
export type { Finding, SecretPattern } from './secret-patterns';
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
export { PUBLIC_ENV_KEYS, parsePublicEnv, publicEnvSchema } from './env-public';
export type { PublicEnv, PublicEnvKey } from './env-public';
