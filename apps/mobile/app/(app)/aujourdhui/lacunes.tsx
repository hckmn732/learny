// /aujourdhui/lacunes — Mes lacunes (maquette Lacunes.dc.html).
// TODO(quickfix/D) : remplacer la coquille par l'écran de design/app-mobile-rattrapage/ecrans/Lacunes.dc.html.
import { fr } from '@learny/i18n';

import { QuickfixPlaceholder } from '../../../src/features/mr/QuickfixPlaceholder';

export default function LacunesRoute() {
  return <QuickfixPlaceholder screen={fr.mr.exploration.lacunes.title} testID="qf-lacunes" />;
}
