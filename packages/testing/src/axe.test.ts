import { describe, expect, it } from 'vitest';

import {
  BLOCKING_AXE_IMPACTS,
  blockingAxeViolations,
  formatAxeViolations,
  type AxeViolationLike,
} from './axe';

const VIOLATIONS: AxeViolationLike[] = [
  { id: 'color-contrast', impact: 'serious', help: 'Contraste insuffisant' },
  { id: 'button-name', impact: 'critical', help: 'Bouton sans nom' },
  { id: 'landmark-one-main', impact: 'moderate', help: 'Un seul main attendu' },
  { id: 'region', impact: 'minor', help: 'Contenu hors région' },
  { id: 'unknown-impact', impact: null, help: 'Impact inconnu' },
];

describe('[SPEC-309] Socle d’accessibilité axe', () => {
  it('ne bloque que sur serious et critical', () => {
    expect(BLOCKING_AXE_IMPACTS).toEqual(['serious', 'critical']);
    expect(blockingAxeViolations(VIOLATIONS).map((violation) => violation.id)).toEqual([
      'color-contrast',
      'button-name',
    ]);
    expect(blockingAxeViolations([])).toEqual([]);
  });

  it('formate les violations bloquantes pour le message d’échec', () => {
    expect(formatAxeViolations(blockingAxeViolations(VIOLATIONS))).toEqual([
      'color-contrast (serious) : Contraste insuffisant',
      'button-name (critical) : Bouton sans nom',
    ]);
    expect(formatAxeViolations([])).toEqual([]);
  });
});
