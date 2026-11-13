// Base journal of every model call (SPEC-504 EF-5, ET-7, BR-IA-08). Exactly one row per call;
// AI_UNAVAILABLE happens before any call and therefore writes none (CL-1).
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

export interface CostInput {
  task: AiTask;
  provider: AiProviderValue;
  model: string;
  managed: boolean;
  usage: CallUsage;
}

/** SPEC-507 plugs the real estimator; the default keeps the journal at zero cost (EF-5). */
export type CostCalculator = (input: CostInput) => string | number;

export const zeroCost: CostCalculator = () => 0;

export interface LogCallInput {
  userId: string;
  formationId?: string | null;
  task: AiTask;
  provider: AiProviderValue;
  model: string;
  managed: boolean;
  usage: CallUsage;
  latencyMs: number;
  status: AiCallStatusValue;
  errorCode?: string | null;
  costCalculator?: CostCalculator;
  createdAt?: Date;
}

export async function logCall(db: Db, input: LogCallInput): Promise<AiCall> {
  const cost = (input.costCalculator ?? zeroCost)({
    task: input.task,
    provider: input.provider,
    model: input.model,
    managed: input.managed,
    usage: input.usage,
  });
  // A top-level database handle and a transaction are interchangeable for this insert.
  return recordAiCall(db as unknown as DbTx, {
    userId: input.userId,
    formationId: input.formationId ?? null,
    task: input.task,
    provider: input.provider,
    model: input.model,
    managed: input.managed,
    inputTokens: input.usage.inputTokens,
    outputTokens: input.usage.outputTokens,
    cacheReadTokens: input.usage.cacheReadTokens,
    cacheWriteTokens: input.usage.cacheWriteTokens,
    costUsd: cost,
    latencyMs: input.latencyMs,
    status: input.status,
    errorCode: input.errorCode ?? null,
    batch: false,
    createdAt: input.createdAt ?? clock.now(),
  });
}
