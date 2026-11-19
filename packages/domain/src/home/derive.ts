// Pure derivations of the home screen (SPEC-603 ET-3). Every function receives its instant, its
// time zone and its identifiers from the caller: nothing reads the clock, the database or the
// configuration. The service and the client share them, so « Dans N min » stays exact between two
// refreshes without a second implementation.
import type {
  HomeAction,
  HomeModuleStatus,
  HomeNextActivity,
  HomeSlotKind,
  HomeSlotState,
} from '@learny/contracts';
import { formatUserDate, startOfUserDay, toUserZone } from '@learny/core';

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

export interface SlotForState {
  readonly id: string;
  readonly kind: HomeSlotKind;
  readonly status: 'planned' | 'done' | 'missed' | 'moved' | 'cancelled';
  readonly startsAt: string;
  readonly endsAt: string;
}

function instant(value: Date | string): number {
  return value instanceof Date ? value.getTime() : Date.parse(value);
}

/** EF-2 — slot states of the day card, in the order of the mockup's status pill. */
export function slotState(
  slot: SlotForState,
  now: Date | string,
  options: { readonly highlightId?: string } = {},
): HomeSlotState {
  if (slot.status === 'done') return 'done';
  if (slot.status === 'missed') return 'missed';
  const at = instant(now);
  const start = Date.parse(slot.startsAt);
  const end = Date.parse(slot.endsAt);
  if (slot.status === 'planned' && start <= at && at < end) return 'ongoing';
  if (options.highlightId !== undefined && options.highlightId === slot.id) return 'next';
  if (slot.kind === 'warmup' || slot.kind === 'micro_session') return 'todo';
  return 'upcoming';
}

/** EF-2 — rounded-up minutes until a future slot, never negative. */
export function minutesUntil(slot: Pick<SlotForState, 'startsAt'>, now: Date | string): number {
  return Math.max(0, Math.ceil((Date.parse(slot.startsAt) - instant(now)) / MS_PER_MINUTE));
}

/** EF-2 — the single highlighted line: first planned slot not a warmup or a micro-session. */
export function highlightedSlot<T extends SlotForState>(
  slots: readonly T[],
  now: Date | string,
): T | undefined {
  const at = instant(now);
  return [...slots]
    .filter(
      (slot) =>
        slot.status === 'planned' &&
        slot.kind !== 'warmup' &&
        slot.kind !== 'micro_session' &&
        Date.parse(slot.startsAt) >= at,
    )
    .sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt))[0];
}

/** EF-2 — « 5 h », « 1 h 30 », « 45 min »; whole minutes. */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${String(rest)} min`;
  if (rest === 0) return `${String(hours)} h`;
  return `${String(hours)} h ${String(rest)}`;
}

export const OBJECTIVE_LABELS = {
  operational: 'Être opérationnel',
  exam: 'Certification',
  dialogue: 'Dialoguer avec des experts',
  project: 'Livrer un projet',
} as const;

export function objectiveLabels(objectives: readonly (keyof typeof OBJECTIVE_LABELS)[]): string[] {
  return objectives.map((objective) => OBJECTIVE_LABELS[objective]);
}

export interface ModuleStatusInput {
  /** At least one chapter of the open module is still in progress (BR-APP-04). */
  readonly contributionsInProgress: boolean;
  readonly courseStatus: 'generating' | 'ready' | 'failed' | null;
  /** Smallest reading percentage of the current course, null when no chapter was opened. */
  readonly readingPercent: number | null;
  readonly attemptCount: number;
  readonly lastScore: number | null;
  /** BR-QUI — validation threshold of the module. */
  readonly threshold: number;
}

const MODULE_STATUS_LABELS = {
  contributions: { label: 'Apports en cours', tone: 'green' },
  preparing: { label: 'Cours en préparation', tone: 'indigo' },
  reading: { label: 'Cours à lire', tone: 'violet' },
  toTake: { label: 'Quiz à passer', tone: 'indigo' },
  toRetake: { label: 'Quiz à repasser', tone: 'orange' },
} as const satisfies Record<string, HomeModuleStatus>;

/**
 * EF-6 — activity pill of the open module. A contribution step that is not finished blocks the
 * quiz steps: the learner cannot have « Quiz à passer » before the course exists. Once the
 * contributions are done the order is retake > take > read > prepare (first true wins).
 */
export function moduleStatusPill(input: ModuleStatusInput): HomeModuleStatus | null {
  const contributionsDone = !input.contributionsInProgress;
  if (contributionsDone) {
    if (input.lastScore !== null && input.lastScore < input.threshold) {
      return MODULE_STATUS_LABELS.toRetake;
    }
    if (input.attemptCount === 0) return MODULE_STATUS_LABELS.toTake;
    if (input.readingPercent !== null && input.readingPercent < 100) {
      return MODULE_STATUS_LABELS.reading;
    }
  }
  if (input.courseStatus === 'generating') return MODULE_STATUS_LABELS.preparing;
  if (input.contributionsInProgress) return MODULE_STATUS_LABELS.contributions;
  return null;
}

const SLOT_LABELS: Readonly<Record<HomeSlotKind, string>> = {
  contributions: 'Apports',
  course: 'Cours',
  exercise: 'Exercice',
  validation_quiz: 'Quiz de validation',
  global_quiz: 'Quiz global',
  revision: 'Révision',
  sprint: 'Sprint',
  micro_session: 'Micro-séance',
  warmup: 'Échauffement',
  mock_exam: 'Examen blanc',
  buffer: 'Marge de rattrapage',
  weekly_review: 'Bilan',
};

export function slotLabel(kind: HomeSlotKind): string {
  return SLOT_LABELS[kind];
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function dayDifference(from: string, to: string): number {
  const [fy = 0, fm = 1, fd = 1] = from.split('-').map(Number);
  const [ty = 0, tm = 1, td = 1] = to.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / MS_PER_DAY);
}

/** EF-1 — « Mercredi 11 novembre » from a civil day and the learner's zone. */
export function civilDayLabel(day: string, timeZone: string): string {
  return capitalize(
    formatUserDate(startOfUserDay(day, timeZone), timeZone, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }),
  );
}

/** EF-6 — « 11 déc. 2026 » for an end or completion date. */
export function shortCivilDay(day: string, timeZone: string): string {
  return formatUserDate(startOfUserDay(day, timeZone), timeZone, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export interface NextActivitySlot {
  readonly kind: HomeSlotKind;
  readonly startsAt: string;
  readonly meta: string | null;
}

/** EF-6 — « Aujourd'hui, 14:00 », « Demain, 17:30 » or « jeu. 12 nov., 09:00 ». */
export function nextActivityLabel(
  slot: Pick<NextActivitySlot, 'startsAt'>,
  now: Date | string,
  timeZone: string,
): string {
  const today = toUserZone(now, timeZone).date;
  const day = toUserZone(slot.startsAt, timeZone).date;
  const time = toUserZone(slot.startsAt, timeZone).time;
  const difference = dayDifference(today, day);
  if (difference === 0) return `Aujourd'hui, ${time}`;
  if (difference === 1) return `Demain, ${time}`;
  const date = formatUserDate(slot.startsAt, timeZone, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  return `${date}, ${time}`;
}

/** EF-6 — type label of the next activity, with the chapter of a contributions slot. */
export function nextActivityDetail(slot: NextActivitySlot): string {
  const label = slotLabel(slot.kind);
  if (slot.kind !== 'contributions') return label;
  const match = /chapitre\s+(\d+)/i.exec(slot.meta ?? '');
  return match?.[1] === undefined ? label : `${label}, chapitre ${match[1]}`;
}

export function nextActivity(
  slot: NextActivitySlot | null | undefined,
  now: Date | string,
  timeZone: string,
): HomeNextActivity | null {
  if (slot === null || slot === undefined) return null;
  return {
    when: nextActivityLabel(slot, now, timeZone),
    detail: nextActivityDetail(slot),
  };
}

/** EF-4 — deferred day, long name within six days, short date afterwards. */
export function deferredDayLabel(day: string, today: string, timeZone: string): string {
  const difference = dayDifference(today, day);
  if (difference >= 0 && difference <= 6) {
    return formatUserDate(startOfUserDay(day, timeZone), timeZone, {
      weekday: 'long',
    }).toLowerCase();
  }
  return formatUserDate(startOfUserDay(day, timeZone), timeZone, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/** EF-7 — « 4 semaines · 60 h » of a completed formation. */
export interface CompletedSummaryInput {
  readonly startDate: string | null;
  readonly completedAt: string | null;
  readonly volumeHours: number | null;
  readonly timeZone: string;
}

export interface CompletedSummary {
  readonly completedOn: string | null;
  readonly dateLabel: string | null;
  readonly weeks: number | null;
  readonly hours: number | null;
}

export function completedSummary(input: CompletedSummaryInput): CompletedSummary {
  if (input.completedAt === null) {
    return {
      completedOn: null,
      dateLabel: null,
      weeks: null,
      hours: input.volumeHours,
    };
  }
  const completedOn = toUserZone(input.completedAt, input.timeZone).date;
  const weeks =
    input.startDate === null
      ? null
      : Math.max(1, Math.ceil(dayDifference(input.startDate, completedOn) / 7));
  return {
    completedOn,
    dateLabel: shortCivilDay(completedOn, input.timeZone),
    weeks,
    hours: input.volumeHours,
  };
}

export interface ActionSlot {
  readonly formationId: string;
  readonly moduleId?: string | null;
  readonly activityId?: string | null;
  readonly kind: HomeSlotKind;
}

/** Module page of a formation, with its open module when known. */
export function moduleHref(formationId: string, moduleId?: string | null): string {
  return moduleId === undefined || moduleId === null
    ? `/formations/${formationId}/programme`
    : `/formations/${formationId}/modules/${moduleId}`;
}

/** ET-4 — main action of the highlighted slot; buffer, weekly review and nothing return null. */
export function primaryActionFor(slot: ActionSlot | null | undefined): HomeAction | null {
  if (slot === null || slot === undefined) return null;
  const { formationId } = slot;
  const module = moduleHref(formationId, slot.moduleId);
  switch (slot.kind) {
    case 'validation_quiz':
      return {
        label: 'Commencer le quiz de validation',
        href: `${module}/quiz`,
      };
    case 'course':
      return { label: 'Reprendre le cours', href: `${module}/cours` };
    case 'contributions':
      return { label: 'Déposer mes apports', href: module };
    case 'exercise':
      return {
        label: "Faire l'exercice",
        href:
          slot.activityId === undefined || slot.activityId === null
            ? `${module}/exercices`
            : `${module}/exercices/${slot.activityId}`,
      };
    case 'global_quiz':
    case 'revision':
    case 'sprint':
      return {
        label: 'Réviser maintenant',
        href: `/formations/${formationId}/quiz-global`,
      };
    case 'mock_exam':
      return {
        label: "Commencer l'examen blanc",
        href: `/formations/${formationId}/examen-blanc`,
      };
    case 'buffer':
    case 'weekly_review':
    case 'warmup':
    case 'micro_session':
      return null;
    default:
      return null;
  }
}

/** EF-2 — pill link of a warmup or a micro-session. */
export function slotHref(slot: ActionSlot): string {
  if (slot.kind === 'warmup') return '#echauffement';
  if (slot.kind === 'micro_session') {
    return `/formations/${slot.formationId}/quiz-global?mode=micro`;
  }
  return primaryActionFor(slot)?.href ?? moduleHref(slot.formationId, slot.moduleId);
}
