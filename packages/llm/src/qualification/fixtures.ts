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

function entry(path: string, value: unknown): RegisteredFixture {
  return { path, fixture: parseFixture(value, path) };
}

/** Every committed qualification fixture, sorted by path (ADR-0153 §2c). */
export const QUALIFICATION_FIXTURES: readonly RegisteredFixture[] = [
  entry('qualification/qualification-connection-failure.json', connectionFailure),
  entry('qualification/qualification-invalid-brick.json', invalidBrick),
  entry('qualification/qualification-success.json', success),
].sort((left, right) => left.path.localeCompare(right.path));

export function isQualificationScenario(value: string): value is QualificationScenario {
  return (QUALIFICATION_SCENARIOS as readonly string[]).includes(value);
}
