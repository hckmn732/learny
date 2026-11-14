// Civil window fetched from the API for a view and a date (SPEC-704 ET-8). Shared by the server
// preload and the client screen: the week reads Monday–Sunday (the weekend columns are decided
// from the study days and the slots), the day reads one day, the month the whole month.
import { civilAdd, monthFirstDay, monthLastDay, weekMonday } from './dates';
import type { AgendaView } from './state';

export function agendaFetchWindow(view: AgendaView, date: string): { from: string; to: string } {
  if (view === 'jour') return { from: date, to: date };
  if (view === 'mois') return { from: monthFirstDay(date), to: monthLastDay(date) };
  const monday = weekMonday(date);
  return { from: monday, to: civilAdd(monday, 6) };
}
