// Agenda (SPEC-3203 EF-1 to EF-9): the screen lives in `src/features/agenda` so that its periods,
// its statuses and its sheets are tested without the router.
import { AgendaScreen } from '../../../src/features/agenda/AgendaScreen';

export default function AgendaRoute() {
  return <AgendaScreen />;
}
