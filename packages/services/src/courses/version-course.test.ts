// Unit tests of the deterministic course version identifiers and the generation input guard
// (SPEC-608 ET-2, ET-4, ET-5).

import { describe, expect, it } from 'vitest';

import { TestClock } from '../../test/support/fakes';

import { generateCourse } from './generate-course';
import {
  courseGeneratedEventId,
  courseGenerationKey,
  courseReadyDedupeKey,
} from './version-course';

const NOW = new Date('2026-11-11T12:20:00Z');
const MODULE = '11111111-1111-4111-8111-111111111111';

const ctx = {
  userId: '22222222-2222-4222-8222-222222222222',
  requestId: 'req-course',
  db: null,
  clock: new TestClock(NOW.toISOString()),
  logger: {} as never,
};

describe('[SPEC-608] identifiants de génération', () => {
  it('dérive des identifiants déterministes et bornés', () => {
    expect(courseGenerationKey({ moduleId: MODULE, mode: 'force', version: '1:2:3' })).toBe(
      `course-generation:${MODULE}:force:1:2:3`,
    );
    expect(
      courseGenerationKey({ moduleId: MODULE, mode: 'auto', version: 'x'.repeat(300) }),
    ).toHaveLength(200);
    expect(courseGeneratedEventId('abc')).toBe('course-generated:abc');
    expect(courseReadyDedupeKey('abc')).toBe('course-ready:abc');
  });

  it('refuse une demande de génération invalide avant toute écriture', async () => {
    await expect(
      generateCourse(ctx, { moduleId: 'pas-un-uuid', generationKey: '' }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
  });
});
