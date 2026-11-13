// Price of one model call (SPEC-507 ET-2, CL-3, ADR-0073, ADR-0228).
//
// The catalogue is the only source of prices: an unknown model never invents a provider cost. A
// personal model returns a zero cost marked as unpriced, because Learny does not bill the learner's
// own provider; a provided model returns the six-decimal amount written to `ai_calls.cost_usd`.
// Amounts are accumulated in integer micro-USD so a cache read or a batch discount cannot drift.
import { isProvidedModel, modelPrices, type ModelPrices } from '@learny/config';

export const USD_SCALE = 1_000_000;

export interface UsageTokens {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export interface UsageCostInput {
  model: string;
  /** True for the provided AI, false for a personal key. */
  managed: boolean;
  usage: UsageTokens;
  /** BR-IA-13 — batch processing is sold at half price. */
  batch?: boolean;
}

export interface UsageCost {
  /** Six decimals, the precision of `numeric(12,6)`; never negative. */
  costUsd: string;
  /** False when no configured price applies (personal or unknown model). */
  priced: boolean;
}

export function formatUsdMicros(micros: number): string {
  const value = Math.max(0, Math.round(micros));
  const whole = Math.floor(value / USD_SCALE);
  const fraction = String(value % USD_SCALE).padStart(6, '0');
  return `${String(whole)}.${fraction}`;
}

/** Reads a non-negative USD amount (string or number) into integer micro-USD. */
export function parseUsdMicros(value: string | number): number {
  const text = typeof value === 'number' ? value.toFixed(6) : value.trim();
  if (!/^\d{1,6}(\.\d{1,6})?$/u.test(text)) {
    throw new Error(`montant USD invalide : ${String(value)}`);
  }
  const [whole = '0', fraction = ''] = text.split('.');
  return Number(whole) * USD_SCALE + Number(fraction.padEnd(6, '0'));
}

/** Prices configured for one provided model, or null for any other identifier. */
export function pricesForModel(model: string): ModelPrices | null {
  return isProvidedModel(model) ? modelPrices(model) : null;
}

/**
 * ET-2 — actual cost of a completed call. Cache reads and writes use their configured ratio; a
 * batch call applies the batch discount to every component (BR-IA-13).
 */
export function calculateUsageCost(input: UsageCostInput): UsageCost {
  const prices = input.managed ? pricesForModel(input.model) : null;
  if (prices === null) return { costUsd: formatUsdMicros(0), priced: false };
  const factor = input.batch === true ? 0.5 : 1;
  const micros =
    input.usage.inputTokens * prices.input * factor +
    input.usage.outputTokens * prices.output * factor +
    (input.usage.cacheReadTokens ?? 0) * prices.cacheRead * factor +
    (input.usage.cacheWriteTokens ?? 0) * prices.cacheWrite * factor;
  return { costUsd: formatUsdMicros(Math.round(micros)), priced: true };
}

/**
 * ET-1 — conservative estimate before a call. The caller gives the input count (four characters
 * per token) and the output ceiling of the task; no cache is assumed.
 */
export function estimateUsageCost(input: {
  model: string;
  managed: boolean;
  inputTokens: number;
  outputTokens: number;
  batch?: boolean;
}): UsageCost {
  return calculateUsageCost({
    model: input.model,
    managed: input.managed,
    usage: { inputTokens: input.inputTokens, outputTokens: input.outputTokens },
    ...(input.batch === undefined ? {} : { batch: input.batch }),
  });
}
