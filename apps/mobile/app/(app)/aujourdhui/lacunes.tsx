// /aujourdhui/lacunes — Mes lacunes (maquette Lacunes.dc.html).
//
// Le corps de l'écran vit dans `src/features/mr/exploration/LacunesScreen` : cette route ne porte
// que la navigation de la pile (retour vers l'onglet Aujourd'hui).
import { useRouter } from 'expo-router';

import { LacunesScreen } from '../../../src/features/mr/exploration/LacunesScreen';

export default function LacunesRoute() {
  const router = useRouter();
  return (
    <LacunesScreen
      onBack={() => {
        if (router.canGoBack()) router.back();
        else router.replace('/aujourdhui');
      }}
    />
  );
}