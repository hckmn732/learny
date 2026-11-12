// Repository of the milestones (SPEC-108 EF-5, EF-6, CL-6).
//
// A milestone is recorded once per `(user_id, key, ref_id)`; the unique constraint uses
// `nulls not distinct` so `streak_30` (whose `ref_id` is null) is protected as well. Inserting the
// same achievement twice is idempotent and returns the existing row, which keeps the future
// notification (SPEC-109) unique (CL-6).
import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { AppError } from '@learny/core';

import type { DbTx } from '../client';
import { MILESTONE_KEYS, milestones, type Milestone, type MilestoneKey } from '../schema/planning';

const uuidSchema = z.uuid();
const milestoneKeySchema = z.enum(MILESTONE_KEYS);
const limitSchema = z.int().min(1).max(100);
const offsetSchema = z.int().min(0);
const instantSchema = z.date().refine((value) => !Number.isNaN(value.getTime()), {
  message: 'instant invalide',
});

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

export interface RecordMilestoneInput {
  userId: string;
  formationId?: string | null;
  key: MilestoneKey;
  refId?: string | null;
  achievedAt: Date;
}

export interface RecordedMilestone {
  milestone: Milestone;
  created: boolean;
}

/**
 * EF-5, CL-6 — records an achievement once. The conflict target is the unique index; an existing
 * row is returned untouched, including its original `achieved_at`.
 */
export async function recordMilestone(
  tx: DbTx,
  input: RecordMilestoneInput,
): Promise<RecordedMilestone> {
  const userId = identifier(input.userId, 'userId');
  const formationId =
    input.formationId === undefined || input.formationId === null
      ? null
      : identifier(input.formationId, 'formationId');
  const key = parse(milestoneKeySchema, input.key, 'key');
  const refId =
    input.refId === undefined || input.refId === null ? null : identifier(input.refId, 'refId');
  const achievedAt = parse(instantSchema, input.achievedAt, 'achievedAt');

  const inserted = await tx
    .insert(milestones)
    .values({ userId, formationId, key, refId, achievedAt })
    .onConflictDoNothing({ target: [milestones.userId, milestones.key, milestones.refId] })
    .returning();
  const created = inserted[0];
  if (created !== undefined) return { milestone: created, created: true };

  const existing = await tx
    .select()
    .from(milestones)
    .where(
      and(
        eq(milestones.userId, userId),
        eq(milestones.key, key),
        refId === null ? isNull(milestones.refId) : eq(milestones.refId, refId),
      ),
    );
  const milestone = existing[0];
  if (milestone === undefined) {
    throw new AppError('INTERNAL_ERROR', 'Jalon introuvable après insertion.');
  }
  return { milestone, created: false };
}

export interface MilestoneRef {
  userId: string;
  milestoneId: string;
}

/** EF-5 — reads one milestone; another learner's identifier yields `null` under `userDb`. */
export async function getMilestone(tx: DbTx, input: MilestoneRef): Promise<Milestone | null> {
  const userId = identifier(input.userId, 'userId');
  const milestoneId = identifier(input.milestoneId, 'milestoneId');
  const rows = await tx
    .select()
    .from(milestones)
    .where(and(eq(milestones.id, milestoneId), eq(milestones.userId, userId)));
  return rows[0] ?? null;
}

export interface MilestonePageInput {
  userId: string;
  limit?: number;
  offset?: number;
}

/** EF-6 — the milestone list of one learner, newest first, with a stable page. */
export async function listMilestones(tx: DbTx, input: MilestonePageInput): Promise<Milestone[]> {
  const userId = identifier(input.userId, 'userId');
  const limit = parse(limitSchema, input.limit ?? 20, 'limit');
  const offset = parse(offsetSchema, input.offset ?? 0, 'offset');
  return tx
    .select()
    .from(milestones)
    .where(eq(milestones.userId, userId))
    .orderBy(desc(milestones.achievedAt), desc(milestones.id))
    .limit(limit)
    .offset(offset);
}
