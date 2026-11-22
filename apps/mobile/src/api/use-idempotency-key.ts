// Hook of the idempotency keys (SPEC-3003 ET-3).
//
// A screen calls `useIdempotencyKey(intentId)` once per intention (e.g. `question:${attemptId}`),
// passes `key` as `CallOptions.idempotencyKey` and calls `resolve()` only after a successful
// mutation: a retry, a 401 replay or an offline replay keeps the same key, so the server runs the
// service at most once (BR-PLA-08).
import { useCallback, useMemo, useState } from 'react';

import { idempotencyRegistry, type IdempotencyRegistry } from './idempotency';

export interface IdempotencyKeyHandle {
  /** `Idempotency-Key` of the intent, stable until `resolve`. */
  readonly key: string;
  /** Forgets the intent after a success: the next attempt gets a fresh key. */
  readonly resolve: () => void;
}

export function useIdempotencyKey(
  intentId: string,
  registry: IdempotencyRegistry = idempotencyRegistry,
): IdempotencyKeyHandle {
  // Bumped by `resolve` so the memo below asks the registry for a new key.
  const [revision, setRevision] = useState(0);

  const key = useMemo(
    () => registry.keyFor(intentId),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `revision` is the invalidation signal.
    [registry, intentId, revision],
  );

  const resolve = useCallback(() => {
    registry.resolve(intentId);
    setRevision((current) => current + 1);
  }, [intentId, registry]);

  return { key, resolve };
}
