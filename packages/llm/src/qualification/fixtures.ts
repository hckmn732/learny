// Deterministic fixtures of the qualification battery (SPEC-506 ET-5, ADR-0048).
// They are deliberately kept out of the task fixture registry: a qualification scenario is never
// selected by a normal tutor, course or light call.
import connectionFailure from '../../fixtures/qualification/qualification-connection-failure.json';
import invalidBrick from '../../fixtures/qualification/qualification-invalid-brick.json';
import success from '../../fixtures/qualification/qualification-success.json';
import type { RegisteredFixture } from '../mock/fixture-registry';
import { parseFixture } from '../mock/fixture-schema';

export const QUALIFICATION_SCENARIOS = [
  'qualification-success',
  'qualification-invalid-brick',
  'qualification-connection-failure',
] as const;

export type QualificationScenario = (typeof QUALIFICATION_SCENARIOS)[number];

const COMPATIBILITY_TASKS = ['programme', 'course', 'gaps', 'tutor', 'light'] as const;
export const COMPATIBILITY_SCENARIOS = [
  'compatibility-programme-success',
  'compatibility-course-success',
  'compatibility-gaps-success',
  'compatibility-tutor-success',
  'compatibility-light-success',
  'compatibility-tutor-reserve',
] as const;
export type CompatibilityScenario = (typeof COMPATIBILITY_SCENARIOS)[number];

function entry(path: string, value: unknown): RegisteredFixture {
  return { path, fixture: parseFixture(value, path) };
}

/** Every committed qualification fixture, sorted by path (ADR-0153 §2c). */
export const QUALIFICATION_FIXTURES: readonly RegisteredFixture[] = [
  entry('qualification/qualification-connection-failure.json', connectionFailure),
  entry('qualification/qualification-invalid-brick.json', invalidBrick),
  entry('qualification/qualification-success.json', success),
].sort((left, right) => left.path.localeCompare(right.path));

function compatibilityFixture(task: (typeof COMPATIBILITY_TASKS)[number]): RegisteredFixture {
  const structured = {
    type: 'object',
    object: { compatible: true, summary: 'Sortie structurée disponible.' },
    usage: { inputTokens: 20, outputTokens: 8, cacheReadTokens: 0, cacheWriteTokens: 0 },
    latencyMs: 20,
  } as const;
  const tools = {
    type: 'tool-calls',
    toolCalls: [
      {
        toolCallId: `compatibility-${task}-tool`,
        toolName: 'compatibility_probe',
        input: { value: 'ok' },
      },
    ],
    usage: { inputTokens: 20, outputTokens: 8, cacheReadTokens: 0, cacheWriteTokens: 0 },
    latencyMs: 20,
  } as const;
  const vision = {
    type: 'object',
    object: { visible: true },
    usage: { inputTokens: 20, outputTokens: 8, cacheReadTokens: 0, cacheWriteTokens: 0 },
    latencyMs: 20,
  } as const;
  const steps =
    task === 'programme' || task === 'tutor'
      ? [structured, tools]
      : task === 'light'
        ? [structured, vision]
        : [structured];
  return entry(`qualification/compatibility-${task}-success.json`, {
    task,
    scenario: `compatibility-${task}-success`,
    promptId: 'qualification.compatibility',
    promptVersion: 1,
    description: `Compatibilité ${task} : sondes requises réussies.`,
    steps,
  });
}

export const COMPATIBILITY_FIXTURES = [
  ...COMPATIBILITY_TASKS.map(compatibilityFixture),
  entry('qualification/compatibility-tutor-reserve.json', {
    task: 'tutor',
    scenario: 'compatibility-tutor-reserve',
    promptId: 'qualification.compatibility',
    promptVersion: 1,
    description: 'Compatibilité tutor : sortie structurée non fiable, outil strict disponible.',
    steps: [
      {
        type: 'object',
        object: { compatible: 'yes' },
        usage: { inputTokens: 20, outputTokens: 8, cacheReadTokens: 0, cacheWriteTokens: 0 },
        latencyMs: 20,
      },
      {
        type: 'tool-calls',
        toolCalls: [
          {
            toolCallId: 'compatibility-tutor-reserve-tool',
            toolName: 'compatibility_probe',
            input: { value: 'ok' },
          },
        ],
        usage: { inputTokens: 20, outputTokens: 8, cacheReadTokens: 0, cacheWriteTokens: 0 },
        latencyMs: 20,
      },
    ],
  }),
];

export function isQualificationScenario(value: string): value is QualificationScenario {
  return (QUALIFICATION_SCENARIOS as readonly string[]).includes(value);
}
