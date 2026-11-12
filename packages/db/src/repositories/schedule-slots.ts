// Repositories of the agenda (SPEC-108 EF-1, EF-2, EF-6, CL-1 to CL-3).
//
// Every function takes the caller's transaction: a service composes a move and commits once, so the
// old slot, the new slot and their statuses stay atomic (EF-2). `moveSlot` locks the origin row
// (`select ... for update`) before checking its status, which serialises two concurrent moves of the
// same slot; the partial unique index `schedule_slots_moved_from_active_unique` and the SQL trigger
// `schedule_slots_move_consistency` keep the same invariant for a direct SQL writer (CL-2, CL-3).
// Instants stay UTC; no function reads the system clock.
import { and, asc, eq, gt, gte, lt, lte } from 'drizzle-orm';
import { z } from 'zod';

import { AppError } from '@learny/core';

import type { DbTx } from '../client';
import {
  MOVABLE_SLOT_STATUSES,
  SLOT_CREATORS,
  SLOT_KINDS,
  SLOT_STATUSES,
  scheduleSlots,
  slotWindowSchema,
  type ScheduleSlot,
  type SlotCreator,
  type SlotKind,
  type SlotStatus,
} from '../schema/planning';

const uuidSchema = z.uuid();
const slotKindSchema = z.enum(SLOT_KINDS);
const slotStatusSchema = z.enum(SLOT_STATUSES);
const slotCreatorSchema = z.enum(SLOT_CREATORS);
const titleSchema = z.string().min(1).max(200);
const metaSchema = z.string().max(1000).nullable();
const instantSchema = z.date().refine((value) => !Number.isNaN(value.getTime()), {
  message: 'instant invalide',
});

/** Statuses a slot can reach from a live one; terminal statuses never change again. */
const STATUS_TRANSITIONS: Record<SlotStatus, readonly SlotStatus[]> = {
  planned: ['done', 'missed', 'cancelled'],
  missed: ['done', 'cancelled'],
  done: [],
  moved: [],
  cancelled: [],
};

function validationError(field: string, issues: string[]): AppError {
  return new AppError('VALIDATION_FAILED', `Champ « ${field} » invalide : ${issues.join(' ; ')}`, {
    errors: issues.map((message) => ({ path: field, message })),
  });
}

function parse<T>(schema: z.ZodType<T>, value: unknown, field: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw validationError(
      field,
      result.error.issues.map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join('.') : '(racine)';
        return `${path} : ${issue.message}`;
      }),
    );
  }
  return result.data;
}

function identifier(value: string, field: string): string {
  return parse(uuidSchema, value, field);
}

function instant(value: Date, field: string): Date {
  return parse(instantSchema, value, field);
}

/** EF-1, CL-1 — refuses a window whose end is not strictly after its start. */
function windowOf(startsAt: Date, endsAt: Date): { startsAt: Date; endsAt: Date } {
  const parsed = slotWindowSchema.safeParse({
    startsAt: instant(startsAt, 'startsAt').toISOString(),
    endsAt: instant(endsAt, 'endsAt').toISOString(),
  });
  if (!parsed.success) {
    throw validationError(
      'endsAt',
      parsed.error.issues.map((issue) => issue.message),
    );
  }
  return { startsAt, endsAt };
}

/**
 * ET-3, EF-6 — formation access is not re-checked here: `formations` has no authenticated policy
 * yet, and group formations arrive with SPEC-111. Personal isolation is guaranteed by the
 * `schedule_slots` owner policy; the move trigger keeps owner and formation consistent.
 */

export interface ScheduleSlotRangeInput {
  userId: string;
  /** Inclusive lower bound of the agenda window. */
  from: Date;
  /** Exclusive upper bound of the agenda window. */
  to: Date;
}

/**
 * EF-6, ET-1 — slots of one learner intersecting `[from, to)`, ordered by start instant. The index
 * `schedule_slots_user_id_starts_at_idx` serves the learner predicate and the upper bound.
 */
export async function listScheduleSlots(
  tx: DbTx,
  input: ScheduleSlotRangeInput,
): Promise<ScheduleSlot[]> {
  const userId = identifier(input.userId, 'userId');
  const from = instant(input.from, 'from');
  const to = instant(input.to, 'to');
  if (to.getTime() <= from.getTime()) {
    throw validationError('to', ['la borne de fin doit être postérieure à la borne de début']);
  }
  return tx
    .select()
    .from(scheduleSlots)
    .where(
      and(
        eq(scheduleSlots.userId, userId),
        lt(scheduleSlots.startsAt, to),
        gt(scheduleSlots.endsAt, from),
      ),
    )
    .orderBy(asc(scheduleSlots.startsAt), asc(scheduleSlots.id));
}

export interface ScheduleSlotRef {
  userId: string;
  slotId: string;
}

/** EF-2 — reads one slot; another learner's identifier yields `null` under `userDb`. */
export async function getScheduleSlot(
  tx: DbTx,
  input: ScheduleSlotRef,
): Promise<ScheduleSlot | null> {
  const userId = identifier(input.userId, 'userId');
  const slotId = identifier(input.slotId, 'slotId');
  const rows = await tx
    .select()
    .from(scheduleSlots)
    .where(and(eq(scheduleSlots.id, slotId), eq(scheduleSlots.userId, userId)));
  return rows[0] ?? null;
}

export interface CreateScheduleSlotInput {
  userId: string;
  formationId: string;
  moduleId?: string | null;
  kind: SlotKind;
  title: string;
  meta?: string | null;
  startsAt: Date;
  endsAt: Date;
  activityId?: string | null;
  createdBy: SlotCreator;
  groupMilestone?: boolean;
}

/** EF-1 — creates a planned slot after validating its kind, title and window (CL-1). */
export async function createScheduleSlot(
  tx: DbTx,
  input: CreateScheduleSlotInput,
): Promise<ScheduleSlot> {
  const userId = identifier(input.userId, 'userId');
  const formationId = identifier(input.formationId, 'formationId');
  const moduleId =
    input.moduleId === undefined || input.moduleId === null
      ? null
      : identifier(input.moduleId, 'moduleId');
  const activityId =
    input.activityId === undefined || input.activityId === null
      ? null
      : identifier(input.activityId, 'activityId');
  const kind = parse(slotKindSchema, input.kind, 'kind');
  const title = parse(titleSchema, input.title, 'title');
  const meta = parse(metaSchema, input.meta ?? null, 'meta');
  const createdBy = parse(slotCreatorSchema, input.createdBy, 'createdBy');
  const window = windowOf(input.startsAt, input.endsAt);

  const inserted = await tx
    .insert(scheduleSlots)
    .values({
      userId,
      formationId,
      moduleId,
      kind,
      title,
      meta,
      startsAt: window.startsAt,
      endsAt: window.endsAt,
      activityId,
      createdBy,
      groupMilestone: input.groupMilestone ?? false,
    })
    .returning();
  const slot = inserted[0];
  if (slot === undefined) throw new AppError('INTERNAL_ERROR', 'Créneau non créé.');
  return slot;
}

export interface MoveScheduleSlotInput extends ScheduleSlotRef {
  startsAt: Date;
  endsAt: Date;
  title?: string;
  meta?: string | null;
  /** Who performed the move; a replanning job uses `planner` or `automation`. */
  createdBy?: SlotCreator;
}

export interface MovedScheduleSlot {
  /** The origin, now `moved`. */
  previous: ScheduleSlot;
  /** The new active slot pointing to the origin. */
  current: ScheduleSlot;
}

/** EF-2, CL-2 — a done or cancelled slot can no longer be moved. */
function conflict(status: SlotStatus): AppError {
  return new AppError(
    'CONFLICT',
    status === 'moved'
      ? 'Ce créneau a déjà été déplacé : recharger l’agenda.'
      : 'Ce créneau n’est plus déplaçable : recharger l’agenda.',
  );
}

/**
 * EF-2, CL-2, CL-3 — moves a live slot atomically: locks the origin, refuses a done/cancelled/moved
 * status, marks the origin `moved` and inserts a planned successor that keeps the owner, formation,
 * module and activity and points to the origin. A concurrent move waits on the lock, then sees
 * `moved` and gets `CONFLICT`; the unique partial index is the last line of defence.
 */
export async function moveScheduleSlot(
  tx: DbTx,
  input: MoveScheduleSlotInput,
): Promise<MovedScheduleSlot> {
  const userId = identifier(input.userId, 'userId');
  const slotId = identifier(input.slotId, 'slotId');
  const window = windowOf(input.startsAt, input.endsAt);
  const createdBy = parse(slotCreatorSchema, input.createdBy ?? 'learner', 'createdBy');

  const locked = await tx
    .select()
    .from(scheduleSlots)
    .where(and(eq(scheduleSlots.id, slotId), eq(scheduleSlots.userId, userId)))
    .for('update');
  const previous = locked[0];
  if (previous === undefined) throw new AppError('NOT_FOUND', 'Créneau introuvable.');
  if (!(MOVABLE_SLOT_STATUSES as readonly SlotStatus[]).includes(previous.status)) {
    throw conflict(previous.status);
  }

  const title =
    input.title === undefined ? previous.title : parse(titleSchema, input.title, 'title');
  const meta = input.meta === undefined ? previous.meta : parse(metaSchema, input.meta, 'meta');

  const updatedRows = await tx
    .update(scheduleSlots)
    .set({ status: 'moved' })
    .where(and(eq(scheduleSlots.id, slotId), eq(scheduleSlots.userId, userId)))
    .returning();
  const movedOrigin = updatedRows[0];
  if (movedOrigin === undefined) throw new AppError('NOT_FOUND', 'Créneau introuvable.');

  const inserted = await tx
    .insert(scheduleSlots)
    .values({
      userId,
      formationId: previous.formationId,
      moduleId: previous.moduleId,
      kind: previous.kind,
      title,
      meta,
      startsAt: window.startsAt,
      endsAt: window.endsAt,
      status: 'planned',
      activityId: previous.activityId,
      createdBy,
      movedFromId: previous.id,
      groupMilestone: previous.groupMilestone,
    })
    .returning();
  const current = inserted[0];
  if (current === undefined) throw new AppError('INTERNAL_ERROR', 'Créneau déplacé non créé.');
  return { previous: movedOrigin, current };
}

export interface SetScheduleSlotStatusInput extends ScheduleSlotRef {
  status: Extract<SlotStatus, 'done' | 'missed' | 'cancelled'>;
}

/**
 * EF-2 — moves a live slot to a terminal status. Repeating the same status is idempotent; any other
 * transition outside the state machine is refused with `CONFLICT`.
 */
export async function setScheduleSlotStatus(
  tx: DbTx,
  input: SetScheduleSlotStatusInput,
): Promise<ScheduleSlot> {
  const userId = identifier(input.userId, 'userId');
  const slotId = identifier(input.slotId, 'slotId');
  const status = parse(slotStatusSchema, input.status, 'status');
  if (!(status === 'done' || status === 'missed' || status === 'cancelled')) {
    throw validationError('status', ['done, missed ou cancelled est attendu']);
  }

  const locked = await tx
    .select()
    .from(scheduleSlots)
    .where(and(eq(scheduleSlots.id, slotId), eq(scheduleSlots.userId, userId)))
    .for('update');
  const current = locked[0];
  if (current === undefined) throw new AppError('NOT_FOUND', 'Créneau introuvable.');
  if (current.status === status) return current;
  if (!STATUS_TRANSITIONS[current.status].includes(status)) {
    throw conflict(current.status);
  }

  const updated = await tx
    .update(scheduleSlots)
    .set({ status })
    .where(and(eq(scheduleSlots.id, slotId), eq(scheduleSlots.userId, userId)))
    .returning();
  const slot = updated[0];
  if (slot === undefined) throw new AppError('NOT_FOUND', 'Créneau introuvable.');
  return slot;
}

export interface SlotDayRangeInput {
  userId: string;
  from: Date;
  to: Date;
}

/** EF-6 — compact agenda projection used by the weekly view (start and end only). */
export async function listScheduleSlotWindows(
  tx: DbTx,
  input: SlotDayRangeInput,
): Promise<Array<Pick<ScheduleSlot, 'id' | 'startsAt' | 'endsAt' | 'status'>>> {
  const userId = identifier(input.userId, 'userId');
  const from = instant(input.from, 'from');
  const to = instant(input.to, 'to');
  if (to.getTime() <= from.getTime()) {
    throw validationError('to', ['la borne de fin doit être postérieure à la borne de début']);
  }
  return tx
    .select({
      id: scheduleSlots.id,
      startsAt: scheduleSlots.startsAt,
      endsAt: scheduleSlots.endsAt,
      status: scheduleSlots.status,
    })
    .from(scheduleSlots)
    .where(
      and(
        eq(scheduleSlots.userId, userId),
        gte(scheduleSlots.endsAt, from),
        lte(scheduleSlots.startsAt, to),
      ),
    )
    .orderBy(asc(scheduleSlots.startsAt), asc(scheduleSlots.id));
}
