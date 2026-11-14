import { afterEach, describe, expect, it } from 'vitest';

import { clearToasts, dismissToast, getToasts, toast } from './store';

afterEach(clearToasts);

describe('[SPEC-303] pile de toasts', () => {
  it('ignore la fermeture d’un identifiant inconnu et le vidage d’une pile vide', () => {
    clearToasts();
    expect(getToasts()).toEqual([]);
    const before = getToasts();
    dismissToast(-1);
    expect(getToasts()).toBe(before);
    const id = toast({ title: 'Enregistré' });
    expect(getToasts()).toHaveLength(1);
    dismissToast(id);
    expect(getToasts()).toEqual([]);
  });
});
