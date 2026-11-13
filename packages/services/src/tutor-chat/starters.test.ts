import { describe, expect, it } from 'vitest';

import { startersOf } from './starters';

describe('[SPEC-610] questions suggérées', () => {
  it('calcule trois questions du chapitre de démonstration sans IA', () => {
    const starters = startersOf({
      sections: [
        {
          kind: 'text',
          contentMd: 'La clé 40 débite, la clé 50 crédite.',
          notionIds: ['cle', 'poste'],
        },
        {
          kind: 'dont_confuse',
          contentMd: null,
          data: { left: { title: 'Clé de comptabilisation' }, right: { title: 'Type de pièce' } },
          notionIds: ['cle', 'type'],
        },
      ],
      notions: [
        { id: 'cle', label: 'Clé de comptabilisation', mastery: 35 },
        { id: 'poste', label: 'Poste', mastery: 84 },
        { id: 'type', label: 'Type de pièce', mastery: 81 },
      ],
      gapNotionId: 'cle',
    });
    expect(starters.map((starter) => starter.label)).toEqual([
      'Explique-moi les clé de comptabilisation autrement',
      'Donne-moi un exemple chiffré',
      'Clé ou type de pièce : quelle différence ?',
    ]);
  });

  it('retombe sur un exemple concret sans nombre', () => {
    const starters = startersOf({
      sections: [{ kind: 'text', contentMd: 'Une pièce est équilibrée.', notionIds: ['a'] }],
      notions: [{ id: 'a', label: 'Pièce comptable' }],
    });
    expect(starters[1]?.label).toBe('Donne-moi un exemple concret');
  });
});
