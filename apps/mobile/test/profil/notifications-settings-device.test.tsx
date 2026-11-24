// Jest + RNTL [SPEC-3501] — interrupteur du canal appareil et appel à l'action de permission
// (EF-1, CL-1 ; BR-SET-03 ; CA-1).
//
// Le canal appareil est simulé par le hook : ce test vérifie ce que l'écran affiche et ce qu'il
// demande — l'état de l'interrupteur, le libellé selon la permission et l'ouverture des réglages
// système — jamais le module natif.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { NotificationsScreen } from '../../src/features/profil/NotificationsScreen';
import type { DeviceChannelState } from '../../src/notifications/register';

import { NOTIFICATIONS as mockNotifications } from './fixtures';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };

/** The view the mocked hook returns; `mock`-prefixed so the hoisted factory may close over it. */
const mockDeviceView = {
  state: 'off' as DeviceChannelState,
  pending: false,
  failed: false,
  toggle: jest.fn((value: boolean) => Promise.resolve(value)),
  openSettings: jest.fn(),
};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
}));

jest.mock('../../src/api/registry', () => ({
  requireApiClient: () => ({
    api: {
      meNotificationSettingsGet: () => Promise.resolve(mockNotifications),
      meNotificationSettingsUpdate: () => Promise.resolve(mockNotifications),
    },
  }),
}));

jest.mock('../../src/notifications/use-device-channel', () => ({
  useDeviceChannel: () => mockDeviceView,
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 24, left: 0, right: 0, bottom: 24 },
};

async function renderNotifications(): Promise<void> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <NotificationsScreen />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => {
    expect(screen.getByTestId('notifications-device-switch')).toBeTruthy();
  });
}

describe('[SPEC-3501] canal appareil de l’écran Notifications', () => {
  beforeEach(() => {
    mockDeviceView.state = 'off';
    mockDeviceView.pending = false;
    mockDeviceView.failed = false;
    mockDeviceView.toggle.mockClear();
    mockDeviceView.openSettings.mockClear();
  });

  it('affiche l’interrupteur du canal appareil, éteint sans abonnement (BR-SET-03)', async () => {
    await renderNotifications();

    expect(
      screen.getByTestId('notifications-device-switch-control').props.accessibilityState,
    ).toMatchObject({ checked: false });
    expect(screen.getByTestId('notifications-device-switch')).toBeTruthy();
    expect(screen.queryByTestId('notifications-permission-cta')).toBeNull();
  });

  it('active le canal appareil en demandant la permission au moment utile (CA-1)', async () => {
    await renderNotifications();

    await fireEvent(
      screen.getByTestId('notifications-device-switch-control'),
      'valueChange',
      true,
    );

    expect(mockDeviceView.toggle).toHaveBeenCalledWith(true);
  });

  it('reflète l’état activé quand l’appareil est abonné (CA-1)', async () => {
    mockDeviceView.state = 'on';
    await renderNotifications();

    expect(
      screen.getByTestId('notifications-device-switch-control').props.accessibilityState,
    ).toMatchObject({ checked: true });
  });

  it('propose « Autoriser dans les réglages » quand la permission est refusée (CL-1)', async () => {
    mockDeviceView.state = 'denied';
    await renderNotifications();

    expect(screen.getByTestId('notifications-permission-hint')).toBeTruthy();
    const cta = screen.getByTestId('notifications-permission-cta');
    await fireEvent.press(cta);

    expect(mockDeviceView.openSettings).toHaveBeenCalledTimes(1);
  });

  it('désactive l’interrupteur pendant l’enregistrement et signale un échec (EF-1)', async () => {
    mockDeviceView.pending = true;
    mockDeviceView.failed = true;
    await renderNotifications();

    expect(
      screen.getByTestId('notifications-device-switch-control').props.accessibilityState,
    ).toMatchObject({ disabled: true });
    expect(screen.getByTestId('notifications-device-error')).toBeTruthy();
  });
});
