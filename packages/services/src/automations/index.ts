// Persistence of the automation engine (SPEC-711 ET-4, ADR-0190).
//
// Every helper runs inside the transaction handed by the caller: the engine writes the settings,
// the actions and the outbox entries of one learner atomically. Creation of an action is reserved
// to the service role of the engine (SPEC-108, `automation_actions_owner_insert`); the decisions
// of the learner run under RLS through `userDb`. The unique partial index
// `automation_actions_dedupe_uq` on `(user_id, automation, payload->>'dedupeKey')` makes a
// replayed trigger or a redelivered event a no-op (EF-4, CL-2).
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';

import { AppError } from '@learny/core';
import {
  automationActions,
  automationSettings,
  createAutomationAction,
  type AutomationAction,
  type AutomationKey,
  type CreateAutomationActionInput,
  type DbTx,
} from '@learny/db';

const instantSchema = z.date().refine((value) => !Number.isNaN(value.getTime()), {
  message: 'instant invalide',
});

function instant(value: Date, field: string): Date {
  const parsed = instantSchema.safeParse(value);
  if (!parsed.success) {
    throw new AppError('VALIDATION_FAILED', `Champ « ${field} » invalide.`);
  }
  return parsed.data;
}

export type AutomationSettingsRow = typeof automationSettings.$inferSelect;
export type AutomationActionRow = AutomationAction;

/** All the settings rows of one learner (at most ten; the missing ones fall back to defaults). */
export async function readAutomationSettings(
  tx: DbTx,
  userId: string,
): Promise<AutomationSettingsRow[]> {
  return tx
    .select()
    .from(automationSettings)
    .where(eq(automationSettings.userId, userId))
    .orderBy(automationSettings.key);
}

export interface UpsertAutomationSettingInput {
  userId: string;
  key: AutomationKey;
  enabled: boolean;
  params: Record<string, unknown>;
  now: Date;
}

/** EF-3 — validates and upserts one setting row; the caller validated `params` against the schema. */
export async function upsertAutomationSetting(
  tx: DbTx,
  input: UpsertAutomationSettingInput,
): Promise<AutomationSettingsRow> {
  const now = instant(input.now, 'now');
  const [row] = await tx
    .insert(automationSettings)
    .values({
      userId: input.userId,
      key: input.key,
      enabled: input.enabled,
      params: input.params,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [automationSettings.userId, automationSettings.key],
      set: { enabled: input.enabled, params: input.params, updatedAt: now },
    })
    .returning();
  if (row === undefined) throw new AppError('INTERNAL_ERROR', 'Réglage non enregistré.');
  return row;
}

export interface ActivePause {
  startsOn: string;
  endsOn: string;
}

/** CL-5 — the active global pause of the learner, when it covers the given local civil day. */
export async function readActivePause(
  tx: DbTx,
  userId: string,
  localDay: string,
): Promise<ActivePause | null> {
  const rows = await tx.execute<{ starts_on: string; ends_on: string }>(sql`
    select starts_on::text as starts_on, ends_on::text as ends_on
    from public.pauses
    where user_id = ${userId}::uuid
      and status = 'active'
      and ${localDay} between starts_on and ends_on
    limit 1
  `);
  const row = rows[0];
  return row === undefined ? null : { startsOn: row.starts_on, endsOn: row.ends_on };
}

export interface CreateAutomationActionQuietInput {
  userId: string;
  formationId?: string | null;
  automation: AutomationKey;
  kind: string;
  summary: string;
  payload?: Record<string, unknown>;
  undoPayload?: Record<string, unknown> | null;
  requiresConsent?: boolean;
  decidedAt?: Date | null;
  createdAt?: Date;
}

export interface CreatedAction {
  action: AutomationAction | null;
  created: boolean;
}

const DEDUPE_CONSTRAINT = 'automation_actions_dedupe_uq';

function isDedupeViolation(error: unknown): boolean {
  // postgres.js raises the driver error directly; drizzle may wrap it in a `DrizzleQueryError`.
  let current: unknown = error;
  for (let depth = 0; depth < 3 && typeof current === 'object' && current !== null; depth += 1) {
    const candidate = current as { code?: unknown; constraint_name?: unknown; cause?: unknown };
    if (candidate.code === '23505' && candidate.constraint_name === DEDUPE_CONSTRAINT) return true;
    current = candidate.cause;
  }
  return false;
}

/** Reads the existing action of a `(user, automation, dedupeKey)` triple, if any. */
export async function findAutomationActionByDedupeKey(
  tx: DbTx,
  input: { userId: string; automation: AutomationKey; dedupeKey: string },
): Promise<AutomationAction | null> {
  const rows = await tx
    .select()
    .from(automationActions)
    .where(
      and(
        eq(automationActions.userId, input.userId),
        eq(automationActions.automation, input.automation),
        sql`${automationActions.payload} ->> 'dedupeKey' = ${input.dedupeKey}`,
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * EF-2, EF-4 — inserts one action; a second proposal with the same `dedupeKey` returns the
 * existing row and `created: false`, without error and without any other write.
 */
export async function createAutomationActionQuiet(
  tx: DbTx,
  input: CreateAutomationActionInput,
): Promise<CreatedAction> {
  try {
    const action = await createAutomationAction(tx, input);
    return { action, created: true };
  } catch (error) {
    if (!isDedupeViolation(error)) throw error;
    const dedupeKey =
      input.payload !== undefined && typeof input.payload.dedupeKey === 'string'
        ? input.payload.dedupeKey
        : null;
    if (dedupeKey === null) throw error;
    const action = await findAutomationActionByDedupeKey(tx, {
      userId: input.userId,
      automation: input.automation,
      dedupeKey,
    });
    if (action === null) throw error;
    return { action, created: false };
  }
}

export interface AutomationActionFilters {
  userId: string;
  status?: AutomationAction['status'] | undefined;
  kind?: string | undefined;
  automation?: AutomationKey | undefined;
  formationId?: string | undefined;
  since?: Date | undefined;
  limit: number;
  cursorK?: string | number | null | undefined;
  cursorId?: string | null | undefined;
}

export interface AutomationActionPage {
  rows: AutomationAction[];
  nextCursorK: string | null;
  nextCursorId: string | null;
}

/** ET-5 — one filtered page of the journal, newest first, stable key `(created_at desc, id desc)`. */
export async function listAutomationActionsFiltered(
  tx: DbTx,
  input: AutomationActionFilters,
): Promise<AutomationActionPage> {
  const since = input.since === undefined ? undefined : instant(input.since, 'since');
  const conditions = [eq(automationActions.userId, input.userId)];
  if (input.status !== undefined) conditions.push(eq(automationActions.status, input.status));
  if (input.kind !== undefined) conditions.push(eq(automationActions.kind, input.kind));
  if (input.automation !== undefined) {
    conditions.push(eq(automationActions.automation, input.automation));
  }
  if (input.formationId !== undefined) {
    conditions.push(eq(automationActions.formationId, input.formationId));
  }
  if (since !== undefined) conditions.push(gte(automationActions.createdAt, since));
  if (input.cursorK !== undefined && input.cursorId !== undefined) {
    conditions.push(
      sql`(${automationActions.createdAt}, ${automationActions.id}) < (${String(input.cursorK)}::timestamptz, ${input.cursorId}::uuid)`,
    );
  }
  const rows = await tx
    .select()
    .from(automationActions)
    .where(and(...conditions))
    .orderBy(desc(automationActions.createdAt), desc(automationActions.id))
    .limit(input.limit + 1);
  const page = rows.slice(0, input.limit);
  const extra = rows[input.limit];
  return {
    rows: page,
    nextCursorK: extra === undefined ? null : extra.createdAt.toISOString(),
    nextCursorId: extra === undefined ? null : extra.id,
  };
}
