// « Ouvrir » of an activity (SPEC-3203 EF-6, CA-1).
//
// The mobile opens the course, the validation quiz, the global quiz and the warm-up in the
// application once SPEC-3302, SPEC-3304 and SPEC-3305 exist; every other kind (exercise, mock
// exam, revision…) belongs to the web (ADR-3002 § 1). Until those screens land, the four kinds
// also hand off to the web page carried by the slot `href`, so the button is never dead: the
// reader of the slot keeps one destination, the one computed server-side behind RLS.
import type { AgendaSlot, AgendaSlotKind } from '@learny/contracts';

import { openOnWeb } from '../../lib/web';

/** Kinds the mobile opens itself once SPEC-3302/3304/3305 are delivered (EF-6). */
export const OPENABLE_KINDS: readonly AgendaSlotKind[] = [
  'course',
  'validation_quiz',
  'global_quiz',
  'warmup',
];

/** Kinds with a screen of their own in the application. */
export function opensInApp(kind: AgendaSlotKind): boolean {
  return OPENABLE_KINDS.includes(kind);
}

/** True when the « Ouvrir » link is drawn: a pending activity the learner can open (EF-3). */
export function isOpenable(slot: AgendaSlot): boolean {
  if (slot.status === 'done' || slot.status === 'missed') return false;
  return opensInApp(slot.kind) || slot.href !== '';
}

/**
 * Opens the destination of `slot`. Every kind still lands on the web until the screens of P33
 * exist: `slot.href` is the destination the server computed for this activity (ET-5 of SPEC-704).
 */
export async function openSlot(slot: AgendaSlot): Promise<string> {
  return openOnWeb(slot.href);
}
