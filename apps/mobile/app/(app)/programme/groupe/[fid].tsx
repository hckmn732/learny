// /programme/groupe/:fid — Formations à plusieurs (maquette Groupe.dc.html).
// TODO(quickfix/A) : remplacer la coquille par l'écran de design/app-mobile-rattrapage/ecrans/Groupe.dc.html.
import { useLocalSearchParams } from 'expo-router';

import { fr } from '@learny/i18n';

import { QuickfixPlaceholder } from '../../../../src/features/mr/QuickfixPlaceholder';

export default function GroupeRoute() {
  const { fid } = useLocalSearchParams<{ fid: string }>();
  return (
    <QuickfixPlaceholder
      screen={fr.mr.programme.groupe.title}
      testID="qf-groupe"
      note={fid === undefined ? undefined : `Formation ${fid}`}
    />
  );
}
