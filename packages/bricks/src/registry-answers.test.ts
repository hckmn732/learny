import { describe, expect, it } from 'vitest';

import { BRICK_TYPES } from './brick-types';
import { brickExamples } from './examples';
import { canonicalAnswer, stemText } from './fingerprint';
import { comparisonKey, normalizeText } from './normalize';
import type { BrickPayload } from './payloads';
import { brickRegistry } from './registry';

describe('[SPEC-501] énoncé et réponse canonique du registre', () => {
  const questions = BRICK_TYPES.filter((type) => brickRegistry[type].isQuestion);

  it.each(questions)('%s délègue à fingerprint pour l’exemple de référence', (type) => {
    const definition = brickRegistry[type];
    const payload = brickExamples[type].valid as BrickPayload<typeof type>;
    const answer = definition.canonicalAnswer?.(payload as never) ?? 'absent';
    const stem = definition.stem?.(payload as never) ?? 'absent';
    expect(answer).toBe(canonicalAnswer(type, payload) ?? '');
    expect(stem).toBe(stemText(type, payload) ?? '');
    expect(answer.length).toBeGreaterThan(0);
    expect(stem.length).toBeGreaterThan(0);
  });
});

describe('[SPEC-501] comparisonKey', () => {
  it('est la normalisation de texte, insensible à la casse et aux accents (BR-MEM-05)', () => {
    expect(comparisonKey('  Élève… ')).toBe(normalizeText('eleve'));
    expect(comparisonKey('CRÈME brûlée !')).toBe('creme brulee');
  });
});
