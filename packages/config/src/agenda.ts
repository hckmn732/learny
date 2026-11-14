// Types, labels and colours of the schedule slots on the agenda (SPEC-704 ET-3, BR-AGE-02).
// The six colours of the mockup cover the base kinds; the complementary kinds inherit from the
// closest colour (ADR-0183 §4). The components read these tokens — never a literal colour.

export const AGENDA_SLOT_KINDS = [
  'contributions',
  'course',
  'exercise',
  'validation_quiz',
  'mock_exam',
  'global_quiz',
  'revision',
  'sprint',
  'warmup',
  'micro_session',
  'buffer',
  'weekly_review',
] as const;

export type AgendaSlotKind = (typeof AGENDA_SLOT_KINDS)[number];

export interface AgendaSlotStyle {
  /** Label of the kind, on the pills and in the legend. */
  readonly label: string;
  /** Background of a slot button (may be overridden by the detail panel). */
  readonly background: string;
  /** Text colour of a slot button. */
  readonly text: string;
  /** Optional border, e.g. the dashed grey of the catch-up margins. */
  readonly border?: string;
}

export const AGENDA_SLOT_STYLES: Readonly<Record<AgendaSlotKind, AgendaSlotStyle>> = {
  contributions: { label: 'Apports', background: '#E1F4EF', text: '#0B5C4D' },
  course: { label: 'Cours', background: '#ECECFC', text: '#2E2E8F' },
  exercise: { label: 'Exercice', background: '#F1FBD3', text: '#3D5200' },
  validation_quiz: { label: 'Quiz de validation', background: '#FFEDE0', text: '#8F3305' },
  mock_exam: { label: 'Examen blanc', background: '#FFEDE0', text: '#8F3305' },
  global_quiz: { label: 'Quiz global', background: '#F0E9FE', text: '#5B21B6' },
  revision: { label: 'Révision', background: '#F0E9FE', text: '#5B21B6' },
  sprint: { label: 'Sprint', background: '#F0E9FE', text: '#5B21B6' },
  warmup: { label: 'Échauffement', background: '#F0E9FE', text: '#5B21B6' },
  micro_session: { label: 'Micro-séance', background: '#F0E9FE', text: '#5B21B6' },
  buffer: {
    label: 'Marge de rattrapage',
    background: '#FFFFFF',
    text: '#62626B',
    border: '1px dashed #A8A7A0',
  },
  weekly_review: { label: 'Bilan de la semaine', background: '#F4F4F1', text: '#3F3F46' },
};

export function agendaSlotLabel(kind: AgendaSlotKind): string {
  return AGENDA_SLOT_STYLES[kind].label;
}

export function agendaSlotStyle(kind: AgendaSlotKind): AgendaSlotStyle {
  return AGENDA_SLOT_STYLES[kind];
}

/** Kind label of a kind absent from the configuration (defensive, never shown). */
export function agendaSlotLabelOf(kind: string): string {
  return (AGENDA_SLOT_STYLES as Record<string, AgendaSlotStyle | undefined>)[kind]?.label ?? kind;
}

/** Style of a kind absent from the configuration (defensive, never shown). */
export function agendaSlotStyleOf(kind: string): AgendaSlotStyle {
  return (
    (AGENDA_SLOT_STYLES as Record<string, AgendaSlotStyle | undefined>)[kind] ?? {
      label: kind,
      background: '#F4F4F1',
      text: '#3F3F46',
    }
  );
}

/** The six legend entries always shown (EF-10); the global quiz and the revision share one. */
export const AGENDA_LEGEND_BASE_KINDS = [
  'contributions',
  'course',
  'exercise',
  'validation_quiz',
  'global_quiz',
  'buffer',
] as const satisfies readonly AgendaSlotKind[];

/** Complementary kinds, shown in the legend only when the period contains one (EF-10). */
export const AGENDA_LEGEND_EXTRA_KINDS = [
  'mock_exam',
  'sprint',
  'warmup',
  'micro_session',
  'weekly_review',
] as const satisfies readonly AgendaSlotKind[];

/** Legend entry of a kind: most base kinds group, the extras keep their own label. */
export function agendaLegendLabel(kind: AgendaSlotKind): string {
  return kind === 'global_quiz' ? 'Quiz global · révision' : agendaSlotLabel(kind);
}
