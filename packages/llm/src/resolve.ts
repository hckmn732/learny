// Resolution (user, task) → model (SPEC-504 EF-1, ET-2, BR-IA-01, BR-IA-06, ADR-0013).
// Reads are scoped by the explicit `userId` because jobs call this function outside RLS; the
// caller passes the service-role client (SPEC-504 §8).
import { and, eq } from 'drizzle-orm';

import {
  DEFAULT_MODEL_BY_TASK,
  isProvidedModel,
  type AiModelId,
  type AiTask,
} from '@learny/config';
import { clock, err, ok, type Result } from '@learny/core';
import {
  aiCredentials,
  aiTaskModels,
  subscriptions,
  type AiProviderValue,
  type Db,
} from '@learny/db';

import { aiUnavailable } from './errors';

export type ManagedModelId = AiModelId;

export type ResolvedModel =
  | { kind: 'managed'; provider: 'anthropic'; modelId: ManagedModelId; task: AiTask }
  | {
      kind: 'byok';
      provider: AiProviderValue;
      modelId: string;
      credentialId: string;
      baseUrl: string | null;
      outsideEu: boolean;
      task: AiTask;
    };

export interface ResolveInput {
  userId: string;
  task: AiTask;
}

/**
 * SPEC-210 owns the entitlement decision; the same rule is applied here without importing the
 * services package (the architecture forbids `llm → services`, overview §3). No cache: an expired
 * period or a `past_due` subscription loses the provided AI immediately (CL-8).
 */
async function hasManagedAi(db: Db, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ status: subscriptions.status, currentPeriodEnd: subscriptions.currentPeriodEnd })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);
  if (row === undefined || row.status !== 'active' || row.currentPeriodEnd === null) return false;
  return row.currentPeriodEnd.getTime() > clock.now().getTime();
}

function managed(task: AiTask, requested: string | null): ResolvedModel {
  const modelId =
    requested !== null && isProvidedModel(requested) ? requested : DEFAULT_MODEL_BY_TASK[task];
  return { kind: 'managed', provider: 'anthropic', modelId, task };
}

/**
 * SPEC-506 EF-4 — a model-specific qualification report gates the assignment. Rows created before
 * the battery (seeds and demonstrations) keep their credential-level `qualified` status.
 */
function modelQualified(
  status: string | null,
  qualification: Record<string, unknown> | null,
  modelId: string,
): boolean {
  if (status !== 'qualified') return false;
  const models = qualification?.models;
  if (models === null || typeof models !== 'object' || Array.isArray(models)) return true;
  const report = (models as Record<string, unknown>)[modelId];
  if (report === null || typeof report !== 'object') return true;
  return (report as { status?: unknown }).status === 'qualified';
}

export async function resolveModel(db: Db, input: ResolveInput): Promise<Result<ResolvedModel>> {
  const rows = await db
    .select({
      task: aiTaskModels.task,
      credentialId: aiTaskModels.credentialId,
      modelId: aiTaskModels.modelId,
      provider: aiCredentials.provider,
      status: aiCredentials.status,
      modelIds: aiCredentials.modelIds,
      qualification: aiCredentials.qualification,
      baseUrl: aiCredentials.baseUrl,
      outsideEu: aiCredentials.outsideEu,
    })
    .from(aiTaskModels)
    .leftJoin(aiCredentials, eq(aiCredentials.id, aiTaskModels.credentialId))
    .where(and(eq(aiTaskModels.userId, input.userId), eq(aiTaskModels.task, input.task)))
    .limit(1);
  const row = rows[0];

  // (1) a usable personal model wins, even without a subscription.
  if (
    row !== undefined &&
    row.credentialId !== null &&
    row.provider !== null &&
    modelQualified(row.status, row.qualification, row.modelId) &&
    (row.modelIds ?? []).includes(row.modelId)
  ) {
    return ok({
      kind: 'byok',
      provider: row.provider,
      modelId: row.modelId,
      credentialId: row.credentialId,
      baseUrl: row.baseUrl,
      outsideEu: row.outsideEu ?? false,
      task: input.task,
    });
  }

  // (2) CL-3, BR-IA-05 — the learner chose a personal model that is no longer usable (failed
  // re-test, removed model, deleted key): the task refuses instead of silently billing the
  // provided AI. A provided override (credential_id null, Claude model) is handled below.
  if (row !== undefined && row.credentialId !== null) {
    return err(aiUnavailable('credential_not_qualified', { credentialId: row.credentialId }));
  }

  const entitled = await hasManagedAi(db, input.userId);

  // (3) the provided AI, with a Claude override only when the row names one of its models.
  if (entitled) return ok(managed(input.task, row?.modelId ?? null));

  // (4) a row points at a key deleted by cascade, or at an unknown model.
  if (row !== undefined) {
    return err(aiUnavailable('credential_not_qualified'));
  }

  // (5) no choice and no subscription.
  return err(aiUnavailable('no_subscription_no_key'));
}
