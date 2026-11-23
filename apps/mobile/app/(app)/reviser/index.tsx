// Réviser (SPEC-3102 EF-2; the real screen arrives with SPEC-3203).
import { fr } from '@learny/i18n';

import { PlaceholderTabScreen } from '../../../src/features/shell/PlaceholderTabScreen';

export default function ReviserRoute() {
  return (
    <PlaceholderTabScreen
      title={fr.mobile.shell.tabs.revise}
      icon="cards"
      testID="reviser-screen"
    />
  );
}
