// /programme/apports/:moduleId — Apports et import du programme (maquette Apports.dc.html).
// TODO(quickfix/A) : remplacer la coquille par l'écran de design/app-mobile-rattrapage/ecrans/Apports.dc.html.
import { useLocalSearchParams } from 'expo-router';

import { fr } from '@learny/i18n';

import { QuickfixPlaceholder } from '../../../../src/features/mr/QuickfixPlaceholder';

export default function ApportsRoute() {
  const { moduleId } = useLocalSearchParams<{ moduleId: string }>();
  return (
    <QuickfixPlaceholder
      screen={fr.mr.programme.apports.title}
      testID="qf-apports"
      note={moduleId === undefined ? undefined : `Module ${moduleId}`}
    />
  );
}
