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
export {
  LEGAL_DOCUMENT_KEYS,
  LEGAL_IDENTITY_KEYS,
  LEGAL_PLACEHOLDER,
  LEGAL_VERSION_KEYS,
  LegalConfigError,
  activeLegalVersions,
  isCurrentVersion,
  legalConfig,
  parseLegalConfig,
} from './legal';
export type {
  LegalConfig,
  LegalDocumentKey,
  LegalIdentity,
  LegalIdentityKey,
  LegalVersionKey,
  LegalVersions,
} from './legal';
export { PUBLIC_ENV_KEYS, parsePublicEnv, publicEnvSchema } from './env-public';
export type { PublicEnv, PublicEnvKey } from './env-public';
export {
  ACCOUNT_RULES,
  AUTOMATION_DEFAULTS,
  AUTOMATION_KEYS,
  AUTOMATION_OPTIONS,
  FORMATION_RULES,
  GROUP_RULES,
  MEMORY_RULES,
  NOTIFICATION_DEFAULTS,
  NOTIFICATION_RULES,
  EMBEDDING_DIM,
  EXERCISE_DEFAULT_MIN,
  LEGAL_DOCUMENTS_VERSION,
  LEGAL_IDENTITY,
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
  AI_TASKS,
  BYOK_PROVIDERS,
  BYOK_RECOMMENDED_MODELS,
  THINKING_EFFORT_BY_TASK,
  WEB_SEARCH_TASKS,
  isAiTask,
} from './models';
export type { AiTask, ByokProvider, ThinkingEffort } from './models';
export {
  AGENDA_LEGEND_BASE_KINDS,
  AGENDA_LEGEND_EXTRA_KINDS,
  AGENDA_SLOT_KINDS,
  AGENDA_SLOT_STYLES,
  agendaLegendLabel,
  agendaSlotLabel,
  agendaSlotLabelOf,
  agendaSlotStyle,
  agendaSlotStyleOf,
} from './agenda';
export type { AgendaSlotKind as AgendaSlotKindConfig, AgendaSlotStyle } from './agenda';
