// /aujourdhui/examen-blanc/:activityId — Examen blanc (maquette ExamenBlanc.dc.html).
// TODO(quickfix/C) : remplacer la coquille par l'écran de design/app-mobile-rattrapage/ecrans/ExamenBlanc.dc.html.
import { useLocalSearchParams } from 'expo-router';

import { fr } from '@learny/i18n';

import { QuickfixPlaceholder } from '../../../../src/features/mr/QuickfixPlaceholder';

export default function ExamenBlancRoute() {
  const { activityId } = useLocalSearchParams<{ activityId: string }>();
  return (
    <QuickfixPlaceholder
      screen={fr.mr.evaluation.examenBlanc.title}
      testID="qf-examen-blanc"
      note={activityId === undefined ? undefined : `Activité ${activityId}`}
    />
  );
}
