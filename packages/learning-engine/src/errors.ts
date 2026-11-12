// Contract errors of the pure engine (SPEC-401 ET-6, ADR-0140): every invalid input raises
// `EngineError` with a stable code and, when the cause is a field, its Zod path. No other exception
// leaves a public function of the engine.
import type { ZodType } from 'zod';

export type EngineErrorCode =
  | 'INVALID_INPUT'
  | 'INVALID_INSTANT'
  | 'INVALID_PARAM'
  | 'REVIEW_OUT_OF_ORDER'
  | 'UNKNOWN_NOTION'
  | 'INVALID_AVAILABILITY';

export class EngineError extends Error {
  readonly code: EngineErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: EngineErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'EngineError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

/** Parses `value` with a strict schema, or raises `INVALID_INPUT` carrying the Zod path. */
export function assertValid<T>(schema: ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  const path = issue?.path.map(String).join('.') ?? '';
  throw new EngineError('INVALID_INPUT', issue?.message ?? 'Entrée invalide.', { path });
}
