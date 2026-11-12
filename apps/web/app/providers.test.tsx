import { describe, expect, it } from 'vitest';

import { ApiError } from '../lib/api-client';

import { createQueryClient } from './providers';

function retryRule() {
  const retry = createQueryClient().getDefaultOptions().queries?.retry;
  if (typeof retry !== 'function') throw new Error('retry doit être une fonction');
  return retry;
}

describe('[SPEC-201] TanStack Query', () => {
  it('uses the cache and refetch policy of ET-10', () => {
    const defaults = createQueryClient().getDefaultOptions();
    expect(defaults.queries).toMatchObject({
      staleTime: 30_000,
      gcTime: 300_000,
      refetchOnWindowFocus: true,
    });
    expect(defaults.mutations?.retry).toBe(0);
  });

  it('never retries a 4xx and retries other failures at most twice', () => {
    const retry = retryRule();
    const clientError = new ApiError('NOT_FOUND', 'x', { status: 404 });
    const serverError = new ApiError('INTERNAL_ERROR', 'x', { status: 500 });
    const network = new ApiError('NETWORK_ERROR', 'x', { status: 0 });
    expect(retry(0, clientError)).toBe(false);
    expect(retry(0, serverError)).toBe(true);
    expect(retry(1, network)).toBe(true);
    expect(retry(2, serverError)).toBe(false);
    expect(retry(0, new Error('inconnue'))).toBe(true);
  });
});
