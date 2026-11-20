import { notFound, redirect } from 'next/navigation';

import type { GlobalQuizSessionDto } from '@learny/contracts';
import { clock } from '@learny/core';

import { apiErrorRequestId, isApiError, serverApi } from './api/server-client';
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
 * Server read of SCR-10 (SPEC-701 ET-9; SPEC-703 EF-9). The page and `GET today` call the same
 * service under the learner's session; a foreign or completed formation is a 404. The due labels
 * are formatted here with the injected clock and the learner's time zone, so hydration is
 * deterministic (ADR-0047). The mode is the normalized `?mode=` of the page: `micro` opens the
 * short session, any other value is ignored (full session).
 */
export async function loadGlobalQuizPage(
  formationId: string,
  mode: 'full' | 'micro' = 'full',
): Promise<GlobalQuizPageResult> {
  const session = await readPageSession();
  if (session === null) redirect(SIGN_IN_PATH);
  const client = await serverApi();
  let quiz: GlobalQuizSessionDto;
  let timeZone = 'Europe/Paris';
  try {
    [quiz, timeZone] = await Promise.all([
      client.api.globalQuizToday({
        params: { fid: formationId },
        query: { mode },
      }),
      client.api.meGet({}).then(
        (profile) => profile.timezone,
        (error: unknown) => {
          if (isApiError(error, 'UNAUTHENTICATED')) redirect(SIGN_IN_PATH);
          return 'Europe/Paris';
        },
      ),
    ]);
  } catch (error) {
    if (isApiError(error, 'NOT_FOUND')) notFound();
    if (isApiError(error, 'UNAUTHENTICATED')) redirect(SIGN_IN_PATH);
    const requestId = apiErrorRequestId(error);
    return requestId === undefined ? { ok: false } : { ok: false, requestId };
  }
  const now = clock.now();
  const dueLabelsByPosition: Record<string, Record<string, string>> = {};
  for (const item of quiz.items) {
    if (item.intervals === null) continue;
    dueLabelsByPosition[String(item.position)] = {
      again: formatDueInterval(item.intervals.again, now, timeZone),
      hard: formatDueInterval(item.intervals.hard, now, timeZone),
      good: formatDueInterval(item.intervals.good, now, timeZone),
      easy: formatDueInterval(item.intervals.easy, now, timeZone),
    };
  }
  return { ok: true, data: { session: quiz, timeZone, dueLabelsByPosition } };
}
