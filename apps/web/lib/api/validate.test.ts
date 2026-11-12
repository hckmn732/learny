import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { AppError } from '@learny/core';

import { queryToObject, validateInput } from './validate';

function failure(run: () => unknown): AppError {
  try {
    run();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('expected a validation error');
}

describe('[SPEC-201] validation', () => {
  it('turns a query string into an object, repeated keys into arrays', () => {
    expect(queryToObject(new URLSearchParams('a=1&b=x&a=2&c='))).toEqual({
      a: ['1', '2'],
      b: 'x',
      c: '',
    });
    expect(queryToObject(new URLSearchParams(''))).toEqual({});
  });

  it('returns the parsed value, with defaults and coercions', () => {
    const schema = z.object({ limit: z.coerce.number().int().default(20) });
    expect(validateInput(schema, {}, 'query')).toEqual({ limit: 20 });
    expect(validateInput(schema, { limit: '5' }, 'query')).toEqual({ limit: 5 });
  });

  it('prefixes the paths with the location (params., query., body.)', () => {
    const schema = z.object({ title: z.string().min(1), nested: z.object({ n: z.number() }) });
    const error = failure(() => validateInput(schema, { title: '', nested: { n: 'x' } }, 'body'));
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.errors?.map((entry) => entry.path)).toEqual(['body.title', 'body.nested.n']);
    for (const entry of error.errors ?? []) expect(entry.message.length).toBeGreaterThan(0);

    const query = failure(() => validateInput(z.object({ limit: z.number() }), {}, 'query'));
    expect(query.errors?.[0]?.path).toBe('query.limit');
    const params = failure(() => validateInput(z.object({ id: z.uuid() }), { id: 'x' }, 'params'));
    expect(params.errors?.[0]?.path).toBe('params.id');
  });

  it('uses the location alone for a root-level issue', () => {
    const error = failure(() => validateInput(z.string(), 42, 'body'));
    expect(error.errors?.[0]?.path).toBe('body');
  });
});
