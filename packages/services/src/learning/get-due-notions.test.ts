// Unit tests of the due-notion query projection (SPEC-411 EF-3, ET-2). The transaction is a fake:
// these tests pin the DTO shape, the gap list and the defensive status decoding, not SQL.
import { describe, expect, it, vi } from 'vitest';

import type { UserDatabase } from '@learny/db';

import { TestClock } from '../../test/support/fakes';
import type { ServiceContext } from '../context';

import { getDueNotions } from './get-due-notions';

const USER = '11111111-1111-4111-8111-111111111111';
const FORMATION = '22222222-2222-4222-8222-222222222222';
const MODULE = '33333333-3333-4333-8333-333333333333';
const NOTION = '44444444-4444-4444-8444-444444444444';
const AT = new Date('2026-11-11T12:20:00Z');

function context(execute: ReturnType<typeof vi.fn>): ServiceContext {
  return {
    userId: USER,
    requestId: 'req-due',
    db: { run: (flow: (tx: unknown) => Promise<unknown>) => flow({ execute }) } as UserDatabase,
    clock: new TestClock(AT.toISOString()),
    logger: {} as never,
  };
}

function row(partial: Record<string, unknown> = {}) {
  return {
    notion_id: NOTION,
    label: 'Comptabilité',
    chapter_id: '55555555-5555-4555-8555-555555555555',
    module_id: MODULE,
    module_position: 2,
    module_status: 'open',
    evaluated: true,
    due_at: '2026-11-11T09:00:00.000Z',
    mastery: '0.42',
    gap_nature: 'confusion',
    ...partial,
  };
}

describe('[SPEC-411] notions dues', () => {
  it('projette les notions dues et la liste des lacunes (EF-3)', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce([{ id: FORMATION }])
      .mockResolvedValueOnce([
        row(),
        row({ notion_id: '66666666-6666-4666-8666-666666666666', gap_nature: null }),
      ]);

    const result = await getDueNotions(context(execute), FORMATION, AT);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('due notions should succeed');
    expect(result.value).toMatchObject({
      formationId: FORMATION,
      at: AT.toISOString(),
      notions: [
        {
          notionId: NOTION,
          moduleStatus: 'open',
          evaluated: true,
          dueAt: '2026-11-11T09:00:00.000Z',
          mastery: 0.42,
          gapNature: 'confusion',
        },
        { gapNature: null },
      ],
      gaps: [{ notionId: NOTION, nature: 'confusion' }],
    });
  });

  it('refuse une formation absente', async () => {
    const result = await getDueNotions(context(vi.fn().mockResolvedValueOnce([])), FORMATION, AT);
    expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('refuse un statut de module ou une nature de lacune inconnus', async () => {
    const badStatus = await getDueNotions(
      context(
        vi
          .fn()
          .mockResolvedValueOnce([{ id: FORMATION }])
          .mockResolvedValueOnce([row({ module_status: 'archive' })]),
      ),
      FORMATION,
      AT,
    );
    expect(badStatus).toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } });

    const badNature = await getDueNotions(
      context(
        vi
          .fn()
          .mockResolvedValueOnce([{ id: FORMATION }])
          .mockResolvedValueOnce([row({ gap_nature: 'mystery' })]),
      ),
      FORMATION,
      AT,
    );
    expect(badNature).toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } });
  });
});
