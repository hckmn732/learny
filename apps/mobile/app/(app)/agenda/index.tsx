// Agenda (SPEC-3102 EF-2; the real screen arrives with SPEC-3305).
import { fr } from '@learny/i18n';

import { PlaceholderTabScreen } from '../../../src/features/shell/PlaceholderTabScreen';

export default function AgendaRoute() {
  return (
    <PlaceholderTabScreen
      title={fr.mobile.shell.tabs.agenda}
      icon="calendar"
      testID="agenda-screen"
    />
  );
}
