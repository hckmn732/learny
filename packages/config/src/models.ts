// Model identifiers and task routing of the provided AI (BR-IA-01, docs/architecture/ai.md §1).
// Centralised here: no component, service or job writes a model identifier by hand (SPEC-009, EF-6).
// Pricing lives in pricing.ts (ADR-0073, ADR-0228).

/** AI tasks of the product, in the order of docs/architecture/ai.md §1. */
export const AI_TASKS = ['programme', 'course', 'gaps', 'tutor', 'light'] as const;

export type AiTask = (typeof AI_TASKS)[number];

/** Provided models: identifiers are data, never an environment secret. */
export const AI_MODEL_IDS = {
  opus: 'claude-opus-5-5',
  sonnet: 'claude-sonnet-5-5',
  haiku: 'claude-haiku-5-5',
} as const;

export type AiModelId = (typeof AI_MODEL_IDS)[keyof typeof AI_MODEL_IDS];

/** BR-IA-01 — default provided model per task. */
export const DEFAULT_MODEL_BY_TASK = {
  programme: AI_MODEL_IDS.opus,
  course: AI_MODEL_IDS.opus,
  gaps: AI_MODEL_IDS.opus,
  tutor: AI_MODEL_IDS.sonnet,
  light: AI_MODEL_IDS.haiku,
} as const satisfies Record<AiTask, AiModelId>;

/** Adaptive thinking effort per task (docs/architecture/ai.md §1). */
export const THINKING_EFFORT_BY_TASK = {
  programme: 'high',
  course: 'medium',
  gaps: 'medium',
  tutor: 'low',
  light: 'none',
} as const satisfies Record<AiTask, 'high' | 'medium' | 'low' | 'none'>;

export type ThinkingEffort = (typeof THINKING_EFFORT_BY_TASK)[AiTask];

/** Tasks allowed to search the web (BR-IA-12): programme design only. */
export const WEB_SEARCH_TASKS: readonly AiTask[] = ['programme'];

export function isAiTask(value: string): value is AiTask {
  return (AI_TASKS as readonly string[]).includes(value);
}

export function isProvidedModel(value: string): value is AiModelId {
  return Object.values(AI_MODEL_IDS).some((model) => model === value);
}

/** Providers offered by the personal-key screen (SPEC-602 EF-6); `local` stays out of onboarding. */
export const BYOK_PROVIDERS = ['anthropic', 'openai', 'mistral', 'openai_compatible'] as const;
export type ByokProvider = (typeof BYOK_PROVIDERS)[number];

function modelList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}

/**
 * ET-5 — the model tested by default for each provider. Anthropic has a stable recommendation;
 * the other hosted providers are configured by comma-separated environment lists and are empty by
 * default (the screen then asks for the model name). `openai_compatible` always asks for it.
 */
export const BYOK_RECOMMENDED_MODELS: Record<ByokProvider, readonly string[]> = {
  anthropic: [AI_MODEL_IDS.sonnet],
  openai: modelList(process.env.BYOK_MODELS_OPENAI),
  mistral: modelList(process.env.BYOK_MODELS_MISTRAL),
  openai_compatible: [],
};
