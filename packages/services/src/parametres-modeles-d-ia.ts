// Settings screen — « Modèles d'IA » tab (SPEC-709 EF-1 to EF-5, ET-1 to ET-5; BR-SET-05,
// BR-IA-02 to BR-IA-04).
//
// The tab reads and writes only the learner's rows with the RLS client (`ctx.db`): another
// learner's credential is invisible and answers `NOT_FOUND` without revealing its existence
// (CL-1). Credentials stay owned by SPEC-505/SPEC-506; this module projects the mask, the status
// and the region flag and never selects `encrypted_key`. Qualification gates every assignment
// server-side (ET-3), not only in the selector (CA-1, CL-5). The platform provides no model: a task
// without a choice, or whose chosen model became unusable, is reported as unavailable and never
// falls back to another model (CL-3).
import { and, asc, eq } from 'drizzle-orm';

import { AI_TASKS } from '@learny/config';
import {
  AiModelsUpdateBody,
  QualificationReport,
  type AiModelOption,
  type AiModelUnavailableReason,
  type AiModelsState,
  type AiProviderCard,
  type AiProviderFailure,
  type AiTaskModelState,
} from '@learny/contracts';
import { AppError, type Result } from '@learny/core';
import {
  aiCredentials,
  aiTaskModels,
  setTaskModel,
  type AiProviderValue,
  type AiTaskValue,
  type DbTx,
} from '@learny/db';
import { TASK_CONFIG, providerRegion, type TaskCapability } from '@learny/llm';
import { maskKey } from '@learny/llm/credentials';

import type { ServiceContext } from './context';
import { requireUser, toResult } from './resources/result';

/** Rows as selected by this module: never `encryptedKey`, never a raw report key (BR-IA-03). */
export interface CredentialRow {
  id: string;
  provider: AiProviderValue;
  label: string;
  modelIds: readonly string[];
  keyLast4: string | null;
  status: 'untested' | 'qualified' | 'failed';
  qualification: Record<string, unknown>;
  outsideEu: boolean;
  qualifiedAt: Date | null;
  createdAt: Date;
}

export interface AssignmentRow {
  task: AiTaskValue;
  credentialId: string | null;
  modelId: string;
}

function recordOf(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function validationFailure(message: string, path = 'body'): AppError {
  return new AppError('VALIDATION_FAILED', message, {
    status: 400,
    errors: [{ path, message }],
  });
}

/** CL-1 — the PATCH body is parsed before any transaction; an invalid body writes nothing. */
export function parseModelsUpdate(input: unknown): AiModelsUpdateBody {
  const parsed = AiModelsUpdateBody.safeParse(input);
  if (!parsed.success) {
    throw new AppError('VALIDATION_FAILED', 'Les données envoyées sont invalides.', {
      status: 400,
      errors: parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.') || 'body',
        message: issue.message,
      })),
    });
  }
  return parsed.data;
}

/** EF-1 — routing capabilities of a task, from the single source of `@learny/llm`. */
export function taskCapabilities(task: AiTaskValue): TaskCapability[] {
  return [...TASK_CONFIG[task].capabilities];
}

/** SPEC-506 — the per-model qualification report stored with the credential, when present. */
export function qualificationReportOf(
  qualification: Record<string, unknown>,
  modelId: string,
): QualificationReport | null {
  const candidate = recordOf(recordOf(qualification.models)[modelId]);
  const parsed = QualificationReport.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/**
 * EF-1, ET-3 — a model enters a selector only when the credential is qualified, the model is
 * declared on the key and every capability of the task is proven. Rows created before the
 * per-model battery keep their credential-level status (same rule as `resolveModel`).
 */
export function modelQualifiedForTask(
  row: Pick<CredentialRow, 'modelIds' | 'status' | 'qualification'>,
  modelId: string,
  capabilities: readonly TaskCapability[],
): boolean {
  if (row.status !== 'qualified') return false;
  if (!row.modelIds.includes(modelId)) return false;
  const report = qualificationReportOf(row.qualification, modelId);
  if (report === null) return Object.keys(recordOf(row.qualification.models)).length === 0;
  if (report.status !== 'qualified') return false;
  return capabilities.every((capability) => report.capabilities[capability]);
}

function personalOptionsFor(
  task: AiTaskValue,
  row: CredentialRow,
  capabilities: readonly TaskCapability[],
): AiModelOption[] {
  const models = row.modelIds.filter((modelId) =>
    modelQualifiedForTask(row, modelId, capabilities),
  );
  const region = providerRegion(row.provider);
  return models.map((modelId) => ({
    modelId,
    // The mockup shows « Fournisseur · ma clé » when one model is usable for the task; a second
    // qualified model adds its identifier so the two options stay distinct.
    label:
      models.length === 1
        ? `${region.providerLabel} · ma clé`
        : `${region.providerLabel} · ${modelId}`,
    credentialId: row.id,
    provider: row.provider,
    providerLabel: region.providerLabel,
    outsideEu: region.outsideEu,
  }));
}

/** EF-1 — every model a task can select: the qualified models of the learner's keys. */
export function modelOptionsForTask(
  task: AiTaskValue,
  credentials: readonly CredentialRow[],
): AiModelOption[] {
  const capabilities = taskCapabilities(task);
  return credentials.flatMap((row) => personalOptionsFor(task, row, capabilities));
}

function unavailableReason(
  row: CredentialRow | undefined,
  modelId: string,
  capabilities: readonly TaskCapability[],
): AiModelUnavailableReason | null {
  if (row === undefined) return 'credential_not_qualified';
  if (!row.modelIds.includes(modelId)) return 'personal_model_missing';
  return modelQualifiedForTask(row, modelId, capabilities) ? null : 'credential_not_qualified';
}

/** EF-2, CL-3 — one row of « Modèle par tâche », with the pills derived from the chosen model. */
export function taskStateOf(
  task: AiTaskValue,
  assignment: AssignmentRow | undefined,
  credentials: readonly CredentialRow[],
): AiTaskModelState {
  const capabilities = taskCapabilities(task);
  const options = modelOptionsForTask(task, credentials);

  // No default model: nothing chosen means the task cannot run.
  if (assignment === undefined) {
    return {
      task,
      requiredCapabilities: capabilities,
      modelId: null,
      credentialId: null,
      provider: null,
      providerLabel: null,
      outsideEu: false,
      available: false,
      unavailableReason: 'no_model_selected',
      options,
    };
  }

  // CL-3 — the personal key was deleted: the task refuses instead of picking another model.
  if (assignment.credentialId === null) {
    return {
      task,
      requiredCapabilities: capabilities,
      modelId: assignment.modelId,
      credentialId: null,
      provider: null,
      providerLabel: 'Modèle personnel',
      outsideEu: false,
      available: false,
      unavailableReason: 'credential_not_qualified',
      options,
    };
  }

  const row = credentials.find((candidate) => candidate.id === assignment.credentialId);
  const reason = unavailableReason(row, assignment.modelId, capabilities);
  const region = row === undefined ? null : providerRegion(row.provider);
  return {
    task,
    requiredCapabilities: capabilities,
    modelId: assignment.modelId,
    credentialId: assignment.credentialId,
    provider: row?.provider ?? null,
    providerLabel: region?.providerLabel ?? 'Modèle personnel',
    outsideEu: region?.outsideEu ?? false,
    available: reason === null,
    unavailableReason: reason,
    options,
  };
}

/** CL-5 — the faulty stage of the last battery, without any prompt, key or payload. */
export function providerFailureOf(
  qualification: Record<string, unknown>,
): AiProviderFailure | null {
  const models = Object.values(recordOf(qualification.models)).map(recordOf);
  const lastRunId = typeof qualification.lastRunId === 'string' ? qualification.lastRunId : null;
  const ordered =
    lastRunId === null
      ? models
      : [
          ...models.filter((entry) => entry.id === lastRunId),
          ...models.filter((entry) => entry.id !== lastRunId),
        ];
  for (const candidate of ordered) {
    const parsed = QualificationReport.safeParse(candidate);
    if (!parsed.success || parsed.data.status !== 'failed') continue;
    const step = parsed.data.steps.find((entry) => entry.status === 'failed')?.step ?? 'bricks';
    const brick = parsed.data.bricks.find((entry) => entry.status === 'failed');
    return { step, brickType: step === 'bricks' ? (brick?.type ?? null) : null };
  }
  return null;
}

/** BR-SET-05, BR-IA-03 — one provider card; the key is only ever a mask. */
export function providerCardOf(row: CredentialRow): AiProviderCard {
  const region = providerRegion(row.provider);
  const prefix = typeof row.qualification.keyPrefix === 'string' ? row.qualification.keyPrefix : '';
  const running = recordOf(row.qualification.run).status === 'running';
  return {
    id: row.id,
    provider: row.provider,
    providerLabel: region.providerLabel,
    label: row.label,
    keyMasked: row.keyLast4 === null ? null : maskKey(row.keyLast4, prefix),
    status: row.status === 'qualified' ? 'qualified' : running ? 'pending' : 'unqualified',
    outsideEu: region.outsideEu,
    dataNote: region.dataNote,
    models: [...row.modelIds],
    qualifiedAt: row.qualifiedAt === null ? null : row.qualifiedAt.toISOString(),
    failure: providerFailureOf(row.qualification),
  };
}

/**
 * EF-1, EF-2 — reads the whole tab in one RLS transaction: credentials (masked), assignments
 * and the five task rows. The order is deterministic: mockup task order, then
 * credentials oldest first and models in declaration order.
 */
export async function readAiModelsState(
  tx: DbTx,
  userId: string,
  now: Date,
): Promise<AiModelsState> {
  const credentials = await tx
    .select({
      id: aiCredentials.id,
      provider: aiCredentials.provider,
      label: aiCredentials.label,
      modelIds: aiCredentials.modelIds,
      keyLast4: aiCredentials.keyLast4,
      status: aiCredentials.status,
      qualification: aiCredentials.qualification,
      outsideEu: aiCredentials.outsideEu,
      qualifiedAt: aiCredentials.qualifiedAt,
      createdAt: aiCredentials.createdAt,
    })
    .from(aiCredentials)
    .where(eq(aiCredentials.userId, userId))
    .orderBy(asc(aiCredentials.createdAt));
  const assignments = await tx
    .select({
      task: aiTaskModels.task,
      credentialId: aiTaskModels.credentialId,
      modelId: aiTaskModels.modelId,
    })
    .from(aiTaskModels)
    .where(eq(aiTaskModels.userId, userId));

  return {
    tasks: AI_TASKS.map((task) =>
      taskStateOf(
        task,
        assignments.find((candidate) => candidate.task === task),
        credentials,
      ),
    ),
    providers: credentials.map((row) => providerCardOf(row)),
    updatedAt: now.toISOString(),
  };
}

/** GET /api/v1/me/ai/models — the tab state of the authenticated learner (EF-1, EF-2). */
export function getAiModelsState(ctx: ServiceContext): Promise<Result<AiModelsState>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    return db.run((tx) => readAiModelsState(tx, userId, ctx.clock.now()));
  });
}

/**
 * PATCH /api/v1/me/ai/models — assigns a model to one task or clears that task. The write
 * and the returned state share one transaction; a repeated request only updates the same
 * `(user_id, task)` row, so no write is ever duplicated (CL-2). The key rows are never touched
 * (EF-2): clearing a task keeps the credentials and their qualification.
 */
export function updateAiModels(
  ctx: ServiceContext,
  input: unknown,
): Promise<Result<AiModelsState>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const value = parseModelsUpdate(input);
    const now = ctx.clock.now();
    return db.run(async (tx) => {
      if (value.action === 'clear') {
        await tx
          .delete(aiTaskModels)
          .where(and(eq(aiTaskModels.userId, userId), eq(aiTaskModels.task, value.task)));
        return readAiModelsState(tx, userId, now);
      }

      const rows = await tx
        .select({
          id: aiCredentials.id,
          modelIds: aiCredentials.modelIds,
          status: aiCredentials.status,
          qualification: aiCredentials.qualification,
        })
        .from(aiCredentials)
        .where(and(eq(aiCredentials.id, value.credentialId), eq(aiCredentials.userId, userId)))
        .limit(1);
      const row = rows[0];
      // CL-1 — another learner's key is indistinguishable from an absent one.
      if (row === undefined) throw new AppError('NOT_FOUND', 'Modèle introuvable.');
      if (!row.modelIds.includes(value.modelId)) {
        throw validationFailure(
          'Ce modèle ne fait pas partie des modèles de cette clé.',
          'body.modelId',
        );
      }
      if (!modelQualifiedForTask(row, value.modelId, taskCapabilities(value.task))) {
        throw new AppError(
          'AI_MODEL_NOT_QUALIFIED',
          'Ce modèle n’est pas qualifié pour cette tâche. Lancez la qualification puis réessayez.',
          { status: 422 },
        );
      }
      await setTaskModel(tx, {
        userId,
        task: value.task,
        credentialId: value.credentialId,
        modelId: value.modelId,
      });
      return readAiModelsState(tx, userId, now);
    });
  });
}
