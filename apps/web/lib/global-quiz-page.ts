import { randomUUID } from 'node:crypto';

import { notFound, redirect } from 'next/navigation';

import type { GlobalQuizSessionDto } from '@learny/contracts';
import { clock } from '@learny/core';
import { createServiceContext, getMe, getOrCreateTodaySession } from '@learny/services';

import { formatDueInterval } from './format/interval';
import { SIGN_IN_PATH } from './route-guard';
import { readPageSession } from './supabase/page';

export interface GlobalQuizPageData {
  session: GlobalQuizSessionDto;
  timeZone: string;
  /** ET-7 labels of the four self-assessment buttons, per item position. */
  dueLabelsByPosition: Record<string, Record<string, string>>;
}

export type GlobalQuizPageResult =
  { ok: true; data: GlobalQuizPageData } | { ok: false; requestId?: string };

/**
 * Server read of SCR-10 (SPEC-701 ET-9). The page and `GET today` call the same service under the
 * learner's session; a foreign or completed formation is a 404. The due labels are formatted here
 * with the injected clock and the learner's time zone, so hydration is deterministic (ADR-0047).
 */
export async function loadGlobalQuizPage(formationId: string): Promise<GlobalQuizPageResult> {
  const session = await readPageSession();
  if (session === null) redirect(SIGN_IN_PATH);
  const ctx = createServiceContext({ userId: session.userId, requestId: randomUUID() });
  const [quiz, me] = await Promise.all([
    getOrCreateTodaySession(ctx, formationId, 'full'),
    getMe(ctx),
  ]);
  if (!quiz.ok) {
    if (quiz.error.code === 'NOT_FOUND') notFound();
    return quiz.error.requestId === undefined
      ? { ok: false }
      : { ok: false, requestId: quiz.error.requestId };
  }
  const timeZone = me.ok ? me.value.timezone : 'Europe/Paris';
  const now = clock.now();
  const dueLabelsByPosition: Record<string, Record<string, string>> = {};
  for (const item of quiz.value.items) {
    if (item.intervals === null) continue;
    dueLabelsByPosition[String(item.position)] = {
      again: formatDueInterval(item.intervals.again, now, timeZone),
      hard: formatDueInterval(item.intervals.hard, now, timeZone),
      good: formatDueInterval(item.intervals.good, now, timeZone),
      easy: formatDueInterval(item.intervals.easy, now, timeZone),
    };
  }
  return { ok: true, data: { session: quiz.value, timeZone, dueLabelsByPosition } };
}
