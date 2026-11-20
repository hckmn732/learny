// Server preload of the agenda (SPEC-704 ET-8). The first period of the URL (default week of
// today in the learner's zone) is read server-side so the screen paints with data; the client
// component takes over for the interactions (ADR-0063).
import { redirect } from 'next/navigation';

import type { AgendaDto } from '@learny/contracts';
import { clock, userLocalDay } from '@learny/core';

import { resolveAgendaState, type AgendaUrlState } from './agenda/state';
import { agendaFetchWindow } from './agenda/window';
import { apiErrorRequestId, isApiError, serverApi } from './api/server-client';
import { SIGN_IN_PATH } from './route-guard';
import { readPageSession } from './supabase/page';

export type AgendaPageResult =
  | { ok: true; data: AgendaDto; state: AgendaUrlState; window: { from: string; to: string } }
  | { ok: false; requestId?: string; state: AgendaUrlState };

export type AgendaSearchParams = Record<string, string | string[] | undefined>;

/**
 * ET-8 — resolves the URL state, then reads the agenda for the window it implies. A failed read
 * keeps the resolved state so the client component can retry with the same query key.
 */
export async function loadAgendaPage(searchParams: AgendaSearchParams): Promise<AgendaPageResult> {
  const session = await readPageSession();
  if (session === null) {
    return {
      ok: false,
      state: resolveAgendaState(searchParams, '2026-11-11', null),
    };
  }
  const client = await serverApi();
  let today = userLocalDay(clock.now(), 'Europe/Paris');
  let bounds: AgendaDto['bounds'] | null = null;
  try {
    const probe = await client.api.agendaGet({
      query: { from: today, to: today, formation: 'all' },
    });
    today = probe.today;
    bounds = probe.bounds;
  } catch (error) {
    if (isApiError(error, 'UNAUTHENTICATED')) redirect(SIGN_IN_PATH);
  }
  const state = resolveAgendaState(searchParams, today, bounds);
  const window = agendaFetchWindow(state.view, state.date);
  try {
    const data = await client.api.agendaGet({
      query: { from: window.from, to: window.to, formation: state.formation },
    });
    return { ok: true, data, state, window };
  } catch (error) {
    if (isApiError(error, 'UNAUTHENTICATED')) redirect(SIGN_IN_PATH);
    const requestId = apiErrorRequestId(error);
    return {
      ok: false,
      ...(requestId === undefined ? {} : { requestId }),
      state,
    };
  }
}
