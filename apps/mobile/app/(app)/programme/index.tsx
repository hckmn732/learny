// Programme (SPEC-3102 EF-2; the real screen arrives with SPEC-3202).
import { fr } from '@learny/i18n';

import { PlaceholderTabScreen } from '../../../src/features/shell/PlaceholderTabScreen';

export default function ProgrammeRoute() {
  return (
    <PlaceholderTabScreen
      title={fr.mobile.shell.tabs.programme}
      icon="layers"
      testID="programme-screen"
    />
  );
}
