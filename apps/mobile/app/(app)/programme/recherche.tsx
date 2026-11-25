// /programme/recherche — Recherche globale (maquette Recherche.dc.html).
//
// Le corps de l'écran vit dans `src/features/mr/exploration/RechercheScreen` : cette route ne porte
// que la navigation de la pile (retour vers l'onglet Programme).
import { useRouter } from 'expo-router';

import { RechercheScreen } from '../../../src/features/mr/exploration/RechercheScreen';

export default function RechercheRoute() {
  const router = useRouter();
  return (
    <RechercheScreen
      onBack={() => {
        if (router.canGoBack()) router.back();
        else router.replace('/programme');
      }}
    />
  );
}