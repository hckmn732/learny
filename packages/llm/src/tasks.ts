// Task catalogue of @learny/llm (SPEC-504 ET-1, docs/architecture/ai.md §1).
// No model is attached to a task here: the learner chooses it (BR-IA-02).
import type { AiTask, ThinkingEffort } from '@learny/config';

/** Capabilities a model must provide for a task (BR-IA-02 qualification). */
export const TASK_CAPABILITIES = [
  'tools',
  'structured',
  'web_search',
  'passage_refs',
  'vision',
] as const;

export type TaskCapability = (typeof TASK_CAPABILITIES)[number];

export interface TaskConfig {
  /** Adaptive thinking effort sent to Anthropic (ET-4). */
  readonly effort: Exclude<ThinkingEffort, 'none'>;
  readonly maxOutputTokens: number;
  readonly timeoutMs: number;
  readonly capabilities: readonly TaskCapability[];
}

/**
 * ET-1 — the single source of task budgets. `light` uses `low` rather than `none`: thinking
 * cannot be disabled at every level of the 5.5 models (SPEC-504 §15).
 */
export const TASK_CONFIG = {
  programme: {
    effort: 'high',
    maxOutputTokens: 32000,
    timeoutMs: 180_000,
    capabilities: ['tools', 'structured', 'web_search'],
  },
  course: {
    effort: 'medium',
    maxOutputTokens: 64000,
    timeoutMs: 300_000,
    capabilities: ['structured', 'passage_refs'],
  },
  gaps: {
    effort: 'medium',
    maxOutputTokens: 16000,
    timeoutMs: 120_000,
    capabilities: ['structured'],
  },
  tutor: {
    effort: 'low',
    maxOutputTokens: 8000,
    timeoutMs: 60_000,
    capabilities: ['tools', 'structured'],
  },
  light: {
    effort: 'low',
    maxOutputTokens: 4000,
    timeoutMs: 30_000,
    capabilities: ['structured', 'vision'],
  },
} as const satisfies Record<AiTask, TaskConfig>;

/** Calls above this output budget stream on the provider side to avoid HTTP timeouts (ET-1). */
export const STREAMING_OUTPUT_THRESHOLD = 16_000;

/** True when the task needs provider-side streaming for its output budget. */
export function needsProviderStreaming(task: AiTask): boolean {
  return TASK_CONFIG[task].maxOutputTokens > STREAMING_OUTPUT_THRESHOLD;
}
