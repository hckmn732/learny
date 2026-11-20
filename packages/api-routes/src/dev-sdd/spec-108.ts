// Owner-role reads of the SPEC-108 demonstration, kept under `_dev` so the ESLint boundary of
// SPEC-101 ET-6 stays the only place allowed to use `serviceDb` in the web app (ADR-0049).
//
// The whole demonstration runs inside `withRollback`: a formation, five slots covering the five
// statuses of BR-AGE-04 (including a moved origin and its successor), one action waiting for
// consent, a daily activity built by two upserts and two milestones disappear at the end of the
// request. The fixture is deterministic and uses the fixed clock of ADR-0047.
import { type DbTx } from '@learny/db';
import {
  createAutomationAction,
  createScheduleSlot,
  getDailyActivity,
  listAutomationActions,
  listMilestones,
  listScheduleSlots,
  moveScheduleSlot,
  recordMilestone,
  setScheduleSlotStatus,
  upsertDailyActivity,
  type AutomationStatus,
  type SlotCreator,
  type SlotKind,
  type SlotStatus,
} from '@learny/db';
import { createTestProgramme, createTestUser, withRollback } from '@learny/db/testing';

const FIXED = new Date('2026-11-11T12:20:00Z');
const DAY = '2026-11-11';

export interface Spec108Slot {
  id: string;
  title: string;
  kind: SlotKind;
  status: SlotStatus;
  createdBy: SlotCreator;
  startsAt: string;
  endsAt: string;
  /** Start instant of the origin when this slot is the successor of a move. */
  movedFromStartsAt: string | null;
}

export interface Spec108Action {
  automation: string;
  kind: string;
  summary: string;
  status: AutomationStatus;
  requiresConsent: boolean;
  createdAt: string;
  payload: Record<string, unknown>;
}

export interface Spec108Daily {
  day: string;
  minutes: number;
  qualifying: boolean;
  sources: string[];
}

export interface Spec108Milestone {
  key: string;
  refId: string | null;
  achievedAt: string;
}

export interface Spec108Data {
  slots: Spec108Slot[];
  action: Spec108Action | null;
  daily: Spec108Daily | null;
  milestones: Spec108Milestone[];
}

async function seedSlots(tx: DbTx, userId: string, formationId: string, moduleId: string) {
  const base = { userId, formationId, moduleId, createdBy: 'planner' as const };
  const origin = await createScheduleSlot(tx, {
    ...base,
    kind: 'course',
    title: 'Lecture du cours',
    startsAt: new Date('2026-11-11T17:00:00Z'),
    endsAt: new Date('2026-11-11T18:00:00Z'),
  });
  const moved = await moveScheduleSlot(tx, {
    userId,
    slotId: origin.id,
    startsAt: new Date('2026-11-12T17:00:00Z'),
    endsAt: new Date('2026-11-12T18:00:00Z'),
    createdBy: 'learner',
  });

  const done = await createScheduleSlot(tx, {
    ...base,
    kind: 'validation_quiz',
    title: 'Quiz de validation · module 1',
    startsAt: new Date('2026-11-10T17:00:00Z'),
    endsAt: new Date('2026-11-10T17:30:00Z'),
  });
  await setScheduleSlotStatus(tx, { userId, slotId: done.id, status: 'done' });

  const missed = await createScheduleSlot(tx, {
    ...base,
    kind: 'exercise',
    title: 'Exercice pratique',
    startsAt: new Date('2026-11-09T17:00:00Z'),
    endsAt: new Date('2026-11-09T17:30:00Z'),
  });
  await setScheduleSlotStatus(tx, { userId, slotId: missed.id, status: 'missed' });

  const cancelled = await createScheduleSlot(tx, {
    ...base,
    kind: 'revision',
    title: 'Révision du soir',
    startsAt: new Date('2026-11-08T18:00:00Z'),
    endsAt: new Date('2026-11-08T18:30:00Z'),
  });
  await setScheduleSlotStatus(tx, { userId, slotId: cancelled.id, status: 'cancelled' });

  return moved.current.id;
}

/** Full demonstration payload; every read is rolled back at the end of the request. */
export async function loadSpec108Demo(): Promise<Spec108Data> {
  return withRollback(async (tx) => {
    const user = await createTestUser(tx, { firstName: 'Alex' });
    const programme = await createTestProgramme(tx, user.id, {
      modules: 1,
      chaptersPerModule: 1,
      notionsPerChapter: 1,
    });
    const moduleId = programme.moduleIds[0];
    if (moduleId === undefined) throw new Error('programme de démonstration incomplet');

    const successorId = await seedSlots(tx, user.id, programme.formationId, moduleId);

    await upsertDailyActivity(tx, {
      userId: user.id,
      day: DAY,
      minutes: 30,
      qualifying: true,
      sources: ['attempt:1'],
    });
    await upsertDailyActivity(tx, {
      userId: user.id,
      day: DAY,
      minutes: 15,
      qualifying: true,
      sources: ['slot:2'],
    });

    await recordMilestone(tx, {
      userId: user.id,
      formationId: programme.formationId,
      key: 'module_validated',
      refId: moduleId,
      achievedAt: new Date('2026-11-09T17:31:00Z'),
    });
    await recordMilestone(tx, {
      userId: user.id,
      key: 'streak_30',
      achievedAt: new Date('2026-11-10T07:00:00Z'),
    });

    await createAutomationAction(tx, {
      userId: user.id,
      formationId: programme.formationId,
      automation: 'reprise',
      kind: 'slot_rescheduled',
      summary: 'Votre séance d’hier est proposée demain à 18 h : un accord est attendu.',
      payload: {
        slotId: successorId,
        from: '2026-11-11T17:00:00.000Z',
        to: '2026-11-12T17:00:00.000Z',
      },
      undoPayload: { slotId: successorId },
      requiresConsent: true,
      createdAt: FIXED,
    });

    const slots = await listScheduleSlots(tx, {
      userId: user.id,
      from: new Date('2026-11-08T00:00:00Z'),
      to: new Date('2026-11-14T00:00:00Z'),
    });
    const byId = new Map(slots.map((slot) => [slot.id, slot]));
    const daily = await getDailyActivity(tx, { userId: user.id, day: DAY });
    const actions = await listAutomationActions(tx, { userId: user.id, limit: 5 });
    const milestones = await listMilestones(tx, { userId: user.id });
    const [firstAction] = actions;
    if (firstAction === undefined) throw new Error('action de démonstration absente');

    return {
      slots: slots.map((slot) => ({
        id: slot.id,
        title: slot.title,
        kind: slot.kind,
        status: slot.status,
        createdBy: slot.createdBy,
        startsAt: slot.startsAt.toISOString(),
        endsAt: slot.endsAt.toISOString(),
        movedFromStartsAt:
          slot.movedFromId === null
            ? null
            : (byId.get(slot.movedFromId)?.startsAt.toISOString() ?? null),
      })),
      action: {
        automation: firstAction.automation,
        kind: firstAction.kind,
        summary: firstAction.summary,
        status: firstAction.status,
        requiresConsent: firstAction.requiresConsent,
        createdAt: firstAction.createdAt.toISOString(),
        payload: firstAction.payload,
      },
      daily:
        daily === null
          ? null
          : {
              day: daily.day,
              minutes: daily.minutes,
              qualifying: daily.qualifying,
              sources: daily.sources,
            },
      milestones: milestones.map((milestone) => ({
        key: milestone.key,
        refId: milestone.refId,
        achievedAt: milestone.achievedAt.toISOString(),
      })),
    };
  });
}
