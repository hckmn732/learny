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
export {
  ACCOUNT_RULES,
  AI_RULES,
  AUTOMATION_DEFAULTS,
  AUTOMATION_KEYS,
  AUTOMATION_OPTIONS,
  FORMATION_RULES,
  GROUP_RULES,
  MEMORY_RULES,
  NOTIFICATION_DEFAULTS,
  NOTIFICATION_RULES,
  EMBEDDING_DIM,
  LEGAL_DOCUMENTS_VERSION,
  LEGAL_VERSIONS,
  QUIZ_RULES,
  RESOURCE_LIMITS,
  RESOURCE_RULES,
  STUDY_DEFAULTS,
} from './product';
export type {
  AccountRules,
  AutomationDefaults,
  AutomationKey,
  FormationRules,
  GroupRules,
  MemoryRules,
  NotificationDefaults,
  NotificationRules,
  QuizRules,
  ResourceRules,
  StudyDefaults,
} from './product';
export {
  AI_MODEL_IDS,
  AI_TASKS,
  DEFAULT_MODEL_BY_TASK,
  THINKING_EFFORT_BY_TASK,
  WEB_SEARCH_TASKS,
  isAiTask,
  isProvidedModel,
} from './models';
export type { AiModelId, AiTask, ThinkingEffort } from './models';
export {
  BATCH_DISCOUNT_RATIO,
  CACHE_READ_RATIO,
  CACHE_WRITE_RATIO,
  MODEL_PRICING,
  PRICE_UNIT,
  modelPrices,
} from './pricing';
export type { ModelPrices } from './pricing';
