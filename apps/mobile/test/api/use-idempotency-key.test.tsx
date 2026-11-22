// Component tests of the idempotency key hook (SPEC-3003 ET-3).
// React Native Testing Library v14 renders (and fires events) asynchronously: every step is awaited.
import { act, renderHook } from '@testing-library/react-native';

import { IdempotencyRegistry } from '../../src/api/idempotency';
import { useIdempotencyKey } from '../../src/api/use-idempotency-key';

describe('[SPEC-3003] useIdempotencyKey (ET-3)', () => {
  it('garde la clé de l’intention jusqu’au succès de la mutation', async () => {
    const registry = new IdempotencyRegistry(() => 'cle-intention');
    const view = await renderHook(() => useIdempotencyKey('quiz:42', registry));

    const first = view.result.current.key;
    await view.rerender({});
    expect(view.result.current.key).toBe(first);
    expect(first).toBe('cle-intention');
  });

  it('fournit une clé neuve après `resolve`', async () => {
    let sequence = 0;
    const registry = new IdempotencyRegistry(() => `cle-${String((sequence += 1))}`);
    const view = await renderHook(() => useIdempotencyKey('note:7', registry));

    expect(view.result.current.key).toBe('cle-1');

    await act(() => {
      view.result.current.resolve();
    });

    expect(view.result.current.key).toBe('cle-2');
    expect(registry.has('note:7')).toBe(true);
  });

  it('isole les intentions par identifiant', async () => {
    const registry = new IdempotencyRegistry(() => 'cle-x');
    const first = await renderHook(() => useIdempotencyKey('a', registry));
    const second = await renderHook(() => useIdempotencyKey('b', registry));

    expect(first.result.current.key).toBe('cle-x');
    expect(second.result.current.key).toBe('cle-x');
    expect(registry.size()).toBe(2);
  });
});
