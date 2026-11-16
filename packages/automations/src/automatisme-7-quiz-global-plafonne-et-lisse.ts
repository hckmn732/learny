// « Quiz global plafonné et lissé » (SPEC-718, BR-AUT-07, ADR-0190, ADR-0047).
//
// The pure draw of SPEC-406 already caps a day at `maxMinutes` and returns the selected notions,
// the deferred ones and an explicit reason. This definition only carries the settings to that draw
// and turns a deferral into one replay-safe `quiz_smoothed` action: the deferred IDs, the local
// date, the cap and the undo material. `apply` writes nothing: the session is the effect and a
// started session already froze its snapshot (ET-5). Undo never writes a fake `review_log`; the
// session service reopens the deferred notions from the deterministic draw on the next read
// (ET-4). No clock is read here: the service passes its injected instant.
import {
  QUIZ_SMOOTHED_KIND,
  QuizSmoothingParams,
  QuizSmoothingTrigger,
  quizSmoothingDedupeKey,
} from '@learny/contracts';

import {
  defineAutomation,
  type AutomationActionView,
  type AutomationDefinition,
} from './moteur-d-automatismes';

const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const SUMMARY_MAX = 160;

function clip(value: string): string {
  return value.length <= SUMMARY_MAX ? value : `${value.slice(0, SUMMARY_MAX - 1).trimEnd()}…`;
}

function weekday(day: string): string {
  const parsed = new Date(`${day}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? day : (WEEKDAYS[parsed.getUTCDay()] ?? day);
}

function shortDate(day: string): string {
  const parsed = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return day;
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(parsed);
}

function stringOf(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value !== '' ? value : fallback;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** EF-2, CL-3 — one line for every status of the journal; no notion is ever silently dropped. */
export function explainQuizSmoothed(action: AutomationActionView): string {
  const payload = action.payload;
  const due = numberOr(payload.dueCount, 0);
  const deferred = Array.isArray(payload.deferredNotionIds)
    ? payload.deferredNotionIds.length
    : numberOr(payload.deferredCount, 0);
  const cap = numberOr(payload.maxMinutes, 15);
  const localDate = stringOf(payload.localDate);
  const deferredTo = stringOf(payload.deferredTo);
  if (action.status === 'undone') {
    return clip(
      `Annulé : le lissage du ${shortDate(localDate)} est retiré, toutes les notions dues restent aujourd’hui.`,
    );
  }
  if (deferred <= 0)
    return clip(`Aucune notion reportée : la journée tient sous ${String(cap)} min.`);
  return clip(
    `${String(due)} notions étaient dues aujourd’hui : ${String(deferred)} ${deferred === 1 ? 'est reportée' : 'sont reportées'} à ${weekday(deferredTo)} pour rester sous ${String(cap)} min.`,
  );
}

/** ET-4 — one draft from the direct trigger of the session creation. */
export const plafondQuizAutomation: AutomationDefinition<typeof QuizSmoothingParams> =
  defineAutomation({
    key: 'plafond_quiz',
    // The session creation calls the definition synchronously; no domain event is invented.
    triggers: [{ type: 'direct' }],
    params: QuizSmoothingParams,
    run: (_ctx, trigger) => {
      if (trigger.type !== 'direct') return Promise.resolve([]);
      const parsed = QuizSmoothingTrigger.safeParse(trigger.data ?? {});
      if (!parsed.success) return Promise.resolve([]);
      const data = parsed.data;
      if (data.deferredNotionIds.length === 0) return Promise.resolve([]);
      const dedupeKey = quizSmoothingDedupeKey(data.formationId, data.localDate);
      return Promise.resolve([
        {
          kind: QUIZ_SMOOTHED_KIND,
          formationId: data.formationId,
          requiresConsent: false,
          payload: {
            dedupeKey,
            formationId: data.formationId,
            localDate: data.localDate,
            deferredTo: data.deferredTo,
            dueCount: data.dueCount,
            selectedCount: data.selectedCount,
            deferredNotionIds: data.deferredNotionIds,
            estimatedMinutes: data.estimatedMinutes,
            maxMinutes: data.maxMinutes,
            targetRetention: data.targetRetention,
            reason: 'cap',
          },
          undoPayload: {
            formationId: data.formationId,
            localDate: data.localDate,
            deferredNotionIds: data.deferredNotionIds,
          },
          dedupeKey,
        },
      ]);
    },
    explain: explainQuizSmoothed,
  });

/** ET-3, ET-4 — pure draw and reopening helpers, shared with the service. */
export { drawSmoothQuizSession, reintroduceDeferredNotions } from '@learny/learning-engine';
