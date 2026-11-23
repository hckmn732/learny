// View model of the Aujourd'hui screen (SPEC-3201 EF-1 to EF-9, ET-2; BR-PRO-02).
//
// Pure functions only: the instant, the zone and the DTOs come from the caller, nothing reads the
// clock. The derivations of `@learny/domain/home/derive` are reused as is (`highlightedSlot`,
// `slotState`, `minutesUntil`, `slotLabel`, `primaryActionFor`, `formatDuration`), so the screen and
// the web never disagree on what « la séance du jour » means (ADR-3005).
import type { HomeDto, HomeSlot, HomeSlotKind, HomeSlotState, WarmupDto } from '@learny/contracts';
import {
  formatDuration,
  highlightedSlot,
  minutesUntil,
  primaryActionFor,
  slotState,
} from '@learny/domain/home/derive';
import { fr } from '@learny/i18n';

import { formatShortDay, formatTime } from '../../lib/dates';

/** One minute in milliseconds. */
export const MINUTE_MS = 60_000;

/** Two minutes: the duration of a warm-up, fixed by SPEC-714 EF-7 (« N questions · 2 min »). */
export const WARMUP_MINUTES = 2;

const t = fr.mobile.today;

/** « 5 h », « 45 min »: the day's hours, rounded to the hour above sixty minutes (mockup wording). */
export function hoursLabel(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return formatDuration(total);
  return `${String(Math.round(total / 60))} h`;
}

/** Lower-cases the first letter of a server label (« Tentative 2 » → « tentative 2 »). */
export function lowerFirst(value: string): string {
  return value.length === 0 ? value : value.charAt(0).toLowerCase() + value.slice(1);
}

/** EF-2 — state of a slot at `now`, the highlighted one being `next` until it starts. */
export function stateOf(slot: HomeSlot, now: Date, highlightId?: string): HomeSlotState {
  return slotState(slot, now, highlightId === undefined ? {} : { highlightId });
}

export type DestinationKind = 'app' | 'web';

export interface SlotDestination {
  readonly kind: DestinationKind;
  /** Mobile route for `app`, web path for `web` (ADR-3002 § 3). */
  readonly path: string;
}

/**
 * ET-4 — where a slot leads. The review screens are delivered (`/reviser`), every other screen
 * belongs to a later specification: the web page of the slot opens meanwhile, exactly like the
 * notification table of SPEC-3102.
 */
export function destinationOfSlot(slot: {
  readonly kind: HomeSlotKind;
  readonly formationId: string;
  readonly moduleId: string | null;
  readonly activityId: string | null;
  readonly href: string;
}): SlotDestination {
  if (slot.kind === 'global_quiz' || slot.kind === 'revision' || slot.kind === 'sprint') {
    return { kind: 'app', path: '/reviser' };
  }
  const action = primaryActionFor({
    formationId: slot.formationId,
    moduleId: slot.moduleId,
    activityId: slot.activityId,
    kind: slot.kind,
  });
  return { kind: 'web', path: action?.href ?? slot.href };
}

export interface HeroModel {
  readonly slotId: string;
  readonly kind: HomeSlotKind;
  readonly title: string;
  /** « Comptabilité générale · tentative 2 · seuil 80 % ». */
  readonly detail: string;
  readonly time: string;
  readonly state: HomeSlotState;
  /** EF-2 — « Commencer · 60 min » or « Reprendre » when the slot already started (CL-2). */
  readonly actionLabel: string;
  readonly durationMinutes: number;
  readonly progress: number;
  readonly doneLabel: string;
  readonly plannedLabel: string;
  /** Minutes until the start, recomputed every minute (ET-2); null once started. */
  readonly minutesUntil: number | null;
  readonly destination: SlotDestination;
  /** CL-5 — offline, only the global quiz stays startable. */
  readonly startableOffline: boolean;
  /** Announced label of the card (« Votre séance, Quiz de validation, 14:00 »). */
  readonly label: string;
}

/** EF-2 — the card « Votre séance » of the highlighted slot, or null on an empty day (EF-9). */
export function heroOf(home: HomeDto, now: Date): HeroModel | null {
  const slot = highlightedSlot(home.today.slots, now);
  if (slot === undefined) return null;

  const formation = home.formations.ongoing.find((row) => row.id === slot.formationId);
  const module = formation?.moduleTitle ?? null;
  const meta = slot.meta === null || slot.meta === '' ? null : lowerFirst(slot.meta);
  const detail = [module, meta].filter((part): part is string => part !== null).join(' · ');
  const durationMinutes = Math.max(
    1,
    Math.round((Date.parse(slot.endsAt) - Date.parse(slot.startsAt)) / MINUTE_MS),
  );
  const state = stateOf(slot, now, slot.id);
  const startsIn = Date.parse(slot.startsAt) - now.getTime();

  return {
    slotId: slot.id,
    kind: slot.kind,
    title: slot.title,
    detail,
    time: slot.time,
    state,
    actionLabel: state === 'ongoing' ? t.resume : t.start(durationMinutes),
    durationMinutes,
    progress:
      home.today.plannedMinutes === 0 ? 0 : home.today.doneMinutes / home.today.plannedMinutes,
    doneLabel: t.hoursDone(hoursLabel(home.today.doneMinutes)),
    plannedLabel: t.hoursPlanned(hoursLabel(home.today.plannedMinutes)),
    minutesUntil: startsIn > 0 ? minutesUntil(slot, now) : null,
    destination: destinationOfSlot(slot),
    startableOffline: slot.kind === 'global_quiz',
    label: t.heroLabel(slot.title, slot.time),
  };
}

/** BR-GAM-01 — the streak displayed is the one the server computed (EF-4). */
export function streakDays(data: { readonly days: number } | null): number | null {
  return data === null ? null : data.days;
}

/** BR-MEM-06 — the one-month retention of the server, null while nothing was measured. */
export function retentionOf(home: HomeDto): number | null {
  return home.retention.oneMonth;
}

/** EF-4 — the formation whose open gaps the « Lacunes » sheet lists. */
export function gapsFormationOf(home: HomeDto): string | null {
  const primary = home.formations.ongoing.find((row) => row.primaryAction);
  return primary?.id ?? home.globalQuiz?.formationId ?? null;
}

/** EF-2 — label of a remaining activity: « Fait », « Dans 40 min », « À venir », « Manqué ». */
export function statusLabel(slot: HomeSlot, now: Date): string {
  const state = stateOf(slot, now);
  switch (state) {
    case 'done':
      return t.states.done;
    case 'ongoing':
      return t.states.ongoing;
    case 'missed':
      return t.states.missed;
    case 'next':
    case 'upcoming':
    case 'todo': {
      const startsIn = Date.parse(slot.startsAt) - now.getTime();
      if (startsIn <= 0) return t.states.inMinutes(0);
      const minutes = minutesUntil(slot, now);
      return minutes <= 120 ? t.states.inMinutes(minutes) : t.states.upcoming;
    }
    default:
      return t.states.upcoming;
  }
}

export interface DayLine {
  readonly id: string;
  readonly kind: HomeSlotKind;
  readonly time: string;
  readonly title: string;
  readonly detail: string;
  readonly status: string;
  readonly state: HomeSlotState;
  readonly destination: SlotDestination;
}

/**
 * EF-2, EF-7 — the rest of the day. The warm-up and the micro-session are carried by their own
 * card above the section, so they never appear twice; the highlighted slot is the hero card.
 */
export function linesOf(home: HomeDto, now: Date, heroId: string | null): DayLine[] {
  return home.today.slots
    .filter((slot) => slot.id !== heroId)
    .filter((slot) => slot.kind !== 'warmup' && slot.kind !== 'micro_session')
    .map((slot) => ({
      id: slot.id,
      kind: slot.kind,
      time: slot.time,
      title: slot.title,
      detail: slot.meta ?? '',
      status: statusLabel(slot, now),
      state: stateOf(slot, now),
      destination: destinationOfSlot(slot),
    }));
}

/** EF-9 — the next activity of the learner when the day is empty. */
export function nextActivityOf(home: HomeDto): string | null {
  const next = home.formations.ongoing.find((row) => row.nextActivity !== null)?.nextActivity;
  return next === null || next === undefined ? null : `${next.detail} · ${next.when}`;
}

export interface WarmupCardModel {
  readonly activityId: string;
  readonly count: number;
  readonly minutes: number;
  readonly title: string;
  /** The session the warm-up precedes, for the announced label (SPEC-714 EF-7). */
  readonly nextKind: string;
  readonly href: string;
}

/** EF-7 — the warm-up of the day, when one is still to do. */
export function warmupCardOf(
  data: { readonly items: readonly WarmupDto[] } | null,
): WarmupCardModel | null {
  const warmup = data?.items.find((item) => item.status !== 'done');
  if (warmup === undefined) return null;
  return {
    activityId: warmup.activityId,
    count: warmup.items.length,
    minutes: WARMUP_MINUTES,
    title: t.warmup.title(warmup.items.length, WARMUP_MINUTES),
    nextKind: warmup.nextSession.kind,
    href: warmup.nextSession.href,
  };
}

/** EF-3 — « jeu. 12 nov. 10:30 » of a proposed window, in the learner's zone (BR-ACC-07). */
export function alternativeLabel(
  alternative: { readonly startsAt: string },
  timeZone: string,
): string {
  return `${formatShortDay(alternative.startsAt, timeZone)} ${formatTime(alternative.startsAt, timeZone)}`;
}

/** EF-3 — « Séance déplacée à jeu. 12 nov. 10:30 » (toast of a successful move). */
export function movedToast(day: string, time: string): string {
  return t.toasts.moved(`${day} ${time}`);
}
