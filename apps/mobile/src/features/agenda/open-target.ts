// « Ouvrir » of an activity (SPEC-3203 EF-6, CA-1; quickfix « rattrapage mobile »).
//
// The mobile opens the course, the validation quiz, the global quiz and the warm-up in the
// application once SPEC-3302, SPEC-3304 and SPEC-3305 exist; the mock exam opens the native screen
// of the quickfix as soon as the slot carries its activity identifier. Every other kind (exercise,
// revision…) belongs to the web (ADR-3002 § 1) and keeps the page carried by the slot `href`, so
// the button is never dead: the reader of the slot keeps one destination, the one computed
// server-side behind RLS.
import type { AgendaSlot, AgendaSlotKind } from '@learny/contracts';

import { openOnWeb } from '../../lib/web';

/** Kinds the mobile opens itself once SPEC-3302/3304/3305 are delivered (EF-6). */
export const OPENABLE_KINDS: readonly AgendaSlotKind[] = [
  'course',
  'validation_quiz',
  'global_quiz',
  'warmup',
];

/** Native destination of a slot, `null` when the application has no screen for that kind. */
export interface SlotDestination {
  readonly pathname: '/aujourdhui/examen-blanc/[activityId]';
  readonly params: { readonly activityId: string };
}

/** Router surface used by « Ouvrir » (the `useRouter` of expo-router satisfies it). */
export interface SlotRouter {
  readonly push: (destination: SlotDestination) => void;
}

/** Kinds with a screen of their own in the application. */
export function opensInApp(kind: AgendaSlotKind): boolean {
  return OPENABLE_KINDS.includes(kind);
}

/**
 * Native destination of a slot: the mock exam has a screen of its own since the quickfix
 * « rattrapage mobile », as soon as the activity identifier is known (zone C).
 */
export function destinationOf(slot: AgendaSlot): SlotDestination | null {
  if (slot.kind !== 'mock_exam' || slot.activityId === null) return null;
  return {
    pathname: '/aujourdhui/examen-blanc/[activityId]',
    params: { activityId: slot.activityId },
  };
}

/** True when the « Ouvrir » link is drawn: a pending activity the learner can open (EF-3). */
export function isOpenable(slot: AgendaSlot): boolean {
  // Seules les activités réellement ouvrables portent le lien : une marge de rattrapage, un
  // sprint ou un apport restent des lignes d'agenda, jamais des destinations (EF-3, EF-6).
  if (slot.status === 'done' || slot.status === 'missed') return false;
  return opensInApp(slot.kind);
}

/**
 * Opens the destination of `slot`: the native mock-exam screen when its identifier is known,
 * otherwise the web page the server computed for this activity (ET-5 of SPEC-704).
 */
export async function openSlot(slot: AgendaSlot, router: SlotRouter): Promise<string | null> {
  const destination = destinationOf(slot);
  if (destination !== null) {
    router.push(destination);
    return null;
  }
  return openOnWeb(slot.href);
}
