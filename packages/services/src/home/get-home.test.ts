// Unit tests of the home aggregation (SPEC-603 ET-2, BR-PRO-02, BR-PRO-03, BR-FOR-13, BR-FOR-16).
// The transaction is a fake: these tests pin the projection of the day, the slots, the retention,
// the global-quiz preview and both formation tabs, not SQL.
import { describe, expect, it, vi } from 'vitest';

import type { UserDatabase } from '@learny/db';

import { TestClock } from '../../test/support/fakes';
import type { ServiceContext } from '../context';

import { getHome } from './get-home';

const USER = '11111111-1111-4111-8111-111111111111';
const ACTIVE = '22222222-2222-4222-8222-222222222222';
const PAUSED = '33333333-3333-4333-8333-333333333333';
const PROPOSED = '44444444-4444-4444-8444-444444444444';
const CADRAGE = '55555555-5555-4555-8555-555555555555';
const COMPLETED = '66666666-6666-4666-8666-666666666666';
const COMPLETED_BIS = '77777777-7777-4777-8777-777777777777';
const MODULE = '88888888-8888-4888-8888-888888888888';
const NOTION = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const NOTION_BIS = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SLOT_DONE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SLOT_NEXT = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const SLOT_REVISION = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const SLOT_QUIZ = '10101010-1010-4010-8010-101010101010';
const ACTIVITY = '12121212-1212-4212-8212-121212121212';
const NEXT_SLOT = '13131313-1313-4313-8313-131313131313';
const REVIEW = '14141414-1414-4414-8414-141414141414';
const REVIEW_BIS = '15151515-1515-4515-8515-151515151515';
const NOW = new Date('2026-11-11T12:20:00Z');

function context(execute: ReturnType<typeof vi.fn>, userId = USER): ServiceContext {
  return {
    userId,
    requestId: 'req-home',
    db: { run: (flow: (tx: unknown) => Promise<unknown>) => flow({ execute }) } as UserDatabase,
    clock: new TestClock(NOW.toISOString()),
    logger: {} as never,
  };
}

function sequence(rows: readonly unknown[][]) {
  const execute = vi.fn();
  for (const value of rows) execute.mockResolvedValueOnce(value);
  return execute;
}

function formation(partial: Record<string, unknown> = {}) {
  return {
    id: ACTIVE,
    title: 'SAP S/4HANA Finance',
    monogram: 'SA',
    accent: 'indigo',
    status: 'active',
    description: null,
    objectives: ['operational'],
    volume_hours: null,
    start_date: '2026-09-01',
    end_date: '2026-12-20',
    completed_at: null,
    maintenance_mode: null,
    last_opened_at: '2026-11-10T10:00:00Z',
    created_at: '2026-09-01T10:00:00Z',
    module_count: 3,
    validated_count: 1,
    open_module_id: MODULE,
    open_module_position: 2,
    open_module_title: 'Comptabilité générale',
    open_module_threshold: 80,
    open_module_status: 'open',
    contributions_in_progress: false,
    course_status: 'ready',
    reading_percent: 100,
    attempt_count: 1,
    last_score: 60,
    result_percent: 60,
    due_count: 2,
    cadrage_questions: 0,
    ...partial,
  };
}

function slot(partial: Record<string, unknown> = {}) {
  return {
    id: SLOT_DONE,
    formation_id: ACTIVE,
    module_id: MODULE,
    activity_id: null,
    kind: 'course',
    title: 'Comptabilité générale',
    meta: null,
    starts_at: '2026-11-11T09:00:00Z',
    ends_at: '2026-11-11T10:00:00Z',
    status: 'done',
    ...partial,
  };
}

function due(partial: Record<string, unknown> = {}) {
  return {
    notion_id: NOTION,
    module_id: MODULE,
    module_position: 2,
    module_status: 'open',
    evaluated: true,
    due_at: '2026-11-11T09:00:00Z',
    in_review: true,
    gap_nature: null,
    ...partial,
  };
}

function fullSequence(profile: Record<string, unknown> = {}) {
  return sequence([
    [
      {
        current_formation_id: ACTIVE,
        timezone: 'Europe/Paris',
        next_review_at: null,
        ...profile,
      },
    ],
    [
      formation(),
      formation({
        id: PAUSED,
        title: 'Gestion de projet agile',
        monogram: 'GP',
        accent: 'green',
        status: 'paused',
        description: 'Reprise après une pause.',
        objectives: ['exam'],
        module_count: 0,
        validated_count: 0,
        open_module_id: null,
        open_module_position: null,
        open_module_title: null,
        open_module_threshold: null,
        open_module_status: null,
        last_opened_at: null,
        created_at: '2026-10-01T10:00:00Z',
      }),
      formation({
        id: PROPOSED,
        title: 'Python pour l’analyse de données',
        monogram: 'PY',
        accent: 'violet',
        status: 'programme_proposed',
        objectives: [],
        module_count: 1,
        validated_count: 0,
        open_module_id: null,
        open_module_position: null,
        open_module_title: null,
        last_opened_at: null,
        created_at: '2026-10-05T10:00:00Z',
      }),
      formation({
        id: CADRAGE,
        title: 'Anglais professionnel',
        monogram: 'AN',
        accent: 'orange',
        status: 'cadrage',
        objectives: [],
        module_count: 0,
        validated_count: 0,
        open_module_id: null,
        open_module_position: null,
        open_module_title: null,
        last_opened_at: null,
        created_at: '2026-10-10T10:00:00Z',
        cadrage_questions: 2,
      }),
      formation({
        id: COMPLETED,
        title: 'Excel pour l’analyse financière',
        monogram: 'EX',
        accent: 'teal',
        status: 'completed',
        description: null,
        objectives: ['exam'],
        volume_hours: 60,
        completed_at: '2026-10-20T10:00:00Z',
        maintenance_mode: 'light',
        module_count: 4,
        validated_count: 4,
        open_module_id: null,
        open_module_position: null,
        open_module_title: null,
        last_opened_at: null,
        created_at: '2026-08-01T10:00:00Z',
        result_percent: 88,
        due_count: 5,
      }),
      formation({
        id: COMPLETED_BIS,
        title: 'Anglais professionnel B2',
        monogram: 'EN',
        accent: 'orange',
        status: 'completed',
        description:
          'Une formation très longue qui dépasse largement la première ligne attendue par la carte.\nSuite.',
        objectives: [],
        volume_hours: null,
        completed_at: null,
        maintenance_mode: 'stopped',
        module_count: 2,
        validated_count: 2,
        open_module_id: null,
        open_module_position: null,
        open_module_title: null,
        last_opened_at: null,
        created_at: '2026-08-02T10:00:00Z',
        result_percent: 82,
        due_count: 0,
      }),
    ],
    [
      slot(),
      slot({
        id: SLOT_NEXT,
        kind: 'validation_quiz',
        title: 'Quiz de validation',
        activity_id: ACTIVITY,
        starts_at: '2026-11-11T14:00:00Z',
        ends_at: '2026-11-11T15:00:00Z',
        status: 'planned',
      }),
      slot({
        id: SLOT_REVISION,
        kind: 'revision',
        title: 'Révision',
        starts_at: '2026-11-11T16:00:00Z',
        ends_at: '2026-11-11T17:00:00Z',
        status: 'planned',
      }),
      slot({
        id: SLOT_QUIZ,
        kind: 'global_quiz',
        title: 'Quiz global',
        starts_at: '2026-11-11T18:00:00Z',
        ends_at: '2026-11-11T18:15:00Z',
        status: 'planned',
      }),
    ],
    [
      slot({
        id: NEXT_SLOT,
        kind: 'course',
        title: 'Cours de demain',
        starts_at: '2026-11-12T09:00:00Z',
        ends_at: '2026-11-12T10:00:00Z',
        status: 'planned',
      }),
    ],
    [
      {
        formation_id: ACTIVE,
        module_id: MODULE,
        validated_at: '2026-09-01T10:00:00Z',
        notion_ids: [NOTION],
      },
    ],
    [due(), due({ notion_id: NOTION_BIS })],
    [
      { notion_ids: [NOTION], type: 'choice_question' },
      { notion_ids: [NOTION_BIS], type: 'text' },
    ],
    [
      {
        review_id: REVIEW,
        notion_id: NOTION,
        reviewed_at: '2026-10-01T10:00:00Z',
        correct: true,
      },
      {
        review_id: REVIEW_BIS,
        notion_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        reviewed_at: '2026-10-01T10:00:00Z',
        correct: false,
      },
    ],
  ]);
}

describe('[SPEC-603] accueil de l’apprenant', () => {
  it('projette la journée, la rétention, le quiz et les deux onglets (ET-2)', async () => {
    const execute = fullSequence();

    const result = await getHome(context(execute));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('accueil attendu');
    const home = result.value;

    expect(home.today).toMatchObject({
      date: '2026-11-11',
      label: 'Mercredi 11 novembre',
      plannedMinutes: 180,
      doneMinutes: 60,
      primaryAction: {
        label: 'Commencer le quiz de validation',
        href: `/formations/${ACTIVE}/modules/${MODULE}/quiz`,
      },
    });
    expect(home.today.slots.map((row) => row.state)).toEqual([
      'done',
      'next',
      'upcoming',
      'upcoming',
    ]);
    expect(home.today.slots[1]).toMatchObject({ minutesUntil: 100, time: '15:00' });
    expect(home.retention).toEqual({ oneMonth: 100, twoMonths: null });

    expect(home.globalQuiz).toMatchObject({
      formationId: ACTIVE,
      formationTitle: 'SAP S/4HANA Finance',
      notionCount: 1,
      gamesCount: 1,
      hasGaps: false,
      deferred: { dueCount: 2, deferredCount: 1, deferredTo: '2026-11-12', capMin: 15 },
    });

    expect(home.formations.ongoing.map((row) => row.status)).toEqual([
      'active',
      'paused',
      'programme_proposed',
      'cadrage',
    ]);
    expect(home.formations.ongoing[0]).toMatchObject({
      id: ACTIVE,
      primaryAction: true,
      progressPercent: 33,
      moduleStatus: { label: 'Quiz à repasser' },
      nextActivity: { when: 'Demain, 10:00', detail: 'Cours' },
    });
    expect(home.formations.ongoing[1]).toMatchObject({
      id: PAUSED,
      subtitle: 'Certification',
      moduleStatus: null,
      nextActivity: null,
      action: { label: 'Reprendre', href: `/formations/${PAUSED}/programme` },
    });
    expect(home.formations.ongoing[2]).toMatchObject({
      id: PROPOSED,
      nextActivity: { when: 'Valider le programme', detail: '1 module proposé' },
      action: { label: 'Continuer' },
    });
    expect(home.formations.ongoing[3]).toMatchObject({
      id: CADRAGE,
      nextActivity: { when: 'Terminer le cadrage', detail: 'Question 3 sur 5 au plus' },
      action: { href: `/formations/${CADRAGE}/cadrage` },
    });

    expect(home.formations.completed.map((row) => row.id)).toEqual([COMPLETED, COMPLETED_BIS]);
    expect(home.formations.completed[0]).toMatchObject({
      resultPercent: 88,
      retentionPercent: null,
      dueCount: 5,
      maintenanceMode: 'light',
      completedOn: '2026-10-20',
      weeks: 7,
      volumeHours: 60,
      action: { label: 'Réviser' },
    });
    expect(home.formations.completed[1]).toMatchObject({
      retentionPercent: null,
      maintenanceMode: 'stopped',
      completedOn: null,
      weeks: null,
      action: { label: 'Voir le bilan' },
    });
    expect(home.formations.completed[1]?.subtitle).toMatch(/…$/);
  });

  it('calcule la prochaine révision et un quiz vide (EF-3)', async () => {
    const execute = sequence([
      [
        {
          current_formation_id: ACTIVE,
          timezone: 'UTC',
          next_review_at: '2026-11-13T09:00:00Z',
        },
      ],
      [formation()],
      [],
      [],
      [],
      [],
      [],
      [],
    ]);

    const result = await getHome(context(execute));

    expect(result).toMatchObject({
      ok: true,
      value: {
        globalQuiz: {
          notionCount: 0,
          gamesCount: 0,
          durationMin: 0,
          deferred: null,
          nextReviewOn: '2026-11-13',
        },
        today: { date: '2026-11-11', plannedMinutes: 0, doneMinutes: 0, slots: [] },
      },
    });
  });

  it('ne charge ni quiz ni banque sans formation courante (CA-7)', async () => {
    const execute = sequence([
      [{ current_formation_id: null, timezone: 'Europe/Paris', next_review_at: null }],
      [],
      [],
      [],
      [],
      [],
    ]);

    const result = await getHome(context(execute));

    expect(result).toMatchObject({
      ok: true,
      value: {
        globalQuiz: null,
        today: { slots: [], primaryAction: null },
        retention: { oneMonth: null, twoMonths: null },
        formations: { ongoing: [], completed: [] },
      },
    });
  });

  it('refuse un profil introuvable et un appel anonyme', async () => {
    await expect(getHome(context(sequence([[]])))).rejects.toThrow('Profil introuvable.');

    const anonymous: ServiceContext = {
      userId: null,
      requestId: 'req-home',
      db: null,
      clock: new TestClock(),
      logger: {} as never,
    };
    await expect(getHome(anonymous)).resolves.toMatchObject({
      ok: false,
      error: { code: 'UNAUTHENTICATED' },
    });
  });
});
