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
  const modelId = requested !== null && isProvidedModel(requested) ? requested : DEFAULT_MODEL_BY_TASK[task];
  return { kind: 'managed', provider: 'anthropic', modelId, task };
}

export async function resolveModel(
  db: Db,
  input: ResolveInput,
): Promise<Result<ResolvedModel>> {
  const rows = await db
    .select({
      task: aiTaskModels.task,
      credentialId: aiTaskModels.credentialId,
      modelId: aiTaskModels.modelId,
      provider: aiCredentials.provider,
      status: aiCredentials.status,
      modelIds: aiCredentials.modelIds,
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
    row.status === 'qualified' &&
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

  const entitled = await hasManagedAi(db, input.userId);

  // (2) the provided AI, with a Claude override only when the row names one of its models.
  if (entitled) return ok(managed(input.task, row?.modelId ?? null));

  // (3) a row points at an unqualified key (or at a key deleted by cascade).
  if (row !== undefined) {
    const deleted = row.credentialId === null && !isProvidedModel(row.modelId);
    return err(
      aiUnavailable(
        deleted || row.credentialId !== null ? 'credential_not_qualified' : 'no_subscription_no_key',
        row.credentialId === null ? {} : { credentialId: row.credentialId },
      ),
    );
  }

  // (4) no choice and no subscription.
  return err(aiUnavailable('no_subscription_no_key'));
}
