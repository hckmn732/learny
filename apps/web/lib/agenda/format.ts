// Formatting and derivations of the agenda (SPEC-704 EF-8, EF-10, EF-11; ADR-0183). The kind
// labels and colours come from the configuration tokens — never a literal in the components.
import {
  AGENDA_LEGEND_BASE_KINDS,
  AGENDA_LEGEND_EXTRA_KINDS,
  agendaSlotLabelOf,
} from '@learny/config';
import type { AgendaSlot, AgendaSlotKind } from '@learny/contracts';

import { civilAdd, civilDow, minutesToClock, monthDayCount, monthFirstDay } from './dates';
import { effectiveEndMinutes } from './grid';

/** `{h} h` or `{h} h {mm}`, `0 h` when zero (EF-11). */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return rest === 0 ? `${String(hours)} h` : `${String(hours)} h ${String(rest).padStart(2, '0')}`;
}

/** Real duration of a slot, in minutes (a slot crossing midnight keeps its full length, CL-3). */
export function slotDurationMinutes(slot: Pick<AgendaSlot, 'startsAt' | 'endsAt'>): number {
  const start = new Date(slot.startsAt).getTime();
  const end = new Date(slot.endsAt).getTime();
  return Math.max(0, Math.round((end - start) / 60_000));
}

/** Totals of the displayed slots (EF-11): planned and done outside the margins, margin count. */
export function totalsOf(slots: readonly AgendaSlot[]): {
  plannedMinutes: number;
  doneMinutes: number;
  marginsRemaining: number;
} {
  let plannedMinutes = 0;
  let doneMinutes = 0;
  let marginsRemaining = 0;
  for (const slot of slots) {
    if (slot.kind === 'buffer') {
      if (slot.status === 'planned') marginsRemaining += 1;
      continue;
    }
    const duration = slotDurationMinutes(slot);
    plannedMinutes += duration;
    if (slot.status === 'done') doneMinutes += duration;
  }
  return { plannedMinutes, doneMinutes, marginsRemaining };
}

export interface ChipSlot {
  kind: AgendaSlotKind;
  title: string;
  formationId: string;
  startMinutes: number;
}

/**
 * EF-8 — label of a month chip: the title for the validation quizzes and the mock exams, else
 * `{sigle} · {HH:MM}` for another formation, else the kind label (ADR-0183 §5).
 */
export function chipLabel(
  slot: ChipSlot,
  currentFormationId: string | null,
  sigleOfFormation: (formationId: string) => string,
): string {
  if (slot.kind === 'validation_quiz' || slot.kind === 'mock_exam') return slot.title;
  if (currentFormationId !== null && slot.formationId !== currentFormationId) {
    return `${sigleOfFormation(slot.formationId)} · ${minutesToClock(slot.startMinutes)}`;
  }
  return agendaSlotLabelOf(slot.kind);
}

export interface LegendEntry {
  kind: AgendaSlotKind;
  label: string;
}

/**
 * EF-10 — the legend: the six base entries, plus the complementary kinds present in the period.
 * The global quiz and the revision share the entry « Quiz global · révision ».
 */
export function legendEntriesOf(kindsInPeriod: readonly AgendaSlotKind[]): LegendEntry[] {
  const present = new Set<AgendaSlotKind>(kindsInPeriod);
  const entries: LegendEntry[] = [];
  const seen = new Set<string>();
  for (const kind of AGENDA_LEGEND_BASE_KINDS) {
    const label = kind === 'global_quiz' ? 'Quiz global · révision' : agendaSlotLabelOf(kind);
    if (seen.has(label)) continue;
    seen.add(label);
    entries.push({ kind, label });
  }
  for (const kind of AGENDA_LEGEND_EXTRA_KINDS) {
    if (!present.has(kind)) continue;
    entries.push({ kind, label: agendaSlotLabelOf(kind) });
  }
  return entries;
}

export interface MonthCells {
  firstDay: string;
  /** Number of leading blanks before the 1st (Monday first). */
  lead: number;
  days: string[];
}

/** EF-5 — the days of the month of `date`, preceded by the leading blanks. */
export function monthCells(date: string): MonthCells {
  const firstDay = monthFirstDay(date);
  const lead = civilDow(firstDay);
  const count = monthDayCount(date);
  return {
    firstDay,
    lead,
    days: Array.from({ length: count }, (_, index) => civilAdd(firstDay, index)),
  };
}

export { effectiveEndMinutes };
