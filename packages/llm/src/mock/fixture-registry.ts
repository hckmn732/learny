// Static registry of the committed fixtures. JSON imports keep the fixtures available in the Next
// server bundle without reading the filesystem at runtime (SPEC-504 ET-6, ADR-0153).
import lightInvalidObject from '../../fixtures/light/demo-invalid-object.json' with { type: 'json' };
import lightObject from '../../fixtures/light/demo-object.json' with { type: 'json' };
import lightSpec510Image from '../../fixtures/light/spec-510-image.json' with { type: 'json' };
import tutorRefusal from '../../fixtures/tutor/demo-refusal.json' with { type: 'json' };
import tutorStream from '../../fixtures/tutor/demo-stream.json' with { type: 'json' };
import tutorTimeout from '../../fixtures/tutor/demo-timeout.json' with { type: 'json' };
import tutorToolCall from '../../fixtures/tutor/demo-tool-call.json' with { type: 'json' };
import tutorDefault from '../../fixtures/tutor/demo.default.json' with { type: 'json' };

import { parseFixture, type FixtureFile } from './fixture-schema';

export interface RegisteredFixture {
  /** Repository path relative to `packages/llm/fixtures`, used by the selection order. */
  readonly path: string;
  readonly fixture: FixtureFile;
}

function entry(path: string, value: unknown): RegisteredFixture {
  return { path, fixture: parseFixture(value, path) };
}

/** Every fixture of the repository, sorted by path (ADR-0153 §2c). */
export const FIXTURE_REGISTRY: readonly RegisteredFixture[] = [
  entry('light/demo-invalid-object.json', lightInvalidObject),
  entry('light/demo-object.json', lightObject),
  entry('light/spec-510-image.json', lightSpec510Image),
  entry('tutor/demo-tool-call.json', tutorToolCall),
  entry('tutor/demo-refusal.json', tutorRefusal),
  entry('tutor/demo-stream.json', tutorStream),
  entry('tutor/demo-timeout.json', tutorTimeout),
  entry('tutor/demo.default.json', tutorDefault),
].sort((left, right) => left.path.localeCompare(right.path));

export function fixturesForTask(task: string): readonly RegisteredFixture[] {
  return FIXTURE_REGISTRY.filter((candidate) => candidate.fixture.task === task);
}
