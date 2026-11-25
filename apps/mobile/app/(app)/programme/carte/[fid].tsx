// /programme/carte/:fid — Carte des notions, grille et mode « cerveau » (maquettes Carte.dc.html et
// CarteCerveau.dc.html ; `?mode=cerveau` ouvre le réseau interactif).
// TODO(quickfix/D) : remplacer la coquille par les deux modes de design/app-mobile-rattrapage/ecrans/Carte*.dc.html.
import { useLocalSearchParams } from 'expo-router';

import { fr } from '@learny/i18n';

import { QuickfixPlaceholder } from '../../../../src/features/mr/QuickfixPlaceholder';

export default function CarteRoute() {
  const { fid, mode } = useLocalSearchParams<{ fid: string; mode?: string }>();
  const screen =
    mode === 'cerveau'
      ? `${fr.mr.exploration.carte.title} — ${fr.mr.exploration.carte.cerveau}`
      : fr.mr.exploration.carte.title;
  return (
    <QuickfixPlaceholder
      screen={screen}
      testID="qf-carte"
      note={fid === undefined ? undefined : `Formation ${fid}`}
    />
  );
}
