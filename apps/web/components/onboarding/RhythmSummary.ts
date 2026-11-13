import type { StudySlot } from '@learny/contracts';

export interface RhythmValues {
  hoursPerDay: number;
  studyDays: number[];
  preferredSlots: StudySlot[];
}

const SLOT_LABELS: Record<StudySlot, string> = {
  matin: 'matin',
  apres_midi: 'après-midi',
  soir: 'soir',
};

/** EF-4 — exact summary of the rhythm, e.g. « 2 h par jour, 5 jours sur 7, plutôt soir : 10 h. ». */
export function rhythmSummary(values: RhythmValues): string {
  const days = values.studyDays.length;
  const moments = values.preferredSlots.map((slot) => SLOT_LABELS[slot]).join(' et ');
  return `${String(values.hoursPerDay)} h par jour, ${String(days)} jour${days > 1 ? 's' : ''} sur 7, plutôt ${moments} : ${String(values.hoursPerDay * days)} h par semaine.`;
}

/** BR-ACC-08 — removing the last selected day is a no-op. */
export function toggleStudyDay(days: readonly number[], day: number): number[] {
  if (days.includes(day)) {
    return days.length === 1 ? [...days] : days.filter((value) => value !== day);
  }
  return [...days, day].sort((left, right) => left - right);
}

/** BR-ACC-08 — removing the last selected moment is a no-op. */
export function togglePreferredSlot(slots: readonly StudySlot[], slot: StudySlot): StudySlot[] {
  if (slots.includes(slot)) {
    return slots.length === 1 ? [...slots] : slots.filter((value) => value !== slot);
  }
  const order: StudySlot[] = ['matin', 'apres_midi', 'soir'];
  return [...slots, slot].sort((left, right) => order.indexOf(left) - order.indexOf(right));
}
