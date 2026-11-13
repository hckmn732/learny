// Qualification of one personal model (SPEC-506 EF-1 to EF-5, ET-1 to ET-4).
// The service owns the data access and persistence; `@learny/llm` performs the four-stage battery
// and `@learny/bricks` validates each produced brick. No function returns, logs or throws a key.
import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import {
  BRICK_TYPES,
  brickRegistry,
  validateBrick,
  type BrickIssue,
  type BrickReferenceResolver,
  type BrickType,
} from '@learny/bricks';
import {
  AiQualificationBody,
  QualificationReport,
  TaskModelDto,
  type QualificationIssue,
} from '@learny/contracts';
import { AppError, err, type Result } from '@learny/core';
import {
  aiCredentials,
  aiTaskModels,
  serviceDb,
  subscriptions,
  type AiTaskValue,
  type CredentialStatusValue,
} from '@learny/db';
import { TASK_CONFIG } from '@learny/llm';
import {
  runQualification,
  type QualificationBrickBattery,
  type QualificationScenario,
} from '@learny/llm/qualification';
import { notify } from '@learny/notifications';

import type { ServiceContext } from '../context';
import { requireUser, toResult } from '../resources/result';

const QUALIFICATION_FORMATION_ID = '99999999-9999-4999-8999-999999999999';
const NOTION_IDS = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
] as const;
const RESOURCE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CHUNK_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const BRICK_IDS = [
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
] as const;
const RUNNING_TTL_MS = 5 * 60 * 1000;
const IN_FLIGHT = new Map<string, Promise<Result<QualificationReport>>>();

function validationError(detail: string, path = 'body.modelId'): AppError {
  return new AppError('VALIDATION_FAILED', detail, {
    status: 422,
    errors: [{ path, message: detail }],
  });
}

function notFound(): AppError {
  return new AppError('CREDENTIAL_NOT_FOUND', 'Cette clé personnelle est introuvable.', {
    status: 404,
  });
}

function recordOf(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Reference resolver of the battery. The qualification uses stable example identifiers that never
 * collide with a learner's data (SPEC-501 §15); no database read is needed to validate them.
 */
const QUALIFICATION_RESOLVER: BrickReferenceResolver = {
  existingNotionIds: (_formationId, ids) =>
    Promise.resolve(new Set(ids.filter((id) => (NOTION_IDS as readonly string[]).includes(id)))),
  chunks: (ids) =>
    Promise.resolve(
      new Map(
        ids.filter((id) => id === CHUNK_ID).map((id) => [id, { resourceId: RESOURCE_ID }] as const),
      ),
    ),
  resources: (ids) =>
    Promise.resolve(
      new Map(
        ids
          .filter((id) => id === RESOURCE_ID)
          .map(
            (id) =>
              [id, { kind: 'pdf' as const, pages: 10, durationSec: null, deleted: false }] as const,
          ),
      ),
    ),
  existingBrickIds: (_formationId, ids) =>
    Promise.resolve(new Set(ids.filter((id) => (BRICK_IDS as readonly string[]).includes(id)))),
};

function brickDraft(type: BrickType, payload: unknown): unknown {
  return {
    type,
    formationId: QUALIFICATION_FORMATION_ID,
    purpose: 'validation',
    notionIds: [NOTION_IDS[0]],
    origin: type === 'resource_excerpt' ? 'resource' : 'tutor',
    payload,
  };
}

function issuesOfBricks(issues: readonly BrickIssue[]): QualificationIssue[] {
  return issues.slice(0, 20).map((issue) => ({
    code: issue.code,
    path: issue.path.slice(0, 300),
    message: issue.message.slice(0, 300),
  }));
}

/** The thirteen schemas and their common rules, as required by ET-2. */
export const qualificationBrickBattery: QualificationBrickBattery = {
  types: BRICK_TYPES,
  schemaFor: (type) => {
    if (!(BRICK_TYPES as readonly string[]).includes(type)) {
      throw validationError(`Type de brique inconnu : ${type}.`, 'body.brickType');
    }
    return brickRegistry[type as BrickType].schema;
  },
  promptFor: (type) =>
    `Produce one valid "${type}" brick payload for a French accounting course. Use realistic French content and respect every field, identifier and common rule.`,
  validate: async (type, payload) => {
    const result = await validateBrick(
      brickDraft(type as BrickType, payload),
      QUALIFICATION_RESOLVER,
    );
    return result.ok
      ? { ok: true, value: result.value }
      : { ok: false, error: issuesOfBricks(result.error) };
  },
};

export interface QualifyOptions {
  /** Simulated scenario of the demonstration and tests; live calls ignore it. */
  mockScenario?: QualificationScenario;
  mode?: 'live' | 'mock';
}

interface ClaimedCredential {
  qualification: Record<string, unknown>;
  qualifiedAt: Date | null;
}

/** Marks one owned key as running under a row lock, or refuses a concurrent execution (CL-4). */
async function claim(
  ctx: ServiceContext,
  userId: string,
  credentialId: string,
  modelId: string,
  runId: string,
): Promise<ClaimedCredential> {
  const { db } = requireUser(ctx);
  return db.run(async (tx) => {
    const rows = await tx
      .select({
        qualification: aiCredentials.qualification,
        qualifiedAt: aiCredentials.qualifiedAt,
      })
      .from(aiCredentials)
      .where(and(eq(aiCredentials.id, credentialId), eq(aiCredentials.userId, userId)))
      .for('update')
      .limit(1);
    const row = rows[0];
    if (row === undefined) throw notFound();
    const qualification = recordOf(row.qualification);
    const running = recordOf(qualification.run);
    const startedAt = typeof running.startedAt === 'string' ? Date.parse(running.startedAt) : 0;
    const stillRunning =
      running.status === 'running' &&
      Number.isFinite(startedAt) &&
      ctx.clock.now().getTime() - startedAt < RUNNING_TTL_MS;
    if (stillRunning) {
      throw new AppError('QUALIFICATION_IN_PROGRESS', 'Une qualification est déjà en cours.', {
        status: 409,
        retryAfterSec: 10,
      });
    }
    await tx
      .update(aiCredentials)
      .set({
        qualification: {
          ...qualification,
          run: {
            id: runId,
            modelId,
            status: 'running',
            startedAt: ctx.clock.now().toISOString(),
          },
        },
        updatedAt: ctx.clock.now(),
      })
      .where(and(eq(aiCredentials.id, credentialId), eq(aiCredentials.userId, userId)));
    return { qualification, qualifiedAt: row.qualifiedAt };
  });
}

async function release(
  ctx: ServiceContext,
  userId: string,
  credentialId: string,
  qualification: Record<string, unknown>,
): Promise<void> {
  const { db } = requireUser(ctx);
  await db.run((tx) =>
    tx
      .update(aiCredentials)
      .set({ qualification, updatedAt: ctx.clock.now() })
      .where(and(eq(aiCredentials.id, credentialId), eq(aiCredentials.userId, userId))),
  );
}

async function saveReport(
  ctx: ServiceContext,
  userId: string,
  credentialId: string,
  report: QualificationReport,
  previous: ClaimedCredential,
): Promise<void> {
  const base = { ...previous.qualification };
  delete base.run;
  const models = recordOf(base.models);
  const nextModels = { ...models, [report.modelId]: report };
  const anyQualified = Object.values(nextModels).some(
    (candidate) => recordOf(candidate).status === 'qualified',
  );
  const status: CredentialStatusValue = anyQualified ? 'qualified' : 'failed';
  const qualifiedAt =
    report.status === 'qualified' ? ctx.clock.now() : anyQualified ? previous.qualifiedAt : null;
  const { db } = requireUser(ctx);
  await db.run((tx) =>
    tx
      .update(aiCredentials)
      .set({
        status,
        qualifiedAt,
        qualification: { ...base, models: nextModels, lastRunId: report.id },
        updatedAt: ctx.clock.now(),
      })
      .where(and(eq(aiCredentials.id, credentialId), eq(aiCredentials.userId, userId))),
  );
}

/**
 * ET-1, EF-3 — qualifies one model of an owned key. The in-flight map makes two concurrent calls
 * of the same process idempotent; another process gets a controlled 409 (CL-4).
 */
export async function qualifyCredential(
  ctx: ServiceContext,
  credentialId: string,
  modelId: string,
  options: QualifyOptions = {},
): Promise<Result<QualificationReport>> {
  const { userId } = requireUser(ctx);
  if (!z.uuid().safeParse(credentialId).success) return err(notFound());
  const parsed = AiQualificationBody.safeParse({ modelId });
  if (!parsed.success) {
    return err(validationError('Identifiant de modèle invalide.', 'body.modelId'));
  }
  const key = `${userId}:${credentialId}:${parsed.data.modelId}`;
  const running = IN_FLIGHT.get(key);
  if (running !== undefined) return running;

  const promise = (async (): Promise<Result<QualificationReport>> => {
    const runId = randomUUID();
    let claimed: ClaimedCredential | null = null;
    try {
      claimed = await claim(ctx, userId, credentialId, parsed.data.modelId, runId);
      const result = await runQualification(
        { userId, db: serviceDb(), requestId: ctx.requestId },
        {
          id: runId,
          credentialId,
          modelId: parsed.data.modelId,
          battery: qualificationBrickBattery,
          clock: ctx.clock,
          ...(options.mockScenario === undefined ? {} : { mockScenario: options.mockScenario }),
          ...(options.mode === undefined ? {} : { mode: options.mode }),
        },
      );
      if (!result.ok) {
        await release(ctx, userId, credentialId, claimed.qualification);
        return result;
      }
      const report = QualificationReport.parse(result.value);
      await saveReport(ctx, userId, credentialId, report, claimed);
      return { ok: true, value: report };
    } catch (error) {
      if (claimed !== null) {
        await release(ctx, userId, credentialId, claimed.qualification).catch(() => undefined);
      }
      if (error instanceof AppError) return { ok: false, error };
      throw error;
    }
  })();
  IN_FLIGHT.set(key, promise);
  try {
    return await promise;
  } finally {
    IN_FLIGHT.delete(key);
  }
}

const TaskModelAssignment = z.object({
  task: z.enum(['programme', 'course', 'gaps', 'tutor', 'light']),
  credentialId: z.uuid(),
  modelId: z.string().trim().min(1).max(200),
});

export type AssignTaskModelInput = z.infer<typeof TaskModelAssignment>;

/**
 * EF-4 — assigns a personal model to one task only when its model-specific qualification passed
 * and every capability of the task is proven. A failed report blocks the assignment.
 */
export async function assignTaskModel(
  ctx: ServiceContext,
  input: AssignTaskModelInput,
): Promise<Result<TaskModelDto>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const parsed = TaskModelAssignment.safeParse(input);
    if (!parsed.success) throw validationError('Affectation de modèle invalide.', 'body');
    const value = parsed.data;
    const rows = await db.run((tx) =>
      tx
        .select({
          modelIds: aiCredentials.modelIds,
          qualification: aiCredentials.qualification,
          status: aiCredentials.status,
        })
        .from(aiCredentials)
        .where(and(eq(aiCredentials.id, value.credentialId), eq(aiCredentials.userId, userId)))
        .limit(1),
    );
    const row = rows[0];
    if (row === undefined) throw notFound();
    if (!row.modelIds.includes(value.modelId)) {
      throw validationError('Ce modèle ne fait pas partie des modèles de cette clé.');
    }
    const report = QualificationReport.safeParse(
      recordOf(recordOf(row.qualification).models)[value.modelId],
    );
    if (!report.success || report.data.status !== 'qualified') {
      throw new AppError(
        'AI_MODEL_NOT_QUALIFIED',
        'Ce modèle n’est pas qualifié pour cette clé. Lancez la qualification puis réessayez.',
        { status: 422 },
      );
    }
    const missing = TASK_CONFIG[value.task].capabilities.filter(
      (capability) => !report.data.capabilities[capability],
    );
    if (missing.length > 0) {
      throw new AppError(
        'AI_MODEL_NOT_QUALIFIED',
        `Ce modèle ne fournit pas les capacités requises : ${missing.join(', ')}.`,
        { status: 422 },
      );
    }
    await db.run((tx) =>
      tx
        .insert(aiTaskModels)
        .values({
          userId,
          task: value.task,
          credentialId: value.credentialId,
          modelId: value.modelId,
        })
        .onConflictDoUpdate({
          target: [aiTaskModels.userId, aiTaskModels.task],
          set: { credentialId: value.credentialId, modelId: value.modelId },
        }),
    );
    return { task: value.task, credentialId: value.credentialId, modelId: value.modelId };
  });
}

const TASK_LABELS: Record<AiTaskValue, string> = {
  programme: 'Conception du programme',
  course: 'Rédaction du cours',
  gaps: 'Analyse des lacunes',
  tutor: 'Dialogue avec le tuteur',
  light: 'Tâche légère',
};

export interface InvalidBrickStopInput {
  task: AiTaskValue;
  formationId?: string | null;
  modelId: string;
  /** Number of automatic corrections already sent to the model. */
  attempts: number;
}

export type InvalidBrickStopResult =
  | { status: 'retry'; attempts: number; remaining: number }
  | {
      status: 'stopped';
      errorCode: 'INVALID_OUTPUT';
      attempts: number;
      choices: ('personal_model' | 'managed_ai')[];
      notified: boolean;
      managedCalls: 0;
    };

/**
 * EF-5, CA-4 — after two unsuccessful corrections the task stops with `INVALID_OUTPUT`, notifies
 * the learner and waits for their choice. No provided-AI call is made here (ADR-0013).
 */
export async function stopAfterInvalidBrick(
  ctx: ServiceContext,
  input: InvalidBrickStopInput,
): Promise<Result<InvalidBrickStopResult>> {
  return toResult(async () => {
    const { userId } = requireUser(ctx);
    const parsed = z
      .object({
        task: z.enum(['programme', 'course', 'gaps', 'tutor', 'light']),
        formationId: z.uuid().nullish(),
        modelId: z.string().trim().min(1).max(200),
        attempts: z.int().min(0).max(10),
      })
      .safeParse(input);
    if (!parsed.success) throw validationError('Échec de brique invalide.', 'body');
    const value = parsed.data;
    if (value.attempts < 2) {
      return { status: 'retry' as const, attempts: value.attempts, remaining: 2 - value.attempts };
    }
    const [subscription] = await serviceDb()
      .select({ status: subscriptions.status, currentPeriodEnd: subscriptions.currentPeriodEnd })
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);
    const managedAvailable =
      subscription?.status === 'active' &&
      subscription.currentPeriodEnd !== null &&
      subscription.currentPeriodEnd.getTime() > ctx.clock.now().getTime();
    const day = ctx.clock.now().toISOString().slice(0, 10);
    const notification = await notify(
      {
        requestId: ctx.requestId,
        sdb: serviceDb(),
        clock: ctx.clock,
        logger: ctx.logger,
      },
      {
        userId,
        ...(value.formationId === null || value.formationId === undefined
          ? {}
          : { formationId: value.formationId }),
        type: 'ai_task_failed',
        data: {
          taskLabel: TASK_LABELS[value.task],
          modelLabel: value.modelId,
          href: '/parametres#modeles',
          managedAvailable,
        },
        dedupeKey: `ai_task_failed:${value.task}:${value.modelId}:${day}`,
      },
    );
    return {
      status: 'stopped' as const,
      errorCode: 'INVALID_OUTPUT' as const,
      attempts: value.attempts,
      choices: managedAvailable
        ? (['personal_model', 'managed_ai'] satisfies ('personal_model' | 'managed_ai')[])
        : (['personal_model'] satisfies ('personal_model' | 'managed_ai')[]),
      notified: notification.ok,
      managedCalls: 0 as const,
    };
  });
}
