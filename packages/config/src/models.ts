// AI tasks and their routing parameters (docs/architecture/ai.md §1). The platform provides no
// model: every task runs on the model that the learner chose with a personal key (BR-IA-02,
// BR-IA-06). No model identifier is written here.

/** AI tasks of the product, in the order of docs/architecture/ai.md §1. */
export const AI_TASKS = ['programme', 'course', 'gaps', 'tutor', 'light'] as const;

export type AiTask = (typeof AI_TASKS)[number];

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
 * ET-5 — the models proposed for each provider. None is recommended by default: Anthropic and
 * `openai_compatible` are empty, the other hosted providers come from comma-separated environment
 * lists, and the screen asks for the model name whenever a list is empty.
 */
export const BYOK_RECOMMENDED_MODELS: Record<ByokProvider, readonly string[]> = {
  anthropic: [],
  openai: modelList(process.env.BYOK_MODELS_OPENAI),
  mistral: modelList(process.env.BYOK_MODELS_MISTRAL),
  openai_compatible: [],
};
