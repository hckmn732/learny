// Vitest [SPEC-3401] — résumé chiffré du rythme (EF-3, BR-ACC-08, CA-2).
import { describe, expect, it } from 'vitest';

import {
  dayShort,
  isValidRhythm,
  momentLabels,
  rhythmDetail,
  rhythmSummary,
  weeklyHours,
} from './rhythm-summary';

/** Le rythme du jeu de démonstration : 5 h par jour, du lundi au vendredi, le soir. */
const DEMO = { hoursPerDay: 5, studyDays: [1, 2, 3, 4, 5], preferredSlots: ['soir'] };

describe('[SPEC-3401] résumé du rythme', () => {
  it('calcule le volume hebdomadaire : heures par jour × jours d’étude (BR-ACC-08)', () => {
    expect(weeklyHours(DEMO)).toBe(25);
    expect(weeklyHours({ hoursPerDay: 2, studyDays: [6, 7], preferredSlots: [] })).toBe(4);
    expect(weeklyHours({ hoursPerDay: 5, studyDays: [], preferredSlots: [] })).toBe(0);
  });

  it('résume le rythme en une ligne chiffrée, dans l’ordre de la maquette', () => {
    expect(rhythmSummary(DEMO)).toBe('25 h par semaine · soir');
    expect(
      rhythmSummary({ hoursPerDay: 2, studyDays: [1, 3, 5], preferredSlots: ['soir', 'matin'] }),
    ).toBe('6 h par semaine · matin et soir');
    expect(rhythmSummary({ hoursPerDay: 1, studyDays: [7], preferredSlots: [] })).toBe(
      '1 h par semaine',
    );
  });

  it('détaille le rythme à l’écran : heures par jour et nombre de jours', () => {
    expect(rhythmDetail(DEMO)).toBe('5 h par jour · 5 jours');
    expect(rhythmDetail({ hoursPerDay: 3, studyDays: [1], preferredSlots: [] })).toBe(
      '3 h par jour · 1 jour',
    );
  });

  it('nomme les moments choisis et ignore un moment inconnu', () => {
    expect(momentLabels(DEMO)).toEqual(['soir']);
    expect(
      momentLabels({ hoursPerDay: 2, studyDays: [1], preferredSlots: ['inconnu', 'matin'] }),
    ).toEqual(['matin']);
  });

  it('abrège les jours de la semaine du lundi au dimanche', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(dayShort)).toEqual(['L', 'M', 'M', 'J', 'V', 'S', 'D']);
    expect(dayShort(0)).toBe('');
    expect(dayShort(8)).toBe('');
  });

  it('refuse un rythme hors bornes : le serveur répondrait 400 (BR-ACC-08)', () => {
    expect(isValidRhythm(DEMO)).toBe(true);
    expect(isValidRhythm({ hoursPerDay: 0, studyDays: [1], preferredSlots: [] })).toBe(false);
    expect(isValidRhythm({ hoursPerDay: 7, studyDays: [1], preferredSlots: [] })).toBe(false);
    expect(isValidRhythm({ hoursPerDay: 3, studyDays: [], preferredSlots: [] })).toBe(false);
    expect(isValidRhythm({ hoursPerDay: 3, studyDays: [1, 1], preferredSlots: [] })).toBe(false);
    expect(isValidRhythm({ hoursPerDay: 3, studyDays: [0, 2], preferredSlots: [] })).toBe(false);
  });
});
