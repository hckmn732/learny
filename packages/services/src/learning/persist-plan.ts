// Idempotent persistence of a planner result (SPEC-411 EF-4, ET-3; ADR-0149, ADR-0288).
//
// The planner is pure and returns stable `slotId` values. `persistPlan` reconciles them with the
// learner's `schedule_slots` under a `planner:<user_id>` advisory lock: a computed future slot is
// created or updated, a computed slot missing from the new plan is cancelled, and completed,
// missed, moved or learner/automation slots are never touched. Replaying the same revision is a
// no-op. No event is emitted here: the planner result is a request, not a domain fact; SPEC-705
// owns the agenda notifications.
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { PlanPersistenceSummarySchema, type PlanPersistenceSummary } from '@learny/contracts';
import { AppError, type Result } from '@learny/core';
import { schema } from '@learny/db';
import type { PlanResult, PlannedSlot } from '@learny/learning-engine';

import type { ServiceContext } from '../context';
import { requireUser, toResult } from '../resources/result';

const { scheduleSlots } = schema;

const SLOT_KINDS = [
  'contributions',
  'course',
  'exercise',
  'validation_quiz',
  'global_quiz',
  'revision',
  'buffer',
  'sprint',
  'mock_exam',
  'warmup',
  'micro_session',
  'weekly_review',
] as const;
const SLOT_STATUSES = ['planned', 'done', 'missed', 'moved', 'cancelled'] as const;
const SLOT_CREATORS = ['planner', 'automation', 'learner'] as const;

const plannerSlotSchema = z
  .object({
    slotId: z.string().min(1).max(200),
    formationId: z.uuid().nullable(),
    moduleId: z.uuid().nullable(),
    kind: z.enum(SLOT_KINDS),
    title: z.string().min(1).max(200),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    status: z.enum(SLOT_STATUSES),
    createdBy: z.enum(SLOT_CREATORS),
    movedFromId: z.uuid().nullable(),
  })
  .strict();

const planInputSchema = z.object({
  formationId: z.uuid(),
  revisionKey: z.string().min(1).max(120),
});

interface ExistingSlot {
  [key: string]: unknown;
  id: string;
  planner_key: string | null;
  kind: string;
  title: string;
  module_id: string | null;
  starts_at: Date | string;
  ends_at: Date | string;
  status: string;
  created_by: string;
}

function slotList(plan: PlanResult | readonly PlannedSlot[]): readonly PlannedSlot[] {
  return 'slots' in plan ? plan.slots : plan;
}

function sameInstant(left: string, right: Date | string): boolean {
  return new Date(left).getTime() === new Date(right).getTime();
}

/**
 * EF-4, ET-3 — persists the future slots of one formation. The summary counts created, updated,
 * unchanged, cancelled and preserved rows; `revisionKey` is the caller's plan revision and is
 * returned unchanged so a caller can journal it.
 */
export async function persistPlan(
  ctx: ServiceContext,
  formationId: string,
  plan: PlanResult | readonly PlannedSlot[],
  revisionKey: string,
): Promise<Result<PlanPersistenceSummary>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const input = planInputSchema.parse({ formationId, revisionKey });
    const slots = slotList(plan).map((slot) => plannerSlotSchema.parse(slot));
    return db.run(async (tx) => {
      await tx.execute(sql`
        select pg_advisory_xact_lock(hashtextextended('planner:' || ${userId}, 0))
      `);
      const formation = await tx.execute<{ id: string }>(sql`
        select id::text as id from public.formations where id = ${input.formationId}::uuid
      `);
      if (formation[0] === undefined) {
        throw new AppError('NOT_FOUND', 'Formation introuvable.');
      }

      const existing = await tx.execute<ExistingSlot>(sql`
        select
          id::text as id,
          planner_key,
          kind::text as kind,
          title,
          module_id::text as module_id,
          starts_at,
          ends_at,
          status::text as status,
          created_by::text as created_by
        from public.schedule_slots
        where user_id = ${userId}::uuid
          and formation_id = ${input.formationId}::uuid
          and planner_key is not null
      `);
      const byKey = new Map(
        existing
          .filter((row) => row.planner_key !== null)
          .map((row) => [row.planner_key as string, row]),
      );

      const now = ctx.clock.now();
      const future = slots.filter(
        (slot) =>
          slot.formationId === input.formationId &&
          new Date(slot.startsAt).getTime() >= now.getTime(),
      );
      const desired = new Set<string>();
      let created = 0;
      let updated = 0;
      let unchanged = 0;
      let preserved = 0;

      for (const slot of future) {
        desired.add(slot.slotId);
        const current = byKey.get(slot.slotId);
        if (current === undefined) {
          await tx.insert(scheduleSlots).values({
            userId,
            formationId: input.formationId,
            moduleId: slot.moduleId,
            kind: slot.kind,
            title: slot.title,
            startsAt: new Date(slot.startsAt),
            endsAt: new Date(slot.endsAt),
            status: 'planned',
            createdBy: 'planner',
            plannerKey: slot.slotId,
          });
          created += 1;
          continue;
        }
        if (current.status !== 'planned' || current.created_by !== 'planner') {
          preserved += 1;
          continue;
        }
        const changed =
          current.kind !== slot.kind ||
          current.title !== slot.title ||
          current.module_id !== slot.moduleId ||
          !sameInstant(slot.startsAt, current.starts_at) ||
          !sameInstant(slot.endsAt, current.ends_at);
        if (!changed) {
          unchanged += 1;
          continue;
        }
        await tx
          .update(scheduleSlots)
          .set({
            moduleId: slot.moduleId,
            kind: slot.kind,
            title: slot.title,
            startsAt: new Date(slot.startsAt),
            endsAt: new Date(slot.endsAt),
          })
          .where(
            and(
              eq(scheduleSlots.id, current.id),
              eq(scheduleSlots.userId, userId),
              eq(scheduleSlots.status, 'planned'),
            ),
          );
        updated += 1;
      }

      let cancelled = 0;
      for (const row of existing) {
        if (row.status !== 'planned' || row.created_by !== 'planner') continue;
        if (new Date(row.starts_at).getTime() < now.getTime()) continue;
        if (row.planner_key !== null && desired.has(row.planner_key)) continue;
        await tx
          .update(scheduleSlots)
          .set({ status: 'cancelled' })
          .where(
            and(
              eq(scheduleSlots.id, row.id),
              eq(scheduleSlots.userId, userId),
              eq(scheduleSlots.status, 'planned'),
            ),
          );
        cancelled += 1;
      }

      return PlanPersistenceSummarySchema.parse({
        formationId: input.formationId,
        revisionKey: input.revisionKey,
        created,
        updated,
        unchanged,
        cancelled,
        preserved,
      });
    });
  });
}
