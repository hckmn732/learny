// Component tests of the offline band (SPEC-3003 EF-5, CA-4).
//
// The band reads `onlineManager` of TanStack Query — the same singleton `NetInfo` feeds in the
// application (`src/offline/network-wiring.ts`): the test flips that state instead of the radio.
import { onlineManager } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react-native';

import { isOffline, setOnlineForDemo } from '../../src/offline/network';
import { OfflineBanner } from '../../src/offline/OfflineBanner';

const BANNER_LABEL = 'Hors ligne · affichage des données enregistrées';

afterEach(async () => {
  await act(() => {
    setOnlineForDemo(true);
  });
});

describe('[SPEC-3003] bandeau hors ligne (EF-5, CA-4)', () => {
  it('reste absent quand le réseau est disponible', async () => {
    await act(() => {
      setOnlineForDemo(true);
    });
    await render(<OfflineBanner />);

    expect(screen.queryByTestId('offline-banner')).toBeNull();
  });

  it('affiche le libellé `mobile.offline.banner` dès que le réseau tombe (CA-4)', async () => {
    await act(() => {
      setOnlineForDemo(false);
    });
    await render(<OfflineBanner />);

    const banner = screen.getByTestId('offline-banner');
    expect(banner).toHaveTextContent(BANNER_LABEL);
    // A band, never a dialog: it is announced politely and does not block the screen (BR-PLA-03).
    expect(banner.props.accessibilityRole).toBe('alert');
  });

  it('disparaît au retour du réseau', async () => {
    await act(() => {
      setOnlineForDemo(false);
    });
    await render(<OfflineBanner />);
    expect(screen.getByTestId('offline-banner')).toBeTruthy();

    await act(() => {
      setOnlineForDemo(true);
    });

    expect(screen.queryByTestId('offline-banner')).toBeNull();
    expect(onlineManager.isOnline()).toBe(true);
  });

  it('expose l’état hors ligne sous forme testable (EF-5)', () => {
    expect(isOffline(false)).toBe(true);
    expect(isOffline(true)).toBe(false);
  });
});
