// Base journal of every model call (SPEC-504 EF-5, ET-7, BR-IA-08). Exactly one row per call;
// AI_UNAVAILABLE happens before any call and therefore writes none (CL-1). The platform does not
// bill the learner's own provider: every row carries a zero cost and `managed = false`.
import type { AiTask } from '@learny/config';
import { clock } from '@learny/core';
import {
  recordAiCall,
  type AiCall,
  type AiCallStatusValue,
  type AiProviderValue,
  type Db,
  type DbTx,
} from '@learny/db';

export interface CallUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface LogCallInput {
  userId: string;
  formationId?: string | null;
  task: AiTask;
  provider: AiProviderValue;
  model: string;
  usage: CallUsage;
  latencyMs: number;
  status: AiCallStatusValue;
  errorCode?: string | null;
  /** BR-IA-13 — non-urgent provider batch, journaled as such. */
  batch?: boolean;
  createdAt?: Date;
}

export async function logCall(db: Db, input: LogCallInput): Promise<AiCall> {
  // A top-level database handle and a transaction are interchangeable for this insert.
  return recordAiCall(db as unknown as DbTx, {
    userId: input.userId,
    formationId: input.formationId ?? null,
    task: input.task,
    provider: input.provider,
    model: input.model,
    managed: false,
    inputTokens: input.usage.inputTokens,
    outputTokens: input.usage.outputTokens,
    cacheReadTokens: input.usage.cacheReadTokens,
    cacheWriteTokens: input.usage.cacheWriteTokens,
    costUsd: 0,
    latencyMs: input.latencyMs,
    status: input.status,
    errorCode: input.errorCode ?? null,
    batch: input.batch ?? false,
    createdAt: input.createdAt ?? clock.now(),
  });
}
