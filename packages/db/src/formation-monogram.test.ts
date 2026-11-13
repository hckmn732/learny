import { describe, expect, it } from 'vitest';

import {
  FORMATION_MONOGRAM_MAX_LENGTH,
  formationMonogram,
  nextFormationAccent,
} from './formation-monogram';

describe('[SPEC-603] sigle', () => {
  it('privilégie le sigle stocké, borné à trois caractères (ET-6)', () => {
    expect(formationMonogram('SAP S/4HANA Finance', 'SAP')).toBe('SAP');
    expect(formationMonogram('Gestion de projet agile', 'AG')).toBe('AG');
    expect(formationMonogram('Titre long', 'ABCD')).toBe('ABC');
    expect(FORMATION_MONOGRAM_MAX_LENGTH).toBe(3);
  });

  it('replie sur les deux premières lettres alphanumériques sans accents', () => {
    expect(formationMonogram('Écologie urbaine')).toBe('EC');
    expect(formationMonogram("Python pour l'analyse de données")).toBe('PY');
    expect(formationMonogram('  — 42')).toBe('42');
    expect(formationMonogram('é')).toBe('E');
    expect(formationMonogram('')).toBe('?');
    expect(formationMonogram('Sans sigle', '')).toBe('SA');
    expect(formationMonogram('Sans sigle', null)).toBe('SA');
  });

  it('choisit la première couleur libre, puis indigo (ADR-0162)', () => {
    expect(nextFormationAccent([])).toBe('indigo');
    expect(nextFormationAccent(['indigo'])).toBe('green');
    expect(nextFormationAccent(['indigo', 'green', 'orange'])).toBe('violet');
    expect(nextFormationAccent(['indigo', 'green', 'orange', 'violet', 'teal'])).toBe('indigo');
  });
});
