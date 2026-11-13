// Labels and dot colours of the schedule slot kinds (SPEC-603 ET-5, shared with SPEC-704).
// The colours are read on the dark day card, except `mock_exam` which is white by mockup.

export const SLOT_KIND_ORDER = [
  'contributions',
  'course',
  'exercise',
  'validation_quiz',
  'global_quiz',
  'revision',
  'sprint',
  'micro_session',
  'warmup',
  'mock_exam',
  'buffer',
  'weekly_review',
] as const;

export type SlotKindToken = (typeof SLOT_KIND_ORDER)[number];

export const slotKinds: Readonly<Record<SlotKindToken, { label: string; color: string }>> = {
  contributions: { label: 'Apports', color: '#14A38B' },
  course: { label: 'Cours', color: '#8B8BF0' },
  exercise: { label: 'Exercice', color: '#9FC51F' },
  validation_quiz: { label: 'Quiz de validation', color: '#F97316' },
  global_quiz: { label: 'Quiz global', color: '#B79CFA' },
  revision: { label: 'Révision', color: '#B79CFA' },
  sprint: { label: 'Sprint', color: '#B79CFA' },
  micro_session: { label: 'Micro-séance', color: '#B79CFA' },
  warmup: { label: 'Échauffement', color: '#C6F432' },
  mock_exam: { label: 'Examen blanc', color: '#FFFFFF' },
  buffer: { label: 'Marge de rattrapage', color: '#A1A1AA' },
  weekly_review: { label: 'Bilan', color: '#A1A1AA' },
} as const;

export function slotKindLabel(kind: SlotKindToken): string {
  return slotKinds[kind].label;
}

export function slotKindColor(kind: SlotKindToken): string {
  return slotKinds[kind].color;
}
