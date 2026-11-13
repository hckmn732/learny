// Unit tests of the resume replanning (SPEC-618 EF-2, ET-2, ET-4). The transaction is a fake and
// the pure planner + reconciliation are mocks: these tests pin the read mapping, the availability
// defaults, the fallback horizon and the delegation, not SQL or the planner itself.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DbTx } from '@learny/db';
import type { PlanScheduleInput } from '@learny/learning-engine';

import { TestClock } from '../../test/support/fakes';

import { replanFormationAfterResume } from './index';

const mocks = vi.hoisted(() => ({
  planSchedule: vi.fn(),
  reconcile: vi.fn(),
}));

vi.mock('@learny/learning-engine', () => ({ planSchedule: mocks.planSchedule }));
vi.mock('../learning/persist-plan', () => ({ reconcilePlanSlots: mocks.reconcile }));

const USER = '11111111-1111-4111-8111-111111111111';
const FORMATION = '22222222-2222-4222-8222-222222222222';
const MODULE_1 = '33333333-3333-4333-8333-333333333333';
const MODULE_2 = '44444444-4444-4444-8444-444444444444';
const CHAPTER_1 = '55555555-5555-4555-8555-555555555555';
const CHAPTER_2 = '66666666-6666-4666-8666-666666666666';
const NOW = new Date('2026-11-11T12:20:00Z');
const COUNTS = { created: 2, updated: 1, unchanged: 0, cancelled: 1, preserved: 3 };

beforeEach(() => {
  mocks.planSchedule.mockReset().mockReturnValue({ slots: [{ slotId: 'slot-1' }] });
  mocks.reconcile.mockReset().mockResolvedValue(COUNTS);
});

function sequence(rows: readonly unknown[][]): ReturnType<typeof vi.fn> {
  const execute = vi.fn();
  for (const value of rows) execute.mockResolvedValueOnce(value);
  return execute;
}

function tx(execute: ReturnType<typeof vi.fn>): DbTx {
  return { execute } as unknown as DbTx;
}

function plannerInput(): PlanScheduleInput {
  const call = mocks.planSchedule.mock.calls[0];
  if (call === undefined) throw new Error('planSchedule non appelé');
  return call[0] as PlanScheduleInput;
}

describe('[SPEC-618] replanification après reprise', () => {
  it('EF-2 — replanifie depuis le jour local avec le rythme et les créneaux existants', async () => {
    const execute = sequence([
      [
        {
          timezone: 'Europe/Paris',
          hours_per_day: 3,
          study_days: [5, '1', 9, 2],
          preferred_slots: ['soir', 'matin', 'nuit'],
        },
      ],
      [
        {
          id: FORMATION,
          title: 'SAP S/4HANA Finance',
          status: 'paused',
          end_date: '2026-12-31',
          volume_hours: 21,
          objectives: ['operational', 'inconnu', 'exam'],
        },
      ],
      [
        {
          module_id: MODULE_1,
          position: 1,
          title: 'Module 1',
          status: 'open',
          chapter_id: CHAPTER_1,
          chapter_position: 2,
          chapter_title: 'Chapitre B',
        },
        {
          module_id: MODULE_1,
          position: 1,
          title: 'Module 1',
          status: 'open',
          chapter_id: CHAPTER_2,
          chapter_position: 1,
          chapter_title: null,
        },
        {
          module_id: MODULE_2,
          position: 2,
          title: 'Module 2',
          status: 'locked',
          chapter_id: null,
          chapter_position: null,
          chapter_title: null,
        },
      ],
      [
        {
          id: '77777777-7777-4777-8777-777777777777',
          formation_id: FORMATION,
          module_id: MODULE_1,
          kind: 'course',
          title: 'Cours planifié',
          starts_at: new Date('2026-11-12T18:00:00Z'),
          ends_at: new Date('2026-11-12T19:00:00Z'),
          status: 'planned',
          created_by: 'automation',
          moved_from_id: null,
        },
        {
          id: '88888888-8888-4888-8888-888888888888',
          formation_id: FORMATION,
          module_id: MODULE_2,
          kind: 'exercise',
          title: 'Exercice terminé',
          starts_at: '2026-11-10T09:00:00Z',
          ends_at: '2026-11-10T10:00:00Z',
          status: 'done',
          created_by: 'learner',
          moved_from_id: '99999999-9999-4999-8999-999999999999',
        },
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          formation_id: FORMATION,
          module_id: MODULE_1,
          kind: 'revision',
          title: 'Révision manquée',
          starts_at: '2026-11-09T09:00:00Z',
          ends_at: '2026-11-09T09:30:00Z',
          status: 'missed',
          created_by: 'planner',
          moved_from_id: null,
        },
        {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          formation_id: FORMATION,
          module_id: MODULE_1,
          kind: 'revision',
          title: 'Révision déplacée',
          starts_at: '2026-11-13T09:00:00Z',
          ends_at: '2026-11-13T09:30:00Z',
          status: 'moved',
          created_by: 'planner',
          moved_from_id: null,
        },
        {
          id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          formation_id: FORMATION,
          module_id: MODULE_1,
          kind: 'course',
          title: 'Créneau annulé',
          starts_at: '2026-11-14T09:00:00Z',
          ends_at: '2026-11-14T10:00:00Z',
          status: 'cancelled',
          created_by: 'planner',
          moved_from_id: null,
        },
      ],
    ]);

    const result = await replanFormationAfterResume(
      tx(execute),
      USER,
      FORMATION,
      NOW,
      new TestClock(NOW.toISOString()),
    );

    expect(result).toEqual(COUNTS);
    expect(mocks.reconcile).toHaveBeenCalledWith(
      expect.anything(),
      USER,
      FORMATION,
      [{ slotId: 'slot-1' }],
      NOW,
    );

    const input = plannerInput();
    expect(input.now).toBe(NOW.toISOString());
    expect(input.preferences).toEqual({
      tz: 'Europe/Paris',
      availability: {
        hoursPerDay: 3,
        studyDays: [1, 2, 5],
        preferredSlots: ['matin', 'soir'],
      },
    });
    expect(input.formations).toHaveLength(1);
    expect(input.formations[0]).toMatchObject({
      formationId: FORMATION,
      title: 'SAP S/4HANA Finance',
      endDate: '2026-12-31',
      status: 'active',
      objectives: ['operational', 'exam'],
    });
    expect(input.formations[0]?.modules).toEqual([
      {
        moduleId: MODULE_1,
        position: 1,
        title: 'Module 1',
        hours: 11,
        status: 'open',
        chapters: [
          { chapterId: CHAPTER_2, position: 1 },
          { chapterId: CHAPTER_1, position: 2, title: 'Chapitre B' },
        ],
      },
      {
        moduleId: MODULE_2,
        position: 2,
        title: 'Module 2',
        hours: 11,
        status: 'locked',
        chapters: [],
      },
    ]);
    expect(input.existingSlots).toEqual([
      expect.objectContaining({
        slotId: '77777777-7777-4777-8777-777777777777',
        startsAt: '2026-11-12T18:00:00.000Z',
        status: 'planned',
        createdBy: 'automation',
      }),
      expect.objectContaining({
        slotId: '88888888-8888-4888-8888-888888888888',
        startsAt: '2026-11-10T09:00:00.000Z',
        status: 'done',
        createdBy: 'learner',
        movedFromId: '99999999-9999-4999-8999-999999999999',
      }),
      expect.objectContaining({ status: 'missed', createdBy: 'planner' }),
      expect.objectContaining({ status: 'moved', createdBy: 'planner' }),
    ]);
  });

  it('ET-2 — applique les replis de rythme, de volume et d’horizon', async () => {
    const execute = sequence([
      [
        {
          timezone: 'UTC',
          hours_per_day: null,
          study_days: null,
          preferred_slots: null,
        },
      ],
      [
        {
          id: FORMATION,
          title: 'Gestion de projet agile',
          status: 'paused',
          end_date: null,
          volume_hours: null,
          objectives: [],
        },
      ],
      [
        {
          module_id: MODULE_1,
          position: 1,
          title: 'Module unique',
          status: 'open',
          chapter_id: null,
          chapter_position: null,
          chapter_title: null,
        },
      ],
      [],
    ]);

    await replanFormationAfterResume(
      tx(execute),
      USER,
      FORMATION,
      NOW,
      new TestClock(NOW.toISOString()),
    );

    const input = plannerInput();
    expect(input.preferences.availability).toEqual({
      hoursPerDay: 2,
      studyDays: [1, 2, 3, 4, 5],
      preferredSlots: ['soir'],
    });
    expect(input.formations[0]).toMatchObject({
      endDate: '2027-03-11',
      objectives: [],
      modules: [{ moduleId: MODULE_1, hours: 2, chapters: [] }],
    });
    expect(input.existingSlots).toEqual([]);
  });

  it('ET-2 — un volume nul garde une heure positive pour le planificateur', async () => {
    const execute = sequence([
      [{ timezone: 'UTC', hours_per_day: 2, study_days: [1], preferred_slots: ['matin'] }],
      [
        {
          id: FORMATION,
          title: 'Formation sans volume',
          status: 'paused',
          end_date: '2026-12-01',
          volume_hours: 0,
          objectives: ['dialogue'],
        },
      ],
      [
        {
          module_id: MODULE_1,
          position: 1,
          title: 'Module',
          status: 'validated',
          chapter_id: null,
          chapter_position: null,
          chapter_title: null,
        },
      ],
      [],
    ]);

    await replanFormationAfterResume(
      tx(execute),
      USER,
      FORMATION,
      NOW,
      new TestClock(NOW.toISOString()),
    );

    expect(plannerInput().formations[0]?.modules[0]?.hours).toBe(1);
  });

  it('refuse une reprise sans profil ou sans formation', async () => {
    const noProfile = sequence([[]]);
    await expect(
      replanFormationAfterResume(
        tx(noProfile),
        USER,
        FORMATION,
        NOW,
        new TestClock(NOW.toISOString()),
      ),
    ).rejects.toThrow('Profil introuvable pour la replanification.');

    const noFormation = sequence([
      [{ timezone: 'UTC', hours_per_day: 2, study_days: [1], preferred_slots: ['matin'] }],
      [],
    ]);
    await expect(
      replanFormationAfterResume(
        tx(noFormation),
        USER,
        FORMATION,
        NOW,
        new TestClock(NOW.toISOString()),
      ),
    ).rejects.toThrow('Formation introuvable pour la replanification.');
  });
});
