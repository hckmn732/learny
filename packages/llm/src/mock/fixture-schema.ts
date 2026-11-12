// Zod schema of the simulated-model fixtures (SPEC-504 ET-6, ADR-0153 §1).
// `fixtures/fixture.schema.json` is generated from this schema; every fixture of the repository is
// validated by the unit test of `fixtures.test.ts`.
import { z } from 'zod';

import { AI_TASKS } from '@learny/config';

export const USAGE_SCHEMA = z
  .object({
    inputTokens: z.int().min(0).default(0),
    outputTokens: z.int().min(0).default(0),
    cacheReadTokens: z.int().min(0).default(0),
    cacheWriteTokens: z.int().min(0).default(0),
  })
  .default({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 });

export const MOCK_ERROR_KINDS = [
  'refusal',
  'rate_limit',
  'timeout',
  'auth',
  'server',
  'context_length',
  'overloaded',
] as const;

export type MockErrorKind = (typeof MOCK_ERROR_KINDS)[number];

const stepBase = {
  usage: USAGE_SCHEMA,
  latencyMs: z.int().min(0).default(0),
};

const textStep = z.object({
  type: z.literal('text'),
  text: z.string(),
  finishReason: z.enum(['stop', 'length', 'refusal']).default('stop'),
  ...stepBase,
});

const toolCallsStep = z.object({
  type: z.literal('tool-calls'),
  toolCalls: z
    .array(
      z.object({
        toolCallId: z.string().min(1),
        toolName: z.string().min(1),
        input: z.unknown(),
      }),
    )
    .min(1),
  ...stepBase,
});

const objectStep = z.object({
  type: z.literal('object'),
  object: z.unknown(),
  ...stepBase,
});

const streamStep = z.object({
  type: z.literal('stream'),
  chunks: z.array(z.string()).min(1),
  ...stepBase,
});

const errorStep = z.object({
  type: z.literal('error'),
  error: z.object({
    kind: z.enum(MOCK_ERROR_KINDS),
    message: z.string().min(1),
  }),
  ...stepBase,
});

export const STEP_SCHEMA = z.discriminatedUnion('type', [
  textStep,
  toolCallsStep,
  objectStep,
  streamStep,
  errorStep,
]);

export type FixtureStep = z.infer<typeof STEP_SCHEMA>;

/** ADR-0153 §1 — one JSON file per task and scenario. */
export const FIXTURE_FILE_SCHEMA = z.object({
  task: z.enum(AI_TASKS),
  scenario: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'scénario en kebab-case attendu')
    .min(1),
  promptId: z.string().min(1),
  promptVersion: z.int().min(1),
  description: z.string().min(1),
  match: z
    .object({
      contains: z.array(z.string().min(1)).min(1),
    })
    .optional(),
  steps: z.array(STEP_SCHEMA).min(1),
});

export type FixtureFile = z.infer<typeof FIXTURE_FILE_SCHEMA>;

/** Parses a fixture and prefixes the failure with its path, for an actionable test message. */
export function parseFixture(value: unknown, source = 'fixture'): FixtureFile {
  const result = FIXTURE_FILE_SCHEMA.safeParse(value);
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(racine)'} : ${issue.message}`)
      .join(' ; ');
    throw new Error(`Fixture invalide (${source}) : ${detail}`);
  }
  return result.data;
}
