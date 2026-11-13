// Unit tests of the stored-brick grading boundary (SPEC-502 ET-6). The transaction is a fake:
// these tests pin the 404 boundary, the stored payload parsing and the tutor-graded refusal.
import { describe, expect, it, vi } from 'vitest';

import { brickExamples } from '@learny/bricks';

import type { ServiceContext } from '../context';

import { gradeStoredBrick } from './grade-service';

const USER = '11111111-1111-4111-8111-111111111111';
const VERSION = '22222222-2222-4222-8222-222222222222';

function context(execute: ReturnType<typeof vi.fn>): ServiceContext {
  return {
    userId: USER,
    requestId: 'req-grade',
    db: { run: (flow: (tx: unknown) => Promise<unknown>) => flow({ execute }) } as never,
    clock: {} as never,
    logger: {} as never,
  };
}

describe('[SPEC-502] correction d’une version stockée', () => {
  it('refuse un identifiant invalide, une version absente et une charge illisible', async () => {
    const invalid = await gradeStoredBrick(
      { ...context(vi.fn()), db: { run: vi.fn() } },
      'pas-un-uuid',
      {},
    );
    expect(invalid).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });

    const missing = await gradeStoredBrick(context(vi.fn().mockResolvedValue([])), VERSION, {});
    expect(missing).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });

    const broken = await gradeStoredBrick(
      context(
        vi
          .fn()
          .mockResolvedValue([{ versionId: VERSION, type: 'text', payload: { broken: true } }]),
      ),
      VERSION,
      {},
    );
    expect(broken).toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } });
  });

  it('renvoie la correction du code ou refuse une brique corrigée par le tuteur', async () => {
    const graded = await gradeStoredBrick(
      context(
        vi
          .fn()
          .mockResolvedValue([
            { versionId: VERSION, type: 'text', payload: brickExamples.text.valid },
          ]),
      ),
      VERSION,
      {},
    );
    expect(graded).toMatchObject({ ok: false, error: { code: 'RESPONSE_INVALID' } });
  });
});
