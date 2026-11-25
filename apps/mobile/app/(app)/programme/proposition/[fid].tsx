// /programme/proposition/:fid — Programme proposé, ajustement et validation (maquette Proposition.dc.html).
// TODO(quickfix/B) : remplacer la coquille par l'écran de design/app-mobile-rattrapage/ecrans/Proposition.dc.html.
import { useLocalSearchParams } from 'expo-router';

import { fr } from '@learny/i18n';

import { QuickfixPlaceholder } from '../../../../src/features/mr/QuickfixPlaceholder';

export default function PropositionRoute() {
  const { fid } = useLocalSearchParams<{ fid: string }>();
  return (
    <QuickfixPlaceholder
      screen={fr.mr.creation.proposition.title}
      testID="qf-proposition"
      note={fid === undefined ? undefined : `Formation ${fid}`}
    />
  );
}
