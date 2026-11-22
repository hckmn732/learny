// Vitest [SPEC-3003] — defaults and retry policy of TanStack Query (EF-4).
import { describe, expect, it } from 'vitest';

import { AppError } from '@learny/core';

import {
  createQueryClient,
  QUERY_GC_TIME_MS,
  QUERY_NETWORK_RETRIES,
  QUERY_STALE_TIME_MS,
  shouldRetry,
} from './query-client';

describe('[SPEC-3003] cache TanStack Query (EF-4)', () => {
  it('applique staleTime 30 s, gcTime 24 h et deux tentatives réseau', () => {
    const client = createQueryClient();
    const defaults = client.getDefaultOptions().queries ?? {};

    expect(QUERY_STALE_TIME_MS).toBe(30_000);
    expect(QUERY_GC_TIME_MS).toBe(86_400_000);
    expect(QUERY_NETWORK_RETRIES).toBe(2);
    expect(defaults.staleTime).toBe(QUERY_STALE_TIME_MS);
    expect(defaults.gcTime).toBe(QUERY_GC_TIME_MS);
    // The application drives the refresh itself (AppState, NetInfo).
    expect(defaults.refetchOnWindowFocus).toBe(false);
    expect(defaults.refetchOnReconnect).toBe(true);
    expect(client.getDefaultOptions().mutations?.retry).toBe(false);
  });

  it('ne réessaie jamais une réponse 4xx (EF-4)', () => {
    for (const status of [400, 401, 403, 404, 409, 422, 429]) {
      expect(shouldRetry(0, new AppError('VALIDATION_FAILED', 'x', { status }))).toBe(false);
    }
  });

  it('réessaie deux fois une panne réseau, puis abandonne (EF-4)', () => {
    const offline = new AppError('NETWORK_ERROR', 'x');
    expect(shouldRetry(0, offline)).toBe(true);
    expect(shouldRetry(1, offline)).toBe(true);
    expect(shouldRetry(2, offline)).toBe(false);
  });

  it('réessaie une erreur serveur mais pas une valeur qui n’est pas une erreur de l’API', () => {
    expect(shouldRetry(0, new AppError('INTERNAL_ERROR', 'x', { status: 500 }))).toBe(true);
    expect(shouldRetry(0, new Error('boom'))).toBe(false);
  });
});
