import { describe, expect, it } from 'vitest';

import { PREPARATION_MAX_ATTEMPTS, PREPARATION_RETRY_MS, preparationTimedOut } from './use-quiz-attempt';

describe('[SPEC-611] relance de la préparation', () => {
  it('EF-8 — relance toutes les 3 secondes et s’arrête après 2 minutes', () => {
    expect(PREPARATION_RETRY_MS).toBe(3_000);
    expect(PREPARATION_MAX_ATTEMPTS * PREPARATION_RETRY_MS).toBe(120_000);
    expect(preparationTimedOut(0)).toBe(false);
    expect(preparationTimedOut(39)).toBe(false);
    expect(preparationTimedOut(40)).toBe(true);
  });
});
