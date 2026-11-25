// Étapes et rythme des premiers pas natifs (maquette PremiersPas.dc.html).
//
// Les cinq étapes sont celles du web (`/premiers-pas/profil|rythme|ia|rappels|depart`). Le rythme
// du serveur est exprimé en heures *par jour* (1 à 6) ; la maquette demande un temps *par semaine*.
// L'écran présente donc des paliers hebdomadaires et enregistre l'équivalent arrondi en heures par
// jour : 10 h sur 4 jours devient 3 h/jour (12 h réelles), faute d'heures fractionnaires au contrat.
import type { StudyPreferencesDto, StudySlot } from '@learny/contracts';

export const STEPS = ['profil', 'rythme', 'ia', 'rappels', 'depart'] as const;
export type Step = (typeof STEPS)[number];

/** Vrai quand le paramètre de route est une étape connue. */
export function isStep(value: string): value is Step {
  return (STEPS as readonly string[]).includes(value);
}

/** Position 1-based de l'étape dans le parcours. */
export function stepRank(step: Step): number {
  return STEPS.indexOf(step) + 1;
}

/** Étape précédente, `null` pour la première. */
export function previousStep(step: Step): Step | null {
  const index = STEPS.indexOf(step);
  return index <= 0 ? null : (STEPS[index - 1] ?? null);
}

/** Paliers hebdomadaires de la maquette. */
export const WEEK_OPTIONS = [3, 5, 10, 15] as const;

export const STUDY_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/** Étiquette courte d'un jour (maquette : L M M J V S D). */
export const DAY_SHORT: Readonly<Record<number, string>> = {
  1: 'L',
  2: 'M',
  3: 'M',
  4: 'J',
  5: 'V',
  6: 'S',
  7: 'D',
};

export const DAY_LONG: Readonly<Record<number, string>> = {
  1: 'Lundi',
  2: 'Mardi',
  3: 'Mercredi',
  4: 'Jeudi',
  5: 'Vendredi',
  6: 'Samedi',
  7: 'Dimanche',
};

export const SLOT_ORDER: readonly StudySlot[] = ['matin', 'apres_midi', 'soir'];

export interface RhythmDraft {
  readonly weeklyHours: number;
  readonly studyDays: readonly number[];
  readonly slot: StudySlot;
}

/** Heures par jour enregistrées pour un palier hebdomadaire et un nombre de jours. */
export function hoursPerDayFor(weeklyHours: number, dayCount: number): number {
  const days = Math.max(1, dayCount);
  return Math.min(6, Math.max(1, Math.round(weeklyHours / days)));
}

/** Palier le plus proche du rythme enregistré (heures par jour × jours). */
export function nearestWeekOption(weeklyHours: number): number {
  let best: number = WEEK_OPTIONS[0];
  for (const option of WEEK_OPTIONS) {
    if (Math.abs(option - weeklyHours) < Math.abs(best - weeklyHours)) best = option;
  }
  return best;
}

/** Brouillon affiché à partir du rythme du serveur. */
export function draftFromPreferences(preferences: StudyPreferencesDto): RhythmDraft {
  const first = preferences.preferredSlots[0] ?? 'soir';
  return {
    weeklyHours: nearestWeekOption(preferences.hoursPerDay * preferences.studyDays.length),
    studyDays: [...preferences.studyDays].sort((left, right) => left - right),
    slot: first,
  };
}

/** Corps envoyé à `PATCH /me/preferences` (heures par jour, jours, moments). */
export function preferencesFromDraft(draft: RhythmDraft): StudyPreferencesDto {
  return {
    hoursPerDay: hoursPerDayFor(draft.weeklyHours, draft.studyDays.length),
    studyDays: [...draft.studyDays].sort((left, right) => left - right),
    preferredSlots: [draft.slot],
  };
}

/** BR-ACC-08 — retirer le dernier jour est sans effet (le serveur refuserait une liste vide). */
export function toggleDay(days: readonly number[], day: number): number[] {
  if (!days.includes(day)) return [...days, day].sort((left, right) => left - right);
  if (days.length === 1) return [...days];
  return days.filter((value) => value !== day);
}