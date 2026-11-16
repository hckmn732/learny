// Pure helpers of the capped and smoothed global quiz (SPEC-718, BR-AUT-07).
//
// `buildDailySession` owns the draw; this module only forwards the automation settings to it and
// exposes the selected notions, the deferred ones and the explicit reason. Reopening a smoothed
// day is a union, so a second undo never duplicates a notion.
import { buildDailySession } from './build-daily-session';
import type { BuildDailySessionInput, DeferredNotion } from './types';

export interface QuizSmoothingPlan {
  selected: string[];
  deferred: {
    notionId: string;
    reason: DeferredNotion['reason'];
    proposedFor: string | null;
  }[];
  estimatedMinutes: number;
  maxMinutes: number;
  targetRetention: number;
  deferredReason: 'cap' | null;
}

/** ET-3 — passes `{maxMinutes, targetRetention}` to the pure draw of SPEC-406. */
export function drawSmoothQuizSession(
  input: Omit<BuildDailySessionInput, 'capMinutes' | 'targetRetention'> & {
    maxMinutes: number;
    targetRetention: number;
  },
): QuizSmoothingPlan {
  const { maxMinutes, targetRetention, ...rest } = input;
  const drawn = buildDailySession({ ...rest, capMinutes: maxMinutes, targetRetention });
  return {
    selected: [...new Set(drawn.items.map((item) => item.notionId))],
    deferred: drawn.deferred.map((entry) => ({
      notionId: entry.notionId,
      reason: entry.reason,
      proposedFor: entry.proposedFor,
    })),
    estimatedMinutes: drawn.estimatedMinutes,
    maxMinutes,
    targetRetention,
    deferredReason: drawn.deferred.some((entry) => entry.reason === 'cap') ? 'cap' : null,
  };
}

/** ET-4 / CA-2 — reopening is a union: a second undo never duplicates a notion. */
export function reintroduceDeferredNotions(
  current: readonly string[],
  deferred: readonly string[],
): string[] {
  return [...new Set([...current, ...deferred])];
}
