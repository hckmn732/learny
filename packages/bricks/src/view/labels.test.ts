import { describe, expect, it } from 'vitest';

import { brickViewLabels, resolveLabels } from './labels';

describe('[SPEC-503] libellés des vues', () => {
  it('nomme les types, avec la variante choix multiple', () => {
    expect(brickViewLabels.type('choice_question', 'multiple')).toBe('Choix multiple');
    expect(brickViewLabels.type('choice_question', 'single')).toBe('Choix unique');
    expect(brickViewLabels.type('text')).toBe('Texte');
    expect(brickViewLabels.type('timer')).toBe('Minuteur');
  });

  it('formate les libellés paramétrés', () => {
    expect(brickViewLabels.answerExpected('42')).toBe('Réponse attendue : 42');
    expect(brickViewLabels.expectedAnswers('a, b')).toBe('Réponses attendues : a, b');
    expect(brickViewLabels.gapLabel(1, 3)).toBe('Trou 1 sur 3');
    expect(brickViewLabels.recallSource('Guide')).toBe('Source : Guide');
    expect(brickViewLabels.characters(12, 500)).toBe('12 / 500 caractères');
    expect(brickViewLabels.instructionRemoveRow(2)).toBe('Retirer le poste 2');
    expect(brickViewLabels.instructionHint(1)).toBe('Indice 1 :');
    expect(brickViewLabels.instructionDifference('250')).toBe('Écart : 250 €');
    expect(brickViewLabels.instructionScore(8, 10)).toBe('8 / 10');
    expect(brickViewLabels.timerLabel(5)).toBe('Temps restant : 5 minutes');
    expect(brickViewLabels.scoringTitle(20)).toBe('Barème · 20 points');
    expect(brickViewLabels.scoringThreshold(70)).toBe('Seuil 70 %');
    expect(brickViewLabels.dialogueTurns(6)).toBe('6 échanges au maximum');
  });

  it('résout les surcharges de l’application', () => {
    expect(resolveLabels()).toBe(brickViewLabels);
    expect(resolveLabels({ verify: 'Go' }).verify).toBe('Go');
    expect(resolveLabels({ verify: 'Go' }).reset).toBe(brickViewLabels.reset);
  });
});
