// Profil (SPEC-3102 EF-2; the real screen arrives with SPEC-3401).
import { fr } from '@learny/i18n';

import { PlaceholderTabScreen } from '../../../src/features/shell/PlaceholderTabScreen';

export default function ProfilRoute() {
  return (
    <PlaceholderTabScreen title={fr.mobile.shell.tabs.profile} icon="user" testID="profil-screen" />
  );
}
