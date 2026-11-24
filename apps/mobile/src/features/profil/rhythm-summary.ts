// Résumé chiffré du rythme d'apprentissage (SPEC-3401 EF-3, BR-ACC-08 ; canevas § 4).
//
// The rhythm of the profile is `hoursPerDay` (1 to 6), the study days (1 = Monday … 7 = Sunday) and
// the preferred moments. The Profil row and the rhythm screen show a summary the learner can check
// at a glance: the weekly volume (hours per day × study days) and the moments, as the mockup does
// (« 5 h par semaine · soirs »). Pure function, no clock and no locale other than `@learny/i18n`.
import { fr } from '@learny/i18n';

/** Rhythm as the API sends it (`StudyPreferencesDto`), reduced to what the summary reads. */
export interface RhythmLike {
  readonly hoursPerDay: number;
  readonly studyDays: readonly number[];
  readonly preferredSlots: readonly string[];
}

const t = fr.mobile.profile.rhythm;

/** Weekly volume the rhythm represents: « 25 h par semaine ». */
export function weeklyHours(rhythm: RhythmLike): number {
  return Math.max(0, rhythm.hoursPerDay) * rhythm.studyDays.length;
}

/** Labels of the chosen moments, in the order of the mockup; unknown values are ignored. */
export function momentLabels(rhythm: RhythmLike): string[] {
  const labels: string[] = [];
  for (const slot of t.momentOrder) {
    if (rhythm.preferredSlots.includes(slot)) {
      labels.push(t.momentsOptions[slot]);
    }
  }
  return labels;
}

/** Short label of a study day: « L », « M », … (1 = lundi). */
export function dayShort(day: number): string {
  return t.dayShort[day - 1] ?? '';
}

/** « 25 h par semaine · matin et soir » ; the volume alone when no moment is chosen. */
export function rhythmSummary(rhythm: RhythmLike): string {
  const hours = t.weeklyHours(weeklyHours(rhythm));
  const moments = momentLabels(rhythm);
  return moments.length === 0 ? hours : `${hours} · ${moments.join(' et ')}`;
}

/** Detail of the rhythm screen: « 5 h par jour · 5 jours ». */
export function rhythmDetail(rhythm: RhythmLike): string {
  return `${t.dailyHours(rhythm.hoursPerDay)} · ${t.daysCount(rhythm.studyDays.length)}`;
}

/** Valid bounds of the contract (BR-ACC-08): one to six hours per day, one to seven days. */
export const HOURS_BOUNDS = { min: 1, max: 6 } as const;
export const DAYS_BOUNDS = { min: 1, max: 7 } as const;

/** A rhythm the server accepts: bounds and at least one day, else the save is refused (CA-2). */
export function isValidRhythm(rhythm: RhythmLike): boolean {
  if (rhythm.hoursPerDay < HOURS_BOUNDS.min || rhythm.hoursPerDay > HOURS_BOUNDS.max) return false;
  if (rhythm.studyDays.length < DAYS_BOUNDS.min) return false;
  const unique = new Set(rhythm.studyDays);
  if (unique.size !== rhythm.studyDays.length) return false;
  return rhythm.studyDays.every((day) => day >= 1 && day <= 7);
}
