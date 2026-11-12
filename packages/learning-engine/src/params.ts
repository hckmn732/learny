// Parameter resolution of the engine (SPEC-401 ET-4): a deep merge of the `ENGINE` defaults with a
// partial user setting. Arrays are replaced, never concatenated; a value outside an `allowed…`
// list raises `INVALID_PARAM` (CL-7).
import { ENGINE } from '@learny/config/product';
import type { EngineParams } from '@learny/config/product';

import { EngineError } from './errors';

/** Literal types of `ENGINE` are widened: an override is a runtime value validated below. */
export type WidenLiterals<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : T extends readonly (infer U)[]
        ? readonly WidenLiterals<U>[]
        : T extends object
          ? { readonly [K in keyof T]: WidenLiterals<T[K]> }
          : T;

export type DeepPartial<T> = T extends readonly (infer U)[]
  ? readonly DeepPartial<WidenLiterals<U>>[]
  : T extends object
    ? { readonly [K in keyof T]?: DeepPartial<WidenLiterals<T[K]>> }
    : WidenLiterals<T>;

/** Default key guarded by an `allowed…` list of the same level. */
const ALLOWED_DEFAULTS: Readonly<Record<string, string>> = {
  allowedMaxMinutes: 'maxMinutesDefault',
  allowedMicroMinutes: 'microMinutesDefault',
  allowedSprintDaysBefore: 'sprintDaysBeforeDefault',
  allowedCounts: 'defaultCount',
  allowedRetentions: 'requestRetention',
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidParam(path: string, message: string): EngineError {
  return new EngineError('INVALID_PARAM', message, { path });
}

function clone<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item: unknown) => clone(item)) as T;
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])) as T;
  }
  return value;
}

function validateAllowedList(base: Record<string, unknown>, key: string, value: unknown): void {
  const allowed = base[key];
  if (!Array.isArray(allowed)) return;
  if (!Array.isArray(value)) {
    throw invalidParam(key, `${key} doit être un tableau.`);
  }
  for (const item of value) {
    if (!allowed.includes(item)) {
      throw invalidParam(key, `${String(item)} n’est pas une valeur autorisée de ${key}.`);
    }
  }
}

function validateObject(
  base: Record<string, unknown>,
  overrides: Record<string, unknown>,
  path: string,
) {
  for (const [key, value] of Object.entries(overrides)) {
    if (!(key in base)) {
      throw invalidParam(path === '' ? key : `${path}.${key}`, `Paramètre inconnu : ${key}.`);
    }
    const at = path === '' ? key : `${path}.${key}`;
    const allowed = base[key];
    if (key.startsWith('allowed') && Array.isArray(allowed)) {
      validateAllowedList(base, key, value);
    }
    for (const [allowedKey, defaultKey] of Object.entries(ALLOWED_DEFAULTS)) {
      if (defaultKey !== key) continue;
      const list = base[allowedKey];
      if (Array.isArray(list) && !list.includes(value)) {
        throw invalidParam(at, `${String(value)} n’est pas une valeur autorisée de ${allowedKey}.`);
      }
    }
  }
}

function deepMerge(base: unknown, overrides: unknown, path: string): unknown {
  if (overrides === undefined) return clone(base);
  if (Array.isArray(overrides)) return (overrides as unknown[]).map((item) => clone(item));
  if (!isPlainObject(overrides)) return overrides;
  if (!isPlainObject(base)) throw invalidParam(path, `Objet attendu pour ${path}.`);

  validateObject(base, overrides, path);
  const result: Record<string, unknown> = { ...clone(base) };
  for (const [key, value] of Object.entries(overrides)) {
    result[key] = deepMerge(base[key], value, path === '' ? key : `${path}.${key}`);
  }
  return result;
}

/**
 * Defaults of one engine area, with the given overrides applied. The returned object is a fresh
 * deep copy, so a caller can never mutate `ENGINE` through it.
 */
export function withParams<K extends keyof EngineParams>(
  key: K,
  overrides?: DeepPartial<EngineParams[K]>,
): EngineParams[K] {
  if (!(key in ENGINE)) {
    throw new EngineError('INVALID_PARAM', `Paramètre inconnu : ${key}`, { path: key });
  }
  return deepMerge(ENGINE[key], overrides, key) as EngineParams[K];
}
