// /exercice/:brickId — Exercice pratique plein écran (maquette Exercice.dc.html).
// TODO(quickfix/C) : remplacer la coquille par l'écran de design/app-mobile-rattrapage/ecrans/Exercice.dc.html.
import { useLocalSearchParams } from 'expo-router';

import { fr } from '@learny/i18n';

import { QuickfixPlaceholder } from '../../src/features/mr/QuickfixPlaceholder';

export default function ExerciceRoute() {
  const { brickId } = useLocalSearchParams<{ brickId: string }>();
  return (
    <QuickfixPlaceholder
      screen={fr.mr.evaluation.exercice.title}
      testID="qf-exercice"
      note={brickId === undefined ? undefined : `Brique ${brickId}`}
    />
  );
}
