// EF-1 — resolution of the agenda state from the URL search parameters. Any invalid value is
// replaced by the default; a date outside the navigation bounds is brought back to the closest
// bound (CL-6). The function is pure: `today` comes from the caller (server clock or frozen page).
import { civilAdd, parseCivilDay } from './dates';

export type AgendaView = 'jour' | 'semaine' | 'mois';

export const AGENDA_VIEWS: readonly AgendaView[] = ['jour', 'semaine', 'mois'];

export interface AgendaBounds {
  start: string;
  end: string;
}

export interface AgendaUrlState {
  view: AgendaView;
  date: string;
  formation: string;
  /** Selected slot from the URL, or null for the default selection (EF-8, CL-10). */
  creneau: string | null;
}

export type AgendaSearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Brings a civil day back inside the bounds; without bounds the day is kept (CL-6). */
export function clampCivilDay(date: string, bounds: AgendaBounds | null): string {
  if (bounds === null) return date;
  if (date < bounds.start) return bounds.start;
  if (date > bounds.end) return bounds.end;
  return date;
}

export function resolveAgendaState(
  searchParams: AgendaSearchParams,
  today: string,
  bounds: AgendaBounds | null = null,
): AgendaUrlState {
  const rawView = first(searchParams.vue);
  const view = AGENDA_VIEWS.includes(rawView as AgendaView) ? (rawView as AgendaView) : 'semaine';

  const rawDate = first(searchParams.date);
  const parsed = rawDate !== undefined && parseCivilDay(rawDate) !== null ? rawDate : null;
  const date =
    parsed === null
      ? today
      : // The date stays a civil day even when the formations do not cover it yet: the navigation
        // clamps it so a manual URL never hides the agenda (CL-6).
        clampCivilDay(parsed, bounds);

  const rawFormation = first(searchParams.formation);
  const formation = rawFormation === undefined || rawFormation === '' ? 'all' : rawFormation;

  const rawCreneau = first(searchParams.creneau);
  const creneau = rawCreneau === undefined || rawCreneau === '' ? null : rawCreneau;

  return { view, date, formation, creneau };
}

/** `/agenda?vue=…&date=…&formation=…[&creneau=…]`, the canonical URL of a state (EF-1). */
export function agendaUrl(state: AgendaUrlState): string {
  const params = new URLSearchParams({
    vue: state.view,
    date: state.date,
    formation: state.formation,
  });
  if (state.creneau !== null) params.set('creneau', state.creneau);
  return `/agenda?${params.toString()}`;
}

/** Adds one civil day inside the bounds, or null when the day leaves them. */
export function shiftCivilDay(
  date: string,
  days: number,
  bounds: AgendaBounds | null,
): string | null {
  const next = civilAdd(date, days);
  if (bounds !== null && (next < bounds.start || next > bounds.end)) return null;
  return next;
}
