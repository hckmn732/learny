// Offline band of the application (SPEC-3003 EF-5; mounted by the shell of SPEC-3102).
//
// Label `mobile.offline.banner` from `@learny/i18n` (« Hors ligne · affichage des données
// enregistrées »). It is a band, never a dialog: the screen keeps showing the cached data.
//
// The band keeps its text nodes separate: wrapping it in an `accessible` container would merge the
// label into the container's accessibility label and hide it from the view hierarchy Maestro reads
// (the SPEC-3003 campaign asserts the label, the demonstration page exposes `sdd-network-state`
// for the machine-readable state).
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
