// Repositories of the AI/billing domain (SPEC-110 EF-2 to EF-6, ET-2, ET-5, CL-1 to CL-8).
//
// Every function runs inside the caller's transaction. The web client uses `userDb` so RLS limits
// reads and writes to the owner; the AI journal and the Stripe webhooks use `serviceDb` through the
// service layer (SPEC-506, SPEC-210). A credential is returned only through `toPublicCredential`:
// the encrypted bytes never leave the server (ET-5). `resolveTaskModel` never selects a deleted or
// unqualified key, so the provider resolver of SPEC-506 cannot leak a failed personal model (EF-2).
import { and, asc, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { z } from 'zod';

import { AppError } from '@learny/core';

import type { DbTx } from '../client';
import {
  DEFAULT_DAILY_CAP_USD,
  aiCallStatusSchema,
  aiCalls,
  aiCredentials,
  aiProviderSchema,
  aiTaskModels,
  aiTaskSchema,
  baseUrlSchema,
  costUsdSchema,
  credentialLabelSchema,
  credentialStatusSchema,
  dailyCapUsdSchema,
  encryptedKeySchema,
  keyLast4Schema,
  latencyMsSchema,
  modelIdSchema,
  normalizeUsd,
  qualificationSchema,
  subscriptionStatusSchema,
  subscriptions,
  tokenCountSchema,
  toPublicCredential,
  type AiCall,
  type AiCallStatusValue,
  type AiProviderValue,
  type AiTaskValue,
  type CredentialStatusValue,
  type PublicAiCredential,
  type Subscription,
  type SubscriptionStatusValue,
} from '../schema/ai-billing';

const uuidSchema = z.uuid();
const instantSchema = z.date();

/** EF-1, ET-2 — names that would carry a plaintext key; the repository always refuses them. */
const FORBIDDEN_PLAINTEXT_KEY_FIELDS = [
  'apiKey',
  'key',
  'plaintextKey',
  'rawKey',
  'secret',
  'token',
] as const;

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

/** ET-2 — a plaintext key field is a programming error, not a value to coerce. */
function rejectPlaintextKey(input: object): void {
  const record = input as Record<string, unknown>;
  for (const field of FORBIDDEN_PLAINTEXT_KEY_FIELDS) {
    if (Object.hasOwn(record, field) && record[field] !== undefined) {
      throw validationError(field, [
        'une clé brute en clair est refusée : fournir « encryptedKey » au format iv‖tag‖ciphertext',
      ]);
    }
  }
}

function identifier(value: string, field: string): string {
  return parse(uuidSchema, value, field);
}

function instant(value: Date, field: string): Date {
  return parse(instantSchema, value, field);
}

// ---------------------------------------------------------------------------------------------
// Personal credentials
// ---------------------------------------------------------------------------------------------

export interface CreateCredentialInput {
  userId: string;
  provider: AiProviderValue;
  label: string;
  baseUrl?: string | null;
  modelIds?: string[];
  /** AES-256-GCM `iv‖tag‖ciphertext` bytes produced by SPEC-505; never a clear key. */
  encryptedKey?: Uint8Array | null;
  keyLast4?: string | null;
  status?: CredentialStatusValue;
  qualification?: Record<string, unknown>;
  outsideEu?: boolean;
  qualifiedAt?: Date | null;
}

const createCredentialSchema = z
  .object({
    userId: uuidSchema,
    provider: aiProviderSchema,
    label: credentialLabelSchema,
    baseUrl: baseUrlSchema,
    modelIds: z.array(modelIdSchema).max(50).default([]),
    encryptedKey: encryptedKeySchema.nullish(),
    keyLast4: keyLast4Schema,
    status: credentialStatusSchema.default('untested'),
    qualification: qualificationSchema.default({}),
    outsideEu: z.boolean().default(false),
    qualifiedAt: z.date().nullish(),
  })
  .superRefine((value, context) => {
    // CL-1 — a hosted provider requires an encrypted key; a local model may have none.
    const hasKey = value.encryptedKey !== null && value.encryptedKey !== undefined;
    const hasLast4 = value.keyLast4 !== null && value.keyLast4 !== undefined;
    if (value.provider !== 'local' && !hasKey) {
      context.addIssue({
        code: 'custom',
        path: ['encryptedKey'],
        message: `le fournisseur ${value.provider} exige une clé chiffrée`,
      });
    }
    if (hasKey !== hasLast4) {
      context.addIssue({
        code: 'custom',
        path: ['keyLast4'],
        message: 'les quatre derniers caractères accompagnent exactement une clé chiffrée',
      });
    }
  });

/**
 * EF-1, ET-2, CL-1 — creates a personal key. Returns only its identifier: the encrypted bytes are
 * never returned, even to the caller who wrote them (ET-5).
 */
export async function createCredential(
  tx: DbTx,
  input: CreateCredentialInput,
): Promise<{ id: string }> {
  rejectPlaintextKey(input);
  const value = parse(createCredentialSchema, input, 'credential');
  const [row] = await tx
    .insert(aiCredentials)
    .values({
      userId: value.userId,
      provider: value.provider,
      label: value.label,
      baseUrl: value.baseUrl ?? null,
      modelIds: value.modelIds,
      encryptedKey: value.encryptedKey ?? null,
      keyLast4: value.keyLast4 ?? null,
      status: value.status,
      qualification: value.qualification,
      outsideEu: value.outsideEu,
      qualifiedAt: value.qualifiedAt ?? null,
    })
    .returning({ id: aiCredentials.id });
  if (row === undefined) throw new AppError('INTERNAL_ERROR', 'clé IA non créée');
  return row;
}

/**
 * ET-5, CA-3, CL-8 — public projection of the owner's keys. The explicit select list excludes
 * `encrypted_key` so no DTO can carry the ciphertext, even by accident.
 */
export async function listCredentials(tx: DbTx, userId: string): Promise<PublicAiCredential[]> {
  const owner = identifier(userId, 'userId');
  const rows = await tx
    .select({
      provider: aiCredentials.provider,
      label: aiCredentials.label,
      keyLast4: aiCredentials.keyLast4,
      status: aiCredentials.status,
      outsideEu: aiCredentials.outsideEu,
    })
    .from(aiCredentials)
    .where(eq(aiCredentials.userId, owner))
    .orderBy(asc(aiCredentials.createdAt), asc(aiCredentials.label), asc(aiCredentials.id));
  return rows.map(toPublicCredential);
}

/**
 * ET-2, ET-5 — the single internal read of the ciphertext, reserved to the qualification service
 * (SPEC-505). It is never called by a web read path and never returns a plaintext key.
 */
export async function getCredentialSecret(
  tx: DbTx,
  input: { userId: string; credentialId: string },
): Promise<{ provider: AiProviderValue; encryptedKey: Uint8Array } | null> {
  const userId = identifier(input.userId, 'userId');
  const credentialId = identifier(input.credentialId, 'credentialId');
  const rows = await tx
    .select({ provider: aiCredentials.provider, encryptedKey: aiCredentials.encryptedKey })
    .from(aiCredentials)
    .where(and(eq(aiCredentials.id, credentialId), eq(aiCredentials.userId, userId)));
  const row = rows[0];
  if (row === undefined || row.encryptedKey === null) return null;
  return { provider: row.provider, encryptedKey: row.encryptedKey };
}

/** EF-1, CL-7 — deletes one owner key; the linked task rows are set to null by the FK. */
export async function deleteCredential(
  tx: DbTx,
  input: { userId: string; credentialId: string },
): Promise<boolean> {
  const userId = identifier(input.userId, 'userId');
  const credentialId = identifier(input.credentialId, 'credentialId');
  const rows = await tx
    .delete(aiCredentials)
    .where(and(eq(aiCredentials.id, credentialId), eq(aiCredentials.userId, userId)))
    .returning({ id: aiCredentials.id });
  return rows.length > 0;
}

// ---------------------------------------------------------------------------------------------
// Task models
// ---------------------------------------------------------------------------------------------

export interface TaskModelChoice {
  task: AiTaskValue;
  credentialId: string | null;
  modelId: string;
  /** EF-2 — null credential means the provided AI; true whenever a key cannot be used. */
  managed: boolean;
  usable: boolean;
  credentialLabel: string | null;
  credentialStatus: CredentialStatusValue | null;
}

/** EF-2 — lists the five tasks with the usability of their personal key. */
export async function listTaskModels(tx: DbTx, userId: string): Promise<TaskModelChoice[]> {
  const owner = identifier(userId, 'userId');
  const rows = await tx
    .select({
      task: aiTaskModels.task,
      credentialId: aiTaskModels.credentialId,
      modelId: aiTaskModels.modelId,
      credentialLabel: aiCredentials.label,
      credentialStatus: aiCredentials.status,
    })
    .from(aiTaskModels)
    .leftJoin(aiCredentials, eq(aiCredentials.id, aiTaskModels.credentialId))
    .where(eq(aiTaskModels.userId, owner))
    .orderBy(asc(aiTaskModels.task));
  return rows.map((row) => {
    const usable = row.credentialId !== null && row.credentialStatus === 'qualified';
    return {
      task: row.task,
      credentialId: row.credentialId,
      modelId: row.modelId,
      managed: !usable,
      usable,
      credentialLabel: row.credentialLabel,
      credentialStatus: row.credentialStatus,
    };
  });
}

const setTaskModelSchema = z.object({
  userId: uuidSchema,
  task: aiTaskSchema,
  credentialId: uuidSchema.nullish(),
  modelId: modelIdSchema,
});

/**
 * EF-2, CL-7 — chooses one model per task. The credential must belong to the learner; an unknown
 * or foreign identifier is refused before the atomic upsert.
 */
export async function setTaskModel(
  tx: DbTx,
  input: { userId: string; task: AiTaskValue; credentialId: string | null; modelId: string },
): Promise<void> {
  const value = parse(setTaskModelSchema, input, 'taskModel');
  if (value.credentialId !== null && value.credentialId !== undefined) {
    const rows = await tx
      .select({ id: aiCredentials.id })
      .from(aiCredentials)
      .where(and(eq(aiCredentials.id, value.credentialId), eq(aiCredentials.userId, value.userId)));
    if (rows.length === 0) {
      throw new AppError(
        'FORBIDDEN',
        'La clé IA choisie appartient à un autre compte ou est absente.',
      );
    }
  }
  await tx
    .insert(aiTaskModels)
    .values({
      userId: value.userId,
      task: value.task,
      credentialId: value.credentialId ?? null,
      modelId: value.modelId,
    })
    .onConflictDoUpdate({
      target: [aiTaskModels.userId, aiTaskModels.task],
      set: { credentialId: value.credentialId ?? null, modelId: value.modelId },
    });
}

/** EF-2, CA-3 — one task choice, or null when the learner has not chosen a model yet. */
export async function getTaskModel(
  tx: DbTx,
  input: { userId: string; task: AiTaskValue },
): Promise<TaskModelChoice | null> {
  const userId = identifier(input.userId, 'userId');
  const task = parse(aiTaskSchema, input.task, 'task');
  const rows = await tx
    .select({
      task: aiTaskModels.task,
      credentialId: aiTaskModels.credentialId,
      modelId: aiTaskModels.modelId,
      credentialLabel: aiCredentials.label,
      credentialStatus: aiCredentials.status,
    })
    .from(aiTaskModels)
    .leftJoin(aiCredentials, eq(aiCredentials.id, aiTaskModels.credentialId))
    .where(and(eq(aiTaskModels.userId, userId), eq(aiTaskModels.task, task)));
  const row = rows[0];
  if (row === undefined) return null;
  const usable = row.credentialId !== null && row.credentialStatus === 'qualified';
  return {
    task: row.task,
    credentialId: row.credentialId,
    modelId: row.modelId,
    managed: !usable,
    usable,
    credentialLabel: row.credentialLabel,
    credentialStatus: row.credentialStatus,
  };
}

export interface ResolvedTaskModel {
  task: AiTaskValue;
  /** True when the provided AI must answer (no choice, or an unusable personal key). */
  managed: boolean;
  credentialId: string | null;
  /** Model requested by the learner; null when the provided AI picks its own managed model. */
  modelId: string | null;
  /** Identifier of the key that blocked the choice, kept for the explanation of SPEC-506. */
  unavailableCredentialId: string | null;
}

/**
 * EF-2 — resolution used by SPEC-506. A deleted key (credential id nulled by the FK) or an
 * unqualified key never serves a call: the result falls back to the provided AI.
 */
export async function resolveTaskModel(
  tx: DbTx,
  input: { userId: string; task: AiTaskValue },
): Promise<ResolvedTaskModel> {
  const choice = await getTaskModel(tx, input);
  if (choice === null) {
    return {
      task: input.task,
      managed: true,
      credentialId: null,
      modelId: null,
      unavailableCredentialId: null,
    };
  }
  if (choice.credentialId === null) {
    return {
      task: choice.task,
      managed: true,
      credentialId: null,
      modelId: null,
      unavailableCredentialId: null,
    };
  }
  if (choice.usable) {
    return {
      task: choice.task,
      managed: false,
      credentialId: choice.credentialId,
      modelId: choice.modelId,
      unavailableCredentialId: null,
    };
  }
  return {
    task: choice.task,
    managed: true,
    credentialId: null,
    modelId: null,
    unavailableCredentialId: choice.credentialId,
  };
}

// ---------------------------------------------------------------------------------------------
// Call journal and daily spend
// ---------------------------------------------------------------------------------------------

export interface RecordAiCallInput {
  userId: string;
  formationId?: string | null;
  task: AiTaskValue;
  provider: AiProviderValue;
  model: string;
  managed: boolean;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  costUsd?: string | number;
  latencyMs?: number;
  status: AiCallStatusValue;
  errorCode?: string | null;
  batch?: boolean;
  createdAt?: Date;
}

const recordCallSchema = z.object({
  userId: uuidSchema,
  formationId: uuidSchema.nullish(),
  task: aiTaskSchema,
  provider: aiProviderSchema,
  model: modelIdSchema,
  managed: z.boolean(),
  inputTokens: tokenCountSchema.default(0),
  outputTokens: tokenCountSchema.default(0),
  cacheReadTokens: tokenCountSchema.default(0),
  cacheWriteTokens: tokenCountSchema.default(0),
  costUsd: costUsdSchema.default('0'),
  latencyMs: latencyMsSchema.default(0),
  status: aiCallStatusSchema,
  errorCode: z.string().trim().min(1).max(80).nullish(),
  batch: z.boolean().default(false),
  createdAt: z.date().optional(),
});

/**
 * EF-3, CL-2 — appends one call, including a refusal or a cap with a zero cost. The service role
 * writes; the learner only reads the journal (ET-4). Negative cost, tokens or latency are refused
 * before the SQL check is reached, so the caller gets a validation error rather than a driver one.
 */
export async function recordAiCall(tx: DbTx, input: RecordAiCallInput): Promise<AiCall> {
  const value = parse(recordCallSchema, input, 'call');
  const [row] = await tx
    .insert(aiCalls)
    .values({
      userId: value.userId,
      formationId: value.formationId ?? null,
      task: value.task,
      provider: value.provider,
      model: value.model,
      managed: value.managed,
      inputTokens: value.inputTokens,
      outputTokens: value.outputTokens,
      cacheReadTokens: value.cacheReadTokens,
      cacheWriteTokens: value.cacheWriteTokens,
      costUsd: value.costUsd,
      latencyMs: value.latencyMs,
      status: value.status,
      errorCode: value.errorCode ?? null,
      batch: value.batch,
      ...(value.createdAt === undefined ? {} : { createdAt: value.createdAt }),
    })
    .returning();
  if (row === undefined) throw new AppError('INTERNAL_ERROR', 'appel IA non journalisé');
  return row;
}

/** EF-5, CA-2 — provided-AI spend of the learner's local civil day, with an injected instant. */
export async function getSpendToday(
  tx: DbTx,
  input: { userId: string; now: Date },
): Promise<string> {
  const userId = identifier(input.userId, 'userId');
  const now = instant(input.now, 'now');
  const rows = await tx.execute(
    sql`select public.ai_spend_today(${userId}::uuid, ${now.toISOString()}::timestamptz)::text as spent_usd`,
  );
  const row = rows[0] as { spent_usd?: unknown } | undefined;
  const value = row?.spent_usd;
  return typeof value === 'string' ? normalizeUsd(value) : normalizeUsd(0);
}

export interface AiUsageRow {
  /** Civil local day in the learner's current time zone, `YYYY-MM-DD`. */
  day: string;
  formationId: string | null;
  calls: number;
  spentUsd: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

const usageRangeSchema = z
  .object({
    userId: uuidSchema,
    from: z.date(),
    to: z.date(),
    formationId: uuidSchema.nullish(),
  })
  .refine((value) => value.from < value.to, {
    message: 'la fin de plage doit suivre son début',
    path: ['to'],
  });

/**
 * EF-6 — usage grouped by local day and formation, with UTC bounds. The projection has no key
 * field at all, so a client can list costs without ever receiving a credential secret.
 */
export async function listAiUsage(
  tx: DbTx,
  input: { userId: string; from: Date; to: Date; formationId?: string | null },
): Promise<AiUsageRow[]> {
  const value = parse(usageRangeSchema, input, 'usage');
  const formationFilter =
    value.formationId === null || value.formationId === undefined
      ? sql``
      : sql` and c.formation_id = ${value.formationId}::uuid`;
  const rows = await tx.execute(sql`
    select (c.created_at at time zone p.timezone)::date::text as day,
           c.formation_id::text as formation_id,
           count(*)::int as calls,
           coalesce(sum(c.cost_usd), 0)::numeric(12, 6)::text as spent_usd,
           coalesce(sum(c.input_tokens), 0)::int as input_tokens,
           coalesce(sum(c.output_tokens), 0)::int as output_tokens,
           coalesce(sum(c.cache_read_tokens), 0)::int as cache_read_tokens,
           coalesce(sum(c.cache_write_tokens), 0)::int as cache_write_tokens
    from public.ai_calls c
    join public.profiles p on p.id = c.user_id
    where c.user_id = ${value.userId}::uuid
      and c.created_at >= ${value.from.toISOString()}::timestamptz
      and c.created_at < ${value.to.toISOString()}::timestamptz
      ${formationFilter}
    group by 1, 2
    order by 1 asc, 2 asc
  `);
  return (rows as unknown as Array<Record<string, unknown>>).map((row) => ({
    day: String(row.day),
    formationId: typeof row.formation_id === 'string' ? row.formation_id : null,
    calls: Number(row.calls),
    spentUsd: String(row.spent_usd),
    inputTokens: Number(row.input_tokens),
    outputTokens: Number(row.output_tokens),
    cacheReadTokens: Number(row.cache_read_tokens),
    cacheWriteTokens: Number(row.cache_write_tokens),
  }));
}

/** EF-3 — one owner's journal, newest first, for the usage screen of SPEC-506. */
export async function listAiCalls(
  tx: DbTx,
  input: { userId: string; limit?: number },
): Promise<AiCall[]> {
  const userId = identifier(input.userId, 'userId');
  const limit = parse(z.int().min(1).max(200).default(50), input.limit ?? 50, 'limit');
  return tx
    .select()
    .from(aiCalls)
    .where(eq(aiCalls.userId, userId))
    .orderBy(desc(aiCalls.createdAt), desc(aiCalls.id))
    .limit(limit);
}

// ---------------------------------------------------------------------------------------------
// Subscription
// ---------------------------------------------------------------------------------------------

export interface UpsertSubscriptionInput {
  userId: string;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  status?: SubscriptionStatusValue;
  currentPeriodEnd?: Date | null;
  dailyCapUsd?: string | number;
}

const upsertSubscriptionSchema = z.object({
  userId: uuidSchema,
  stripeCustomerId: z.string().trim().min(1).max(255).nullish(),
  stripeSubscriptionId: z.string().trim().min(1).max(255).nullish(),
  status: subscriptionStatusSchema.default('none'),
  currentPeriodEnd: z.date().nullish(),
  dailyCapUsd: dailyCapUsdSchema.default(DEFAULT_DAILY_CAP_USD),
});

/**
 * EF-4, CA-4 — creates or updates the learner's subscription with its default 1.50 USD cap. The
 * Stripe webhook service owns this write; the learner reads it through RLS.
 */
export async function upsertSubscription(
  tx: DbTx,
  input: UpsertSubscriptionInput,
): Promise<Subscription> {
  const value = parse(upsertSubscriptionSchema, input, 'subscription');
  const [row] = await tx
    .insert(subscriptions)
    .values({
      userId: value.userId,
      stripeCustomerId: value.stripeCustomerId ?? null,
      stripeSubscriptionId: value.stripeSubscriptionId ?? null,
      status: value.status,
      currentPeriodEnd: value.currentPeriodEnd ?? null,
      dailyCapUsd: value.dailyCapUsd,
    })
    .onConflictDoUpdate({
      target: subscriptions.userId,
      set: {
        stripeCustomerId: value.stripeCustomerId ?? null,
        stripeSubscriptionId: value.stripeSubscriptionId ?? null,
        status: value.status,
        currentPeriodEnd: value.currentPeriodEnd ?? null,
        dailyCapUsd: value.dailyCapUsd,
        updatedAt: sql`now()`,
      },
    })
    .returning();
  if (row === undefined) throw new AppError('INTERNAL_ERROR', 'abonnement non enregistré');
  return row;
}

/** EF-4, CA-3 — the learner's subscription, or null before the first Stripe event. */
export async function getSubscription(tx: DbTx, userId: string): Promise<Subscription | null> {
  const owner = identifier(userId, 'userId');
  const rows = await tx.select().from(subscriptions).where(eq(subscriptions.userId, owner));
  return rows[0] ?? null;
}

/**
 * EF-4, ADR-0215 — active status is the only basis of the provided-AI entitlement; SPEC-210 adds
 * the period check and remains the final decision maker.
 */
export function hasActiveSubscription(
  subscription: Pick<Subscription, 'status' | 'currentPeriodEnd'> | null,
  now: Date,
): boolean {
  if (subscription === null || subscription.status !== 'active') return false;
  if (subscription.currentPeriodEnd === null) return false;
  return subscription.currentPeriodEnd > now;
}

/**
 * EF-3 — chronological read of the cost journal for a bounded UTC range.
 */
export async function listCallsBetween(
  tx: DbTx,
  input: { userId: string; from: Date; to: Date },
): Promise<AiCall[]> {
  const userId = identifier(input.userId, 'userId');
  const from = instant(input.from, 'from');
  const to = instant(input.to, 'to');
  return tx
    .select()
    .from(aiCalls)
    .where(and(eq(aiCalls.userId, userId), gte(aiCalls.createdAt, from), lt(aiCalls.createdAt, to)))
    .orderBy(asc(aiCalls.createdAt));
}
