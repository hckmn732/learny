// Validation of the three inputs of a route (SPEC-201 EF-1, EF-6, ET-3 step 5).
import { z } from 'zod';

import { AppError } from '@learny/core';

export type InputLocation = 'params' | 'query' | 'body';

/** Query object from the URL: a repeated key becomes an array (`?a=1&a=2` → `{ a: ['1','2'] }`). */
export function queryToObject(search: URLSearchParams): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  for (const key of new Set(search.keys())) {
    const values = search.getAll(key);
    result[key] = values.length === 1 ? (values[0] as string) : values;
  }
  return result;
}

const frenchMessages = z.locales.fr().localeError;

/** Parses `value`; on failure throws `VALIDATION_FAILED` with paths prefixed by the location. */
export function validateInput<T>(schema: z.ZodType<T>, value: unknown, location: InputLocation): T {
  const parsed = schema.safeParse(value, { error: frenchMessages });
  if (parsed.success) return parsed.data;
  throw new AppError('VALIDATION_FAILED', 'Les données envoyées sont invalides.', {
    errors: parsed.error.issues.map((issue) => ({
      path: [location, ...issue.path.map(String)].join('.'),
      message: issue.message,
    })),
  });
}

export function invalidInput(path: string, message: string): AppError {
  return new AppError('VALIDATION_FAILED', 'Les données envoyées sont invalides.', {
    errors: [{ path, message }],
  });
}
