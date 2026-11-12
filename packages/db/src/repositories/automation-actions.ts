// Repositories of the automation journal (SPEC-108 EF-3, EF-6, CL-4; BR-AUT-11/12).
//
// The automation engine (SPEC-711) creates an action through the service role: it names the
// automation, explains the decision in one line, stores the payload needed to apply it and the
// inverse payload needed to undo it. The learner reads the journal newest first and can accept,
// decline, undo or consume an action. `undoAutomationAction` refuses an applied action without an
// `undo_payload` (CL-4) and keeps the historical row readable.
import { and, asc, desc, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';

import { AppError } from '@learny/core';

import type { DbTx } from '../client';
import { AUTOMATION_KEYS } from '../schema/identity';
import {
  AUTOMATION_STATUSES,
  automationActions,
  automationPayloadSchema,
  automationSummarySchema,
  type AutomationAction,
  type AutomationKey,
  type AutomationStatus,
} from '../schema/planning';

const uuidSchema = z.uuid();
const automationKeySchema = z.enum(AUTOMATION_KEYS);
const automationStatusSchema = z.enum(AUTOMATION_STATUSES);
const kindSchema = z.string().min(1).max(80);
const instantSchema = z.date().refine((value) => !Number.isNaN(value.getTime()), {
  message: 'instant invalide',
});
const limitSchema = z.int().min(1).max(100);
const offsetSchema = z.int().min(0);
const decisionSchema = z.enum(['accept', 'decline']);

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

export interface AutomationActionRef {
  userId: string;
  actionId: string;
}

/** EF-3, EF-6 — reads one action; another learner's identifier yields `null` under `userDb`. */
export async function getAutomationAction(
  tx: DbTx,
  input: AutomationActionRef,
): Promise<AutomationAction | null> {
  const userId = identifier(input.userId, 'userId');
  const actionId = identifier(input.actionId, 'actionId');
  const rows = await tx
    .select()
    .from(automationActions)
    .where(and(eq(automationActions.id, actionId), eq(automationActions.userId, userId)));
  return rows[0] ?? null;
}

export interface AutomationActionPageInput {
  userId: string;
  limit?: number;
  offset?: number;
}

/**
 * EF-3, EF-6, BR-AUT-12 — the weekly journal of one learner, newest first, with a stable page
 * (`created_at desc, id desc`) served by `automation_actions_user_id_created_at_idx`.
 */
export async function listAutomationActions(
  tx: DbTx,
  input: AutomationActionPageInput,
): Promise<AutomationAction[]> {
  const userId = identifier(input.userId, 'userId');
  const limit = parse(limitSchema, input.limit ?? 20, 'limit');
  const offset = parse(offsetSchema, input.offset ?? 0, 'offset');
  return tx
    .select()
    .from(automationActions)
    .where(eq(automationActions.userId, userId))
    .orderBy(desc(automationActions.createdAt), desc(automationActions.id))
    .limit(limit)
    .offset(offset);
}

export interface AutomationJournalWindowInput {
  userId: string;
  since: Date;
}

/** BR-AUT-12 — the “N actions cette semaine” counter, from the given instant inclusive. */
export async function countAutomationActions(
  tx: DbTx,
  input: AutomationJournalWindowInput,
): Promise<number> {
  const userId = identifier(input.userId, 'userId');
  const since = instant(input.since, 'since');
  const rows = await tx.execute<{ count: string }>(sql`
    select count(*)::int as count
    from public.automation_actions
    where user_id = ${userId}::uuid
      and created_at >= ${since.toISOString()}::timestamptz
  `);
  return Number(rows[0]?.count ?? '0');
}

export interface CreateAutomationActionInput {
  userId: string;
  formationId?: string | null;
  automation: AutomationKey;
  kind: string;
  summary: string;
  payload?: Record<string, unknown>;
  undoPayload?: Record<string, unknown> | null;
  requiresConsent?: boolean;
  /** Defaults to `pending_consent` when consent is required, `applied` otherwise. */
  status?: AutomationStatus;
  decidedAt?: Date | null;
  /** Explicit instant of the journal entry; the caller's injectable clock (ADR-0047). */
  createdAt?: Date;
}

/**
 * EF-3, ET-5, BR-AUT-11 — creates an action after validating the automation, the one-line summary
 * and both JSON payloads. A required consent starts as `pending_consent`; a decline always carries
 * its decision instant (enforced again by the SQL check).
 */
export async function createAutomationAction(
  tx: DbTx,
  input: CreateAutomationActionInput,
): Promise<AutomationAction> {
  const userId = identifier(input.userId, 'userId');
  const formationId =
    input.formationId === undefined || input.formationId === null
      ? null
      : identifier(input.formationId, 'formationId');
  const automation = parse(automationKeySchema, input.automation, 'automation');
  const kind = parse(kindSchema, input.kind, 'kind');
  const summary = parse(automationSummarySchema, input.summary, 'summary');
  const payload = parse(automationPayloadSchema, input.payload ?? {}, 'payload');
  const undoPayload =
    input.undoPayload === undefined || input.undoPayload === null
      ? null
      : parse(automationPayloadSchema, input.undoPayload, 'undoPayload');
  const requiresConsent = input.requiresConsent ?? false;
  const status = parse(
    automationStatusSchema,
    input.status ?? (requiresConsent ? 'pending_consent' : 'applied'),
    'status',
  );
  const decidedAt =
    input.decidedAt === undefined || input.decidedAt === null
      ? null
      : instant(input.decidedAt, 'decidedAt');
  const createdAt =
    input.createdAt === undefined ? undefined : instant(input.createdAt, 'createdAt');

  // ET-2 — the status, the consent flag and the decision instant stay coherent before the SQL
  // check runs, so the caller receives one clear validation error.
  if (status === 'pending_consent' && !requiresConsent) {
    throw validationError('status', ['une action en attente de consentement doit le requérir']);
  }
  if (status === 'pending_consent' && decidedAt !== null) {
    throw validationError('decidedAt', ['une action en attente n’a pas encore de décision']);
  }
  if (status === 'declined' && decidedAt === null) {
    throw validationError('decidedAt', ['un refus porte l’instant de la décision']);
  }

  const inserted = await tx
    .insert(automationActions)
    .values({
      userId,
      formationId,
      automation,
      kind,
      summary,
      payload,
      undoPayload,
      requiresConsent,
      status,
      decidedAt,
      ...(createdAt === undefined ? {} : { createdAt }),
    })
    .returning();
  const action = inserted[0];
  if (action === undefined) throw new AppError('INTERNAL_ERROR', 'Action non créée.');
  return action;
}

export type AutomationDecision = 'accept' | 'decline';

export interface DecideAutomationActionInput extends AutomationActionRef {
  decision: AutomationDecision;
  decidedAt: Date;
}

/**
 * EF-3, BR-AUT-11 — accepts or declines an action waiting for consent. Repeating the same decision
 * is idempotent; any other status is a conflict that must be reloaded.
 */
export async function decideAutomationAction(
  tx: DbTx,
  input: DecideAutomationActionInput,
): Promise<AutomationAction> {
  const userId = identifier(input.userId, 'userId');
  const actionId = identifier(input.actionId, 'actionId');
  const decidedAt = instant(input.decidedAt, 'decidedAt');
  const decision = parse(decisionSchema, input.decision, 'decision');
  const target: AutomationStatus = decision === 'accept' ? 'applied' : 'declined';

  const locked = await tx
    .select()
    .from(automationActions)
    .where(and(eq(automationActions.id, actionId), eq(automationActions.userId, userId)))
    .for('update');
  const current = locked[0];
  if (current === undefined) throw new AppError('NOT_FOUND', 'Action introuvable.');
  if (current.status === target) return current;
  if (current.status !== 'pending_consent') {
    throw new AppError('CONFLICT', 'Cette action a déjà été traitée : recharger le journal.');
  }

  const updated = await tx
    .update(automationActions)
    .set({ status: target, decidedAt })
    .where(eq(automationActions.id, actionId))
    .returning();
  const action = updated[0];
  if (action === undefined) throw new AppError('NOT_FOUND', 'Action introuvable.');
  return action;
}

export interface UndoAutomationActionInput extends AutomationActionRef {
  undoneAt: Date;
}

/**
 * EF-3, BR-AUT-11, CL-4 — undoes an applied action. A consumed action can no longer be undone; an
 * applied action without `undo_payload` is refused before any write, and the historical row stays
 * readable. Undoing twice is idempotent.
 */
export async function undoAutomationAction(
  tx: DbTx,
  input: UndoAutomationActionInput,
): Promise<AutomationAction> {
  const userId = identifier(input.userId, 'userId');
  const actionId = identifier(input.actionId, 'actionId');
  const undoneAt = instant(input.undoneAt, 'undoneAt');

  const locked = await tx
    .select()
    .from(automationActions)
    .where(and(eq(automationActions.id, actionId), eq(automationActions.userId, userId)))
    .for('update');
  const current = locked[0];
  if (current === undefined) throw new AppError('NOT_FOUND', 'Action introuvable.');
  if (current.status === 'undone') return current;
  if (current.status === 'consumed') {
    throw new AppError(
      'CONFLICT',
      'Cette action a déjà été consommée : elle ne peut plus être annulée.',
    );
  }
  if (current.status !== 'applied') {
    throw new AppError('CONFLICT', 'Seule une action appliquée peut être annulée.');
  }
  if (current.undoPayload === null) {
    throw new AppError(
      'VALIDATION_FAILED',
      'Cette action ne porte pas de charge d’annulation : elle ne peut pas être annulée.',
    );
  }

  const updated = await tx
    .update(automationActions)
    .set({ status: 'undone', decidedAt: undoneAt })
    .where(eq(automationActions.id, actionId))
    .returning();
  const action = updated[0];
  if (action === undefined) throw new AppError('NOT_FOUND', 'Action introuvable.');
  return action;
}

export type ConsumeAutomationActionInput = AutomationActionRef;

/**
 * BR-AUT-11 — marks an applied action as consumed (for example a micro-session the learner did):
 * it can no longer be undone, which is the stated exception of the rule.
 */
export async function consumeAutomationAction(
  tx: DbTx,
  input: ConsumeAutomationActionInput,
): Promise<AutomationAction> {
  const userId = identifier(input.userId, 'userId');
  const actionId = identifier(input.actionId, 'actionId');

  const locked = await tx
    .select()
    .from(automationActions)
    .where(and(eq(automationActions.id, actionId), eq(automationActions.userId, userId)))
    .for('update');
  const current = locked[0];
  if (current === undefined) throw new AppError('NOT_FOUND', 'Action introuvable.');
  if (current.status === 'consumed') return current;
  if (current.status !== 'applied') {
    throw new AppError('CONFLICT', 'Seule une action appliquée peut être consommée.');
  }

  const updated = await tx
    .update(automationActions)
    .set({ status: 'consumed' })
    .where(eq(automationActions.id, actionId))
    .returning();
  const action = updated[0];
  if (action === undefined) throw new AppError('NOT_FOUND', 'Action introuvable.');
  return action;
}

/** EF-3, BR-AUT-12 — compact projection for a weekly recap ordered oldest first. */
export async function listAutomationActionsAscending(
  tx: DbTx,
  input: AutomationActionPageInput & { since: Date },
): Promise<AutomationAction[]> {
  const userId = identifier(input.userId, 'userId');
  const limit = parse(limitSchema, input.limit ?? 50, 'limit');
  const since = instant(input.since, 'since');
  return tx
    .select()
    .from(automationActions)
    .where(and(eq(automationActions.userId, userId), gte(automationActions.createdAt, since)))
    .orderBy(asc(automationActions.createdAt), asc(automationActions.id))
    .limit(limit);
}
