import { describe, expect, it } from 'vitest';

import { SLOT_KIND_ORDER, slotKindColor, slotKindLabel, slotKinds } from './slot-kinds';

describe('[SPEC-603] jetons des types de créneau', () => {
  it('publie les douze types, leur libellé et leur couleur (ET-5)', () => {
    expect(SLOT_KIND_ORDER).toHaveLength(12);
    expect(slotKindLabel('contributions')).toBe('Apports');
    expect(slotKindLabel('course')).toBe('Cours');
    expect(slotKindLabel('exercise')).toBe('Exercice');
    expect(slotKindLabel('validation_quiz')).toBe('Quiz de validation');
    expect(slotKindLabel('global_quiz')).toBe('Quiz global');
    expect(slotKindLabel('revision')).toBe('Révision');
    expect(slotKindLabel('sprint')).toBe('Sprint');
    expect(slotKindLabel('micro_session')).toBe('Micro-séance');
    expect(slotKindLabel('warmup')).toBe('Échauffement');
    expect(slotKindLabel('mock_exam')).toBe('Examen blanc');
    expect(slotKindLabel('buffer')).toBe('Marge de rattrapage');
    expect(slotKindLabel('weekly_review')).toBe('Bilan');
  });

  it('respecte les couleurs de la maquette sur fond sombre', () => {
    expect(slotKindColor('contributions')).toBe('#14A38B');
    expect(slotKindColor('course')).toBe('#8B8BF0');
    expect(slotKindColor('exercise')).toBe('#9FC51F');
    expect(slotKindColor('validation_quiz')).toBe('#F97316');
    for (const kind of ['global_quiz', 'revision', 'sprint', 'micro_session'] as const) {
      expect(slotKindColor(kind)).toBe('#B79CFA');
    }
    expect(slotKindColor('warmup')).toBe('#C6F432');
    expect(slotKindColor('mock_exam')).toBe('#FFFFFF');
    expect(slotKindColor('buffer')).toBe('#A1A1AA');
    expect(slotKindColor('weekly_review')).toBe('#A1A1AA');
    expect(Object.keys(slotKinds)).toEqual([...SLOT_KIND_ORDER]);
  });
});
