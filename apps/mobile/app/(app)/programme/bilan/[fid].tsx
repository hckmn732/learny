// /programme/bilan/:fid — Bilan final et entretien de mémoire (maquette Bilan.dc.html).
// TODO(quickfix/A) : remplacer la coquille par l'écran de design/app-mobile-rattrapage/ecrans/Bilan.dc.html.
import { useLocalSearchParams } from 'expo-router';

import { fr } from '@learny/i18n';

import { QuickfixPlaceholder } from '../../../../src/features/mr/QuickfixPlaceholder';

export default function BilanRoute() {
  const { fid } = useLocalSearchParams<{ fid: string }>();
  return (
    <QuickfixPlaceholder
      screen={fr.mr.programme.bilan.title}
      testID="qf-bilan"
      note={fid === undefined ? undefined : `Formation ${fid}`}
    />
  );
}
