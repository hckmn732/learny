// Server preload of the agenda (SPEC-704 ET-8). The first period of the URL (default week of
// today in the learner's zone) is read server-side so the screen paints with data; the client
// component takes over for the interactions (ADR-0063).
import { randomUUID } from 'node:crypto';

import type { AgendaDto } from '@learny/contracts';
import { userLocalDay } from '@learny/core';
import { createServiceContext, getAgenda } from '@learny/services';

import { resolveAgendaState, type AgendaUrlState } from './agenda/state';
import { agendaFetchWindow } from './agenda/window';
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
  const ctx = createServiceContext({ userId: session.userId, requestId: randomUUID() });
  // The timezone and the current formation come from the profile; they are read again by the
  // service, so the preview query only computes `today` for the default date.
  const probe = await getAgenda(ctx, {
    from: userLocalDay(ctx.clock.now(), 'Europe/Paris'),
    to: userLocalDay(ctx.clock.now(), 'Europe/Paris'),
    formation: 'all',
  });
  const today = probe.ok ? probe.value.today : userLocalDay(ctx.clock.now(), 'Europe/Paris');
  const bounds = probe.ok ? probe.value.bounds : null;
  const state = resolveAgendaState(searchParams, today, bounds);
  const window = agendaFetchWindow(state.view, state.date);
  const result = await getAgenda(ctx, {
    from: window.from,
    to: window.to,
    formation: state.formation,
  });
  if (result.ok) {
    return { ok: true, data: result.value, state, window };
  }
  const error = result.error;
  return {
    ok: false,
    ...(error.requestId === undefined ? {} : { requestId: error.requestId }),
    state,
  };
}
