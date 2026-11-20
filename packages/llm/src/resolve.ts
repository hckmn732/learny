// Resolution (user, task) → model (SPEC-504 EF-1, ET-2, BR-IA-02, BR-IA-05, BR-IA-06).
// The platform provides no model: a task runs only on the qualified personal model that the
// learner assigned to it. Without an assignment the task is unavailable, whatever the subscription.
// Reads are scoped by the explicit `userId` because jobs call this function outside RLS; the
// caller passes the service-role client (SPEC-504 §8).
import { and, eq } from 'drizzle-orm';

import type { AiTask } from '@learny/config';
import { err, ok, type Result } from '@learny/core';
import { aiCredentials, aiTaskModels, type AiProviderValue, type Db } from '@learny/db';

import { aiUnavailable } from './errors';

export interface ResolvedModel {
  kind: 'byok';
  provider: AiProviderValue;
  modelId: string;
  credentialId: string;
  baseUrl: string | null;
  outsideEu: boolean;
  task: AiTask;
}

export interface ResolveInput {
  userId: string;
  task: AiTask;
}

export async function resolveModel(db: Db, input: ResolveInput): Promise<Result<ResolvedModel>> {
  const rows = await db
    .select({
      credentialId: aiTaskModels.credentialId,
      modelId: aiTaskModels.modelId,
      provider: aiCredentials.provider,
      modelIds: aiCredentials.modelIds,
      baseUrl: aiCredentials.baseUrl,
      outsideEu: aiCredentials.outsideEu,
    })
    .from(aiTaskModels)
    .leftJoin(aiCredentials, eq(aiCredentials.id, aiTaskModels.credentialId))
    .where(and(eq(aiTaskModels.userId, input.userId), eq(aiTaskModels.task, input.task)))
    .limit(1);
  const row = rows[0];

  // (1) no assignment: the learner has not chosen a model for this task.
  if (row === undefined) return err(aiUnavailable('no_model_selected'));

  // (2) the assigned key was deleted (cascade) or never existed.
  if (row.credentialId === null || row.provider === null) {
    return err(aiUnavailable('credential_not_qualified'));
  }

  // (3) CL-3, BR-IA-05 — the chosen model is no longer usable (failed re-test, removed model):
  // the task refuses instead of silently switching to another model.
  if (!(row.modelIds ?? []).includes(row.modelId)) {
    return err(aiUnavailable('credential_not_qualified', { credentialId: row.credentialId }));
  }

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
