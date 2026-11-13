import { describe, expect, it } from 'vitest';

import { rhythmSummary, togglePreferredSlot, toggleStudyDay } from './RhythmSummary';

describe('[SPEC-602] résumé du rythme', () => {
  it('CA-6 — 2 h, lundi à vendredi, le soir', () => {
    expect(
      rhythmSummary({
        hoursPerDay: 2,
        studyDays: [1, 2, 3, 4, 5],
        preferredSlots: ['soir'],
      }),
    ).toBe('2 h par jour, 5 jours sur 7, plutôt soir : 10 h par semaine.');
  });

  it('CA-6 — 5 h, lundi à vendredi, matin et après-midi', () => {
    expect(
      rhythmSummary({
        hoursPerDay: 5,
        studyDays: [1, 2, 3, 4, 5],
        preferredSlots: ['matin', 'apres_midi'],
      }),
    ).toBe('5 h par jour, 5 jours sur 7, plutôt matin et après-midi : 25 h par semaine.');
  });

  it('CA-6 — 1 h, dimanche, le soir', () => {
    expect(rhythmSummary({ hoursPerDay: 1, studyDays: [7], preferredSlots: ['soir'] })).toBe(
      '1 h par jour, 1 jour sur 7, plutôt soir : 1 h par semaine.',
    );
  });

  it('CA-6 — le dernier jour et le dernier moment ne peuvent pas être désélectionnés', () => {
    expect(toggleStudyDay([3], 3)).toEqual([3]);
    expect(togglePreferredSlot(['soir'], 'soir')).toEqual(['soir']);
    expect(toggleStudyDay([1, 2], 1)).toEqual([2]);
    expect(togglePreferredSlot(['matin', 'soir'], 'matin')).toEqual(['soir']);
  });
});
