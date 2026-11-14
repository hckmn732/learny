import { describe, expect, it } from 'vitest';

import {
  ProfilePatch,
  SETTINGS_DEFAULT_TAB,
  SettingsState,
  settingsTabFromHash,
  StudyRhythm,
} from './parametres-onglets-et-profil';

describe('[SPEC-707] contrats des paramètres', () => {
  it('CA-1 — choisit l’onglet du hash et retombe sur Profil (CL-3)', () => {
    expect(settingsTabFromHash('#notifications')).toBe('notifications');
    expect(settingsTabFromHash('#modeles')).toBe('modeles');
    expect(settingsTabFromHash('#automatismes')).toBe('automatismes');
    expect(settingsTabFromHash('#profil')).toBe('profil');
    expect(SETTINGS_DEFAULT_TAB).toBe('profil');
    // Hash inconnu, absent ou mal casse : Profil, sans écran blanc.
    expect(settingsTabFromHash('')).toBe('profil');
    expect(settingsTabFromHash(null)).toBe('profil');
    expect(settingsTabFromHash('#inconnu')).toBe('profil');
    expect(settingsTabFromHash('#NOTIFICATIONS')).toBe('notifications');
  });

  it('CA-2 — StudyRhythm garde les bornes de BR-ACC-08', () => {
    const base = { studyDays: [1, 2, 3, 4, 5], preferredSlots: ['matin', 'apres_midi'] };
    expect(StudyRhythm.safeParse({ hoursPerDay: 1, ...base }).success).toBe(true);
    expect(StudyRhythm.safeParse({ hoursPerDay: 6, ...base }).success).toBe(true);
    // 0 et 7 heures par jour sont refusés, comme un rythme sans jour ni moment.
    expect(StudyRhythm.safeParse({ hoursPerDay: 0, ...base }).success).toBe(false);
    expect(StudyRhythm.safeParse({ hoursPerDay: 7, ...base }).success).toBe(false);
    expect(
      StudyRhythm.safeParse({ hoursPerDay: 5, studyDays: [], preferredSlots: ['soir'] }).success,
    ).toBe(false);
    expect(
      StudyRhythm.safeParse({ hoursPerDay: 5, studyDays: [1], preferredSlots: [] }).success,
    ).toBe(false);
  });

  it('ProfilePatch exige au moins un champ et refuse l’e-mail', () => {
    expect(ProfilePatch.safeParse({}).success).toBe(false);
    expect(ProfilePatch.safeParse({ tutorTone: 'tu' }).success).toBe(true);
    expect(
      ProfilePatch.safeParse({
        firstName: 'Alex',
        rhythm: { hoursPerDay: 5, studyDays: [1], preferredSlots: ['soir'] },
      }).success,
    ).toBe(true);
    // BR-ACC-12 — l’e-mail n’est pas modifiable en V1 : la clé est rejetée.
    const parsed = ProfilePatch.safeParse({ email: 'autre@exemple.fr' });
    expect(parsed.success).toBe(false);
  });

  it('ProfilePatch refuse un fuseau hors IANA et une version non datée (CL-4)', () => {
    expect(ProfilePatch.safeParse({ timezone: 'Europe/Paris' }).success).toBe(true);
    expect(ProfilePatch.safeParse({ timezone: 'Mars/Olympus' }).success).toBe(false);
    expect(ProfilePatch.safeParse({ expectedUpdatedAt: 'pas-une-date' }).success).toBe(false);
    expect(
      ProfilePatch.safeParse({ firstName: 'Alex', expectedUpdatedAt: '2026-11-11T12:20:00.000Z' })
        .success,
    ).toBe(true);
  });

  it('SettingsState valide le miroir des données personnelles', () => {
    const state = {
      me: {
        id: '0b8b8f58-6df2-4cf7-bc4d-5a15cb4fb9a4',
        email: 'alex.perrin@demo.learny.test',
        firstName: 'Alex',
        lastName: 'Perrin',
        tutorTone: 'vous',
        courseLanguage: 'fr',
        timezone: 'Europe/Paris',
        onboardingStep: 'done',
        onboardingCompletedAt: '2026-11-11T12:20:00.000Z',
        currentFormationId: null,
      },
      rhythm: {
        hoursPerDay: 5,
        studyDays: [1, 2, 3, 4, 5],
        preferredSlots: ['matin', 'apres_midi'],
      },
      updatedAt: '2026-11-11T12:20:00.000Z',
      deletionScheduledFor: null,
      export: null,
    };
    expect(SettingsState.safeParse(state).success).toBe(true);
    expect(
      SettingsState.safeParse({
        ...state,
        export: {
          id: '0b8b8f58-6df2-4cf7-bc4d-5a15cb4fb9a5',
          status: 'done',
          sizeBytes: 12,
          createdAt: '2026-11-11T12:20:00.000Z',
          expiresAt: null,
        },
      }).success,
    ).toBe(true);
    expect(
      SettingsState.safeParse({
        ...state,
        export: {
          id: '0b8b8f58-6df2-4cf7-bc4d-5a15cb4fb9a5',
          status: 'fini',
          sizeBytes: 12,
          createdAt: '2026-11-11T12:20:00.000Z',
          expiresAt: null,
        },
      }).success,
    ).toBe(false);
  });
});
