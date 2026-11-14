// Persistence of the automation engine (SPEC-711 ET-4, ADR-0190).
//
// Every helper runs inside the transaction handed by the caller: the engine writes the settings,
// the actions and the outbox entries of one learner atomically. Creation of an action is reserved
// to the service role of the engine (SPEC-108: the learner only reads and decides); the decisions
// of the learner run under RLS through `userDb`. The unique partial index
// `automation_actions_dedupe_uq` on `(user_id, automation, payload->>'dedupeKey')` makes a
// replayed trigger or a redelivered event a no-op (EF-4, CA-2), decided by the database and
// never by a caught driver error (postgres.js poisons the commit of a failed statement).
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';

import { AppError } from '@learny/core';
import {
  automationActions,
  automationSettings,
  type AutomationAction,
  type AutomationKey,
  type DbTx,
} from '@learny/db';

const uuidSchema = z.uuid();
const automationKeySchema = z.enum([
  'reprise',
  'micro_seance',
  'echauffement',
  'remediation',
  'jeu_lacune',
  'questions_cartes',
  'plafond_quiz',
  'sprint',
  'bilan',
  'pause',
]);
const automationStatusSchema = z.enum([
  'pending_consent',
  'applied',
  'declined',
  'undone',
  'expired',
  'consumed',
]);
const kindSchema = z.string().min(1).max(80);
const summarySchema = z
  .string()
  .min(1)
  .max(300)
  .refine((value) => !/[\r\n]/.test(value), 'une seule ligne attendue');
const payloadSchema = z.record(z.string(), z.unknown());
const instantSchema = z
  .date()
  .refine((value) => !Number.isNaN(value.getTime()), { message: 'instant invalide' });

function instant(value: Date, field: string): Date {
  const parsed = instantSchema.safeParse(value);
  if (!parsed.success) {
    throw new AppError('VALIDATION_FAILED', `Champ « ${field} » invalide.`);
  }
  return parsed.data;
}

function identifier(value: string, field: string): string {
  if (!uuidSchema.safeParse(value).success) {
    throw new AppError('VALIDATION_FAILED', `Champ « ${field} » invalide.`);
  }
  return value;
}

function parse<T>(schema: z.ZodType<T>, value: unknown, field: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? 'valeur invalide';
    throw new AppError('VALIDATION_FAILED', `Champ « ${field} » invalide : ${message}`, {
      errors: [{ path: field, message }],
    });
  }
  return result.data;
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

interface InsertedActionRow {
  [key: string]: unknown;
  id: string;
  user_id: string;
  formation_id: string | null;
  automation: AutomationAction['automation'];
  kind: string;
  summary: string;
  payload: Record<string, unknown>;
  undo_payload: Record<string, unknown> | null;
  requires_consent: boolean;
  status: AutomationAction['status'];
  decided_at: Date | null;
  created_at: Date;
}

function toAction(row: InsertedActionRow): AutomationAction {
  return {
    id: row.id,
    userId: row.user_id,
    formationId: row.formation_id,
    automation: row.automation,
    kind: row.kind,
    summary: row.summary,
    payload: row.payload,
    undoPayload: row.undo_payload,
    requiresConsent: row.requires_consent,
    status: row.status,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
  };
}

/**
 * EF-2, EF-4 — inserts one action with `on conflict do nothing` on the partial unique index
 * `automation_actions_dedupe_uq`: a second proposal with the same `dedupeKey` returns the
 * existing row and `created: false`, without error and without any other write. The conflict
 * target carries the index predicate, so only the rows carrying a key deduplicate (CL-2).
 */
export async function createAutomationActionQuiet(
  tx: DbTx,
  input: CreateAutomationActionQuietInput,
): Promise<CreatedAction> {
  const userId = identifier(input.userId, 'userId');
  const formationId =
    input.formationId === undefined || input.formationId === null
      ? null
      : identifier(input.formationId, 'formationId');
  const automation = parse(automationKeySchema, input.automation, 'automation');
  const kind = parse(kindSchema, input.kind, 'kind');
  const summary = parse(summarySchema, input.summary, 'summary');
  const payload = parse(payloadSchema, input.payload ?? {}, 'payload');
  const undoPayload =
    input.undoPayload === undefined || input.undoPayload === null
      ? null
      : parse(payloadSchema, input.undoPayload, 'undoPayload');
  const requiresConsent = input.requiresConsent ?? false;
  const status = parse(
    automationStatusSchema,
    input.requiresConsent ? 'pending_consent' : 'applied',
    'status',
  );
  const decidedAt =
    input.decidedAt === undefined || input.decidedAt === null
      ? null
      : instant(input.decidedAt, 'decidedAt');
  const createdAt = input.createdAt === undefined ? null : instant(input.createdAt, 'createdAt');

  if (status === 'pending_consent' && decidedAt !== null) {
    throw new AppError(
      'VALIDATION_FAILED',
      'Champ « decidedAt » invalide : une action en attente n’a pas encore de décision.',
    );
  }

  const rows = await tx.execute<InsertedActionRow>(sql`
    insert into public.automation_actions
      (user_id, formation_id, automation, kind, summary, payload, undo_payload,
       requires_consent, status, decided_at, created_at)
    values (
      ${userId}::uuid,
      ${formationId}::uuid,
      ${automation}::automation_key,
      ${kind},
      ${summary},
      ${JSON.stringify(payload)}::jsonb,
      ${undoPayload === null ? null : JSON.stringify(undoPayload)}::jsonb,
      ${requiresConsent},
      ${status}::automation_status,
      ${decidedAt === null ? null : decidedAt.toISOString()}::timestamptz,
      ${createdAt === null ? null : createdAt.toISOString()}::timestamptz
    )
    on conflict (user_id, automation, (payload ->> 'dedupeKey')) where payload ? 'dedupeKey'
    do nothing
    returning id, user_id, formation_id, automation, kind, summary, payload, undo_payload,
              requires_consent, status, decided_at, created_at
  `);
  const row = rows[0];
  if (row !== undefined) return { action: toAction(row), created: true };
  const dedupeKey = typeof payload.dedupeKey === 'string' ? payload.dedupeKey : null;
  if (dedupeKey === null) throw new AppError('INTERNAL_ERROR', 'Action non créée.');
  const existing = await findAutomationActionByDedupeKey(tx, { userId, automation, dedupeKey });
  if (existing === null) throw new AppError('INTERNAL_ERROR', 'Action non créée.');
  return { action: existing, created: false };
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
