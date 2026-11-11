// AI prices in USD per million tokens (ADR-0073, ADR-0228). Configuration data: no network call at
// module load, no secret. To be re-checked before the production checklist of SPEC-808 (CL-8).
import { AI_MODEL_IDS, type AiModelId } from './models';

/** Unit of every price below. */
export const PRICE_UNIT = 'USD_PER_MILLION_TOKENS';

/** Cache reads cost 5 % of the input price; cache writes 125 % (5-minute cache, ADR-0228). */
export const CACHE_READ_RATIO = 0.05;
export const CACHE_WRITE_RATIO = 1.25;
/** Batch processing is sold at half price, input and output (BR-IA-13, ADR-0073). */
export const BATCH_DISCOUNT_RATIO = 0.5;

/** Base prices of the provided models: input and output per million tokens. */
export const MODEL_PRICING = {
  [AI_MODEL_IDS.opus]: { input: 4, output: 20 },
  [AI_MODEL_IDS.sonnet]: { input: 2, output: 10 },
  [AI_MODEL_IDS.haiku]: { input: 0.1, output: 0.5 },
} as const satisfies Record<AiModelId, { input: number; output: number }>;

export interface ModelPrices {
  /** Price of one million input tokens. */
  readonly input: number;
  /** Price of one million output tokens. */
  readonly output: number;
  /** Price of one million tokens read from the provider cache. */
  readonly cacheRead: number;
  /** Price of one million tokens written to the provider cache. */
  readonly cacheWrite: number;
  /** Price of one million input tokens through the batch API. */
  readonly batchInput: number;
  /** Price of one million output tokens through the batch API. */
  readonly batchOutput: number;
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/** Every price of a provided model, derived from the base table (EF-6). */
export function modelPrices(model: AiModelId): ModelPrices {
  const base = MODEL_PRICING[model];
  return {
    input: base.input,
    output: base.output,
    cacheRead: round(base.input * CACHE_READ_RATIO),
    cacheWrite: round(base.input * CACHE_WRITE_RATIO),
    batchInput: round(base.input * BATCH_DISCOUNT_RATIO),
    batchOutput: round(base.output * BATCH_DISCOUNT_RATIO),
  };
}
