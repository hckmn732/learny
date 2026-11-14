// Unit tests of the settings-screen rules (SPEC-707 §12, CA-2, CA-3; ADR-0047 fixed clock).
import { describe, expect, it } from 'vitest';

import {
  formatDeletionDeadline,
  parseProfilePatch,
  validationIssue,
} from './parametres-onglets-et-profil';

/** First validation issue of an invalid body, as the API would report it. */
function parseFailure(input: unknown): { path: string; message: string } {
  try {
    parseProfilePatch(input);
  } catch (error) {
    const failure = validationIssue(error);
    if (failure === null) throw error;
    return failure;
  }
  throw new Error('le corps aurait dû être refusé');
}

describe('[SPEC-707] règles et calculs', () => {
  it('CA-2 — le corps de sauvegarde refuse 0 et 7 heures et un rythme vide', () => {
    const days = [1, 2, 3, 4, 5];
    expect(
      parseProfilePatch({
        rhythm: { hoursPerDay: 5, studyDays: days, preferredSlots: ['matin', 'apres_midi'] },
      }),
    ).toEqual({
      rhythm: { hoursPerDay: 5, studyDays: days, preferredSlots: ['matin', 'apres_midi'] },
    });
    for (const hours of [0, 7, 2.5]) {
      expect(() =>
        parseProfilePatch({
          rhythm: { hoursPerDay: hours, studyDays: days, preferredSlots: ['soir'] },
        }),
      ).toThrow(/invalides/);
    }
    // CL-4 — aucun jour ou aucun moment : erreur de champ, aucune sauvegarde partielle.
    expect(() =>
      parseProfilePatch({ rhythm: { hoursPerDay: 5, studyDays: [], preferredSlots: ['soir'] } }),
    ).toThrow(/invalides/);
    expect(() =>
      parseProfilePatch({ rhythm: { hoursPerDay: 5, studyDays: days, preferredSlots: [] } }),
    ).toThrow(/invalides/);
  });

  it('CA-2 — le résumé chiffré du rythme est borné par le contrat partagé', () => {
    // Le libellé exact (« 5 h par jour, 5 jours sur 7, … : 25 h par semaine. ») vient de la
    // fonction partagée de SPEC-602, reprise par l'écran ; ses bornes sont couvertes par le
    // contrat `StudyRhythm` ci-dessus et par les tests e2e `[SPEC-707]`.
    const rhythm = {
      hoursPerDay: 5,
      studyDays: [1, 2, 3, 4, 5],
      preferredSlots: ['matin', 'apres_midi'] as const,
    };
    expect(parseProfilePatch({ rhythm })).toEqual({ rhythm });
  });

  it('CA-3 — l’échéance J+30 est formatée dans le fuseau du profil (horloge figée)', () => {
    // 2026-11-11T12:20:00Z + 30 jours, Europe/Paris (UTC+1 en hiver) → 13:20 locales.
    expect(formatDeletionDeadline('2026-12-11T12:20:00.000Z', 'Europe/Paris')).toBe(
      'vendredi 11 décembre à 13:20',
    );
    // BR-ACC-07 — the same instant is rendered in the reader's zone.
    expect(formatDeletionDeadline('2026-12-11T12:20:00.000Z', 'America/Montreal')).toBe(
      'vendredi 11 décembre à 07:20',
    );
  });

  it('CL-1 — un corps hors schéma est refusé avant toute écriture', () => {
    const empty = parseFailure({});
    expect(empty.message).toBe('au moins un champ du profil est attendu');
    expect(parseFailure({ timezone: 'Mars/Olympus' }).message).toMatch(/Fuseau horaire inconnu/);
    expect(parseFailure({ firstName: '' }).message).toMatch(/>=1/);
    expect(parseFailure({ email: 'lire@exemple.fr' }).message).toBe(
      'au moins un champ du profil est attendu',
    );
    expect(parseFailure({ lastName: 'x'.repeat(61) }).message).toMatch(/<=60/);
  });
});
