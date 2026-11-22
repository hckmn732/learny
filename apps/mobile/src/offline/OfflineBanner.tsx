// Offline band of the application (SPEC-3003 EF-5; mounted by the shell of SPEC-3102).
//
// Label `mobile.offline.banner` from `@learny/i18n` (« Hors ligne · affichage des données
// enregistrées »). It is a band, never a dialog: the screen keeps showing the cached data.
import type { ReactElement } from 'react';

import { fr } from '@learny/i18n';

import { Banner } from '../ui/Banner';

import { useOnlineStatus } from './network';

export interface OfflineBannerProps {
  readonly testID?: string;
}

/** Renders the band only when the connection is lost (EF-5). */
export function OfflineBanner({ testID = 'offline-banner' }: OfflineBannerProps): ReactElement | null {
  const online = useOnlineStatus();
  if (online) return null;
  return <Banner tone="offline" title={fr.mobile.offline.banner} testID={testID} />;
}
