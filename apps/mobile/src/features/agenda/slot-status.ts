// Badge and emphasis of a slot (SPEC-3203 BR-AGE-04, EF-3, CA-1).
//
// The server sends `planned | done | missed`; the agenda adds the clock of the learner to refine
// `planned`, exactly as the mockup shows it at 13:20 on 11 November: « Faire » when the activity
// starts within half an hour (or runs now), « Dans 40 min » inside the next hour, « À venir »
// beyond. The `soon` badge is the ink card of the mockup, the `todo` one the lime dot.
export type SlotBadgeKind = 'done' | 'todo' | 'soon' | 'upcoming' | 'missed';

/** Badge of a slot; `minutes` is only set for `soon` (the « Dans N min » label). */
export interface SlotBadge {
  readonly kind: SlotBadgeKind;
  readonly minutes: number | null;
}

/** Clock of the learner, read by the screen: its civil day and its local minute of the day. */
export interface SlotClock {
  readonly today: string;
  readonly nowMinutes: number;
}

/** An activity starting in the next half hour is « à faire » (BR-AGE-04). */
export const TODO_WINDOW_MINUTES = 30;

/** Up to one hour ahead the badge counts the minutes (« Dans 40 min »). */
export const SOON_WINDOW_MINUTES = 60;

/** The fields of a slot the badge needs (contract `AgendaSlot`). */
export interface StatusSlot {
  readonly date: string;
  readonly startMinutes: number;
  readonly endMinutes: number;
  readonly status: 'planned' | 'done' | 'missed';
}

/** Badge of `slot` at the clock of the learner (BR-AGE-04, CA-1). */
export function slotBadgeOf(slot: StatusSlot, clock: SlotClock): SlotBadge {
  if (slot.status === 'done') return { kind: 'done', minutes: null };
  if (slot.status === 'missed') return { kind: 'missed', minutes: null };
  // A planned slot of a past day (or one that ended) is displayed as missed: the server keeps the
  // status of the row, the agenda reads the clock of the learner (CL-1).
  if (slot.date < clock.today) return { kind: 'missed', minutes: null };
  if (slot.date > clock.today) return { kind: 'upcoming', minutes: null };
  if (slot.startMinutes <= clock.nowMinutes && clock.nowMinutes < slot.endMinutes) {
    return { kind: 'todo', minutes: 0 };
  }
  if (clock.nowMinutes >= slot.endMinutes) return { kind: 'missed', minutes: null };
  const minutes = slot.startMinutes - clock.nowMinutes;
  if (minutes <= TODO_WINDOW_MINUTES) return { kind: 'todo', minutes };
  if (minutes <= SOON_WINDOW_MINUTES) return { kind: 'soon', minutes };
  return { kind: 'upcoming', minutes: null };
}

/** Visual emphasis of a slot in the day timeline (EF-3, CA-5). */
export type SlotEmphasis = 'now' | 'next' | 'plain';

/**
 * `now` draws the ink card and the orange dot of the mockup (the imminent activity), `next` the
 * lime dot of the activity to start, `plain` the white card of the others.
 */
export function slotEmphasis(badge: SlotBadge): SlotEmphasis {
  if (badge.kind === 'soon') return 'now';
  if (badge.kind === 'todo') return 'next';
  return 'plain';
}
