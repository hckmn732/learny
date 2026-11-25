// /programme/carte/:fid — Carte des notions, grille et mode « cerveau » (maquettes Carte.dc.html et
// CarteCerveau.dc.html ; `?mode=cerveau` ouvre le réseau interactif).
//
// Le corps de l'écran vit dans `src/features/mr/exploration/CarteScreen` : cette route ne porte que
// la lecture des paramètres et le retour de la pile.
import { useLocalSearchParams, useRouter } from 'expo-router';

import { CarteScreen } from '../../../../src/features/mr/exploration/CarteScreen';

export default function CarteRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ fid?: string; mode?: string }>();
  const formationId = typeof params.fid === 'string' ? params.fid : null;

  return (
    <CarteScreen
      formationId={formationId}
      initialMode={params.mode === 'cerveau' ? 'cerveau' : 'grille'}
      onBack={() => {
        if (router.canGoBack()) router.back();
        else router.replace('/programme');
      }}
    />
  );
}