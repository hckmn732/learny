// /premiers-pas/:step — Premiers pas natifs, étapes de configuration (maquette PremiersPas.dc.html).
// Remplace à terme « Terminez votre configuration sur le web » ; le recâblage du garde d'onboarding
// appartient au lead (ce fichier ne touche ni `terminer-sur-le-web` ni `OnboardingGate`).
import { PremiersPasScreen } from '../../src/features/mr/creation/PremiersPasScreen';

export default function PremiersPasRoute() {
  return <PremiersPasScreen />;
}