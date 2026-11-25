// /premiers-pas/:step — Premiers pas natifs, étapes de configuration (maquette PremiersPas.dc.html).
// Remplace progressivement « Terminez votre configuration sur le web » (terminer-sur-le-web.tsx).
// TODO(quickfix/B) : remplacer la coquille par l'écran de design/app-mobile-rattrapage/ecrans/PremiersPas.dc.html.
import { useLocalSearchParams } from 'expo-router';

import { fr } from '@learny/i18n';

import { QuickfixPlaceholder } from '../../src/features/mr/QuickfixPlaceholder';

export default function PremiersPasRoute() {
  const { step } = useLocalSearchParams<{ step: string }>();
  return (
    <QuickfixPlaceholder
      screen={fr.mr.creation.premiersPas.title}
      testID="qf-premiers-pas"
      note={step === undefined ? undefined : `Étape ${step} sur 5`}
    />
  );
}
