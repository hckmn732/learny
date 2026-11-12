// Result of a service call (docs/engineering/conventions.md §2, SPEC-201 ET-2).
import type { AppError } from './errors';

export type Result<T, E = AppError> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

export function err<E>(error: E): { ok: false; error: E } {
  return { ok: false, error };
}
