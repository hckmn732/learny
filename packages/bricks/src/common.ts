// Common fields and plumbing of every brick schema (SPEC-501 ET-2). All schemas are strict, every
// string is trimmed before validation, and a string that is empty after trimming is invalid.
import { z } from 'zod';

import { BRICK_ORIGINS, BRICK_PURPOSES, BRICK_TYPES } from './brick-types';
import { brickIssue, uniqueIssues, type BrickIssue } from './issues';

export const uuid = z.uuid();

/** BR-BRI-05 — one located passage cited by a brick. */
export const sourceRefSchema = z
  .object({
    chunkId: uuid,
    quote: z.string().trim().min(1).max(300).optional(),
  })
  .strict();

export type SourceRef = z.infer<typeof sourceRefSchema>;

/** Every payload carries its source references (0 to 10), possibly omitted from model output. */
export const sourcesSchema = z.array(sourceRefSchema).max(10).default([]);

/** Trimmed bounded string. */
export function text(min: number, max: number) {
  return z.string().trim().min(min).max(max);
}

/** Trimmed bounded string that may be omitted. */
export function optionalText(min: number, max: number) {
  return z.string().trim().min(min).max(max).optional();
}

/** Integer in a closed interval. */
export function integer(min: number, max: number) {
  return z.number().int().min(min).max(max);
}

/** Positive finite number. */
export function positiveNumber() {
  return z.number().positive();
}

/** Option, criterion and category key: lower-case ASCII, digits and underscore. */
export const criterionKey = z
  .string()
  .trim()
  .regex(/^[a-z0-9_]{1,32}$/);

/** Option, item, pair and category identifier: 1 to 8 lower-case ASCII characters or digits. */
export const itemId = z
  .string()
  .trim()
  .regex(/^[a-z0-9]{1,8}$/);

/** Column key: a letter, then lower-case ASCII, digits or underscore. */
export const columnKey = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_]{0,31}$/);

/** The draft submitted to `validateBrick` (ET-2). Unknown fields are refused. */
export const brickDraftSchema = z
  .object({
    type: z.enum(BRICK_TYPES),
    formationId: uuid,
    purpose: z.enum(BRICK_PURPOSES),
    notionIds: z.array(uuid).max(10),
    origin: z.enum(BRICK_ORIGINS),
    payload: z.unknown(),
  })
  .strict();

export type BrickDraft = z.infer<typeof brickDraftSchema>;

// eslint-disable-next-line no-control-regex -- CL-11 deliberately rejects control characters.
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B-\u001F]/u;

/**
 * CL-11 — control characters are refused everywhere except `\n` and `\t`, on the raw draft and
 * before trimming. Returns one issue per offending string.
 */
export function controlCharacterIssues(
  value: unknown,
  path = '',
  found: BrickIssue[] = [],
): BrickIssue[] {
  if (typeof value === 'string') {
    const match = CONTROL_CHARACTERS.exec(value);
    if (match !== null) {
      const codePoint = (match[0].codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0');
      found.push(
        brickIssue(
          'SCHEMA_INVALID',
          path === '' ? '(root)' : path,
          `Control character U+${codePoint} is not allowed.`,
        ),
      );
    }
    return found;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      controlCharacterIssues(item, path === '' ? String(index) : `${path}.${String(index)}`, found);
    });
    return found;
  }
  if (typeof value === 'object' && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      controlCharacterIssues(item, path === '' ? key : `${path}.${key}`, found);
    }
  }
  return found;
}

/** Recursively trims every string of a JSON-like value; other values are returned unchanged. */
export function trimDeep(value: unknown): unknown {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map(trimDeep);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, trimDeep(item)]));
  }
  return value;
}

function joinPath(prefix: string, path: ReadonlyArray<PropertyKey>): string {
  const segments = path.map(String).filter((segment) => segment !== '');
  return [prefix, ...segments].filter((segment) => segment !== '').join('.');
}

/**
 * Converts Zod issues to readable `SCHEMA_INVALID` issues. Unknown keys are expanded one by one so
 * that `hint` instead of `hints` reports the exact path `payload.hint` (CL-1).
 */
export function zodIssuesToBrickIssues(error: z.ZodError, prefix: string): BrickIssue[] {
  const issues: BrickIssue[] = [];

  const walk = (list: readonly z.core.$ZodIssue[], base: ReadonlyArray<PropertyKey>): void => {
    for (const issue of list) {
      const at = [...base, ...issue.path];
      if (issue.code === 'unrecognized_keys') {
        for (const key of issue.keys) {
          issues.push(
            brickIssue(
              'SCHEMA_INVALID',
              joinPath(prefix, [...at, key]),
              `Unrecognized key: "${key}".`,
            ),
          );
        }
        continue;
      }
      const nested =
        issue.code === 'invalid_union' && 'errors' in issue
          ? (issue.errors as ReadonlyArray<ReadonlyArray<z.core.$ZodIssue>>)
          : undefined;
      if (nested !== undefined && nested.length > 0) {
        for (const branch of nested) walk(branch, at);
        continue;
      }
      issues.push(brickIssue('SCHEMA_INVALID', joinPath(prefix, at), issue.message));
    }
  };

  walk(error.issues, []);
  return uniqueIssues(issues);
}
