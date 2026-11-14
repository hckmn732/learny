import { describe, expect, it } from 'vitest';

import type { DbTx, UserDatabase } from '@learny/db';

import type { ServiceContext } from '../context';

import { answerWarmup } from './answer';
import { getTodayWarmups } from './get-today';

const USER = '11111111-1111-4111-8111-111111111111';
const ACTIVITY = '22222222-2222-4222-8222-222222222222';
const FORMATION = '33333333-3333-4333-8333-333333333333';
const NOTION = '44444444-4444-4444-8444-444444444444';
const BRICK = '55555555-5555-4555-8555-555555555555';
const VERSION = '66666666-6666-4666-8666-666666666666';
const NOW = '2026-11-11T12:20:00.000Z';

function fakeDb(responses: readonly unknown[][]): UserDatabase {
  let index = 0;
  const tx = {
    execute: () => Promise.resolve(responses[index++] ?? []),
  } as unknown as DbTx;
  return { run: (fn) => fn(tx) };
}

function context(db: UserDatabase): ServiceContext {
  return {
    userId: USER,
    requestId: 'request-714',
    db,
    clock: { now: () => new Date(NOW) },
    logger: { warn: () => undefined, info: () => undefined, error: () => undefined },
  } as unknown as ServiceContext;
}

function activityRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ACTIVITY,
    formation_id: FORMATION,
    module_id: null,
    module_position: 3,
    config: { durationSec: 120, questionCount: 1, scope: 'yesterday_prerequisites' },
    items: [{ brickId: BRICK, brickVersionId: VERSION }],
    status: 'ready',
    for_date: '2026-11-11',
    attempt_id: null,
    attempt_status: null,
    attempt_submitted_at: null,
    slot_starts_at: '2026-11-11T12:50:00Z',
    review_remaining: null,
    ...overrides,
  };
}

const VERSION_ROW = {
  version_id: VERSION,
  brick_id: BRICK,
  type: 'recall_card',
  notion_ids: [NOTION],
  payload: { front: 'Quelle clé ?', back: '40.', sources: [] },
};

const NOTION_ROW = {
  id: NOTION,
  label: 'Clé de comptabilisation',
  module_position: 3,
};

const SESSION_ROW = {
  id: '77777777-7777-4777-8777-777777777777',
  kind: 'validation_quiz',
  starts_at: '2026-11-11T13:00:00Z',
  module_id: '88888888-8888-4888-8888-888888888888',
  activity_id: null,
};

describe('[SPEC-714] échauffement · services', () => {
  it('EF-7 — le DTO assemble la question, le tag et la prochaine séance', async () => {
    const result = await getTodayWarmups(
      context(
        fakeDb([
          [{ timezone: 'Europe/Paris' }],
          [activityRow()],
          [SESSION_ROW],
          [VERSION_ROW],
          [NOTION_ROW],
        ]),
      ),
    );
    if (!result.ok) throw result.error;
    expect(result.value.items).toHaveLength(1);
    const dto = result.value.items[0];
    expect(dto?.activityId).toBe(ACTIVITY);
    expect(dto?.items[0]).toMatchObject({
      position: 0,
      notionId: NOTION,
      notionLabel: 'Clé de comptabilisation',
      tag: 'yesterday',
      moduleNumber: null,
      question: 'Quelle clé ?',
      answer: '40.',
    });
    expect(dto?.nextSession).toEqual({
      kind: 'validation_quiz',
      startsAt: '2026-11-11T14:00:00+01:00',
      href: '/formations/33333333-3333-4333-8333-333333333333/modules/88888888-8888-4888-8888-888888888888/quiz',
    });
    expect(dto?.status).toBe('todo');
  });

  it('CL-4 — aucune activité du jour renvoie une liste vide', async () => {
    const result = await getTodayWarmups(context(fakeDb([[{ timezone: 'Europe/Paris' }], []])));
    if (!result.ok) throw result.error;
    expect(result.value.items).toEqual([]);
  });

  it('CA-7 — une activité d’un autre utilisateur est un 404', async () => {
    const result = await answerWarmup(context(fakeDb([[{ timezone: 'Europe/Paris' }], []])), {
      activityId: ACTIVITY,
      position: 0,
      knew: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
  });

  it('ET-2 — une position hors bornes répond 422 VALIDATION_FAILED', async () => {
    const result = await answerWarmup(
      context(fakeDb([[{ timezone: 'Europe/Paris' }], [activityRow()]])),
      { activityId: ACTIVITY, position: 3, knew: true },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION_FAILED');
      expect(result.error.errors?.[0]?.path).toBe('position');
    }
  });

  it('ET-2 — un identifiant invalide est refusé avant toute lecture', async () => {
    const result = await answerWarmup(context(fakeDb([])), {
      activityId: 'pas-un-uuid',
      position: 0,
      knew: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION_FAILED');
  });
});
