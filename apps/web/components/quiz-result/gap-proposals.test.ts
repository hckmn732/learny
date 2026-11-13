import { describe, expect, it } from 'vitest';

import { GAP_NATURE_LABELS, GAP_PROPOSALS } from '@learny/config/product';

describe('[SPEC-612] propositions et libellés des lacunes', () => {
  it('CA-7, BR-LAC-04 — chaque nature a son libellé et sa proposition', () => {
    expect(GAP_NATURE_LABELS).toEqual({
      confusion: 'Confusion',
      misunderstanding: 'Incompréhension',
      application: "Difficulté d'application",
      forgetting: 'Oubli',
    });
    expect(GAP_PROPOSALS).toEqual({
      confusion: 'une question qui oppose les deux notions.',
      misunderstanding: 'une nouvelle explication, sous un autre angle.',
      application: 'un exercice pratique.',
      forgetting: 'une révision dans le quiz global.',
    });
  });
});
