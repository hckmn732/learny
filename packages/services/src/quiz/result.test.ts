import { describe, expect, it } from 'vitest';

import { evidenceOf, headlineOf, pointsMissingOf, proposalOf, statusTextOf } from './result';

describe('[SPEC-612] textes du résultat', () => {
  it('CA-1, CL-11 — les points manquants sont arrondis au supérieur', () => {
    expect(pointsMissingOf(72, 80)).toBe(8);
    expect(pointsMissingOf(79.99, 80)).toBe(1);
    expect(pointsMissingOf(80, 80)).toBe(0);
    expect(pointsMissingOf(84, 80)).toBe(0);
  });

  it('CA-1 — le titre gère le singulier, le pluriel, le déblocage et la fin de formation', () => {
    expect(
      headlineOf({ passed: false, pointsMissing: 1, nextModule: null, isLastModule: false }),
    ).toBe('Encore 1 point pour valider.');
    expect(
      headlineOf({ passed: false, pointsMissing: 8, nextModule: null, isLastModule: false }),
    ).toBe('Encore 8 points pour valider.');
    expect(
      headlineOf({
        passed: true,
        pointsMissing: 0,
        nextModule: { position: 4 },
        isLastModule: false,
      }),
    ).toBe('Le module 4 est débloqué.');
    expect(
      headlineOf({ passed: true, pointsMissing: 0, nextModule: null, isLastModule: true }),
    ).toBe('La formation est terminée.');
  });

  it('CA-1 — le texte de statut distingue zéro, une et plusieurs notions fragiles', () => {
    expect(statusTextOf({ passed: true, fragile: 0, gaps: 0 })).toContain(
      'aucune ne reste fragile',
    );
    expect(statusTextOf({ passed: true, fragile: 1, gaps: 1 })).toContain(
      'une seule reste fragile',
    );
    expect(statusTextOf({ passed: true, fragile: 2, gaps: 2 })).toContain('2 restent fragiles');
    expect(statusTextOf({ passed: false, fragile: 3, gaps: 3 })).toBe(
      'Votre prochaine tentative portera surtout sur les 3 notions ci-dessous, avec de nouvelles questions.',
    );
  });

  it('CA-7, BR-LAC-04 — la proposition suit la nature et l’évidence a un repli', () => {
    expect(proposalOf('confusion')).toBe('une question qui oppose les deux notions.');
    expect(proposalOf('misunderstanding')).toBe('une nouvelle explication, sous un autre angle.');
    expect(proposalOf('application')).toBe('un exercice pratique.');
    expect(proposalOf('forgetting')).toBe('une révision dans le quiz global.');
    expect(evidenceOf('confusion', 'Confondue avec le type de pièce dans 2 réponses.')).toBe(
      'Confondue avec le type de pièce dans 2 réponses.',
    );
    expect(evidenceOf('application', null)).toContain('l’exercice');
  });
});
