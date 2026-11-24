// Jest + RNTL [SPEC-3401] — écran Notifications (EF-3 ; BR-SET-03, CA-3).
//
// The counter « N sur 6 activés » follows the switches, the application channel is locked, the
// browser channel is absent before SPEC-3501, and the save sends the partial patch with the version
// the screen read.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { NotificationsScreen } from '../../src/features/profil/NotificationsScreen';

import { NOTIFICATIONS as mockNotifications } from './fixtures';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
const mockUpdate = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
}));

jest.mock('../../src/api/registry', () => ({
  requireApiClient: () => ({
    api: {
      meNotificationSettingsGet: () => Promise.resolve(mockNotifications),
      meNotificationSettingsUpdate: mockUpdate,
    },
  }),
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 24, left: 0, right: 0, bottom: 24 },
};

/** Premier argument d'une mutation espionnée, sans `any` : `jest.Mock` l'expose. */
function firstCall(mock: jest.Mock): Record<string, unknown> {
  const calls = mock.mock.calls as unknown as [Record<string, unknown>][];
  const argument = calls[0]?.[0];
  if (argument === undefined) throw new Error('mutation non appelée');
  return argument;
}

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
    expect(screen.getByTestId('notifications-type-count')).toBeTruthy();
  });
}

describe('[SPEC-3401] écran Notifications', () => {
  beforeEach(() => {
    mockUpdate.mockReset();
    mockUpdate.mockImplementation(() => Promise.resolve(mockNotifications));
  });

  it('affiche les six types et le compteur « 6 sur 6 activés » (BR-SET-03, CA-3)', async () => {
    await renderNotifications();
    expect(screen.getByTestId('notifications-type-count')).toHaveTextContent(/6 sur 6 activés/u);
    for (const type of ['revision', 'validation', 'course', 'gap', 'planning', 'relaunch']) {
      expect(screen.getByTestId(`notifications-type-${type}`)).toBeTruthy();
    }
  });

  it('verrouille le canal application et n’affiche pas le canal navigateur (BR-SET-03)', async () => {
    await renderNotifications();
    expect(
      screen.getByTestId('notifications-channel-app-control').props.accessibilityState,
    ).toMatchObject({ disabled: true });
    expect(screen.queryByTestId('notifications-channel-browser')).toBeNull();
    expect(screen.getByTestId('notifications-channel-email')).toBeTruthy();
  });

  it('décrémente le compteur quand un type est coupé (BR-SET-03)', async () => {
    await renderNotifications();
    await fireEvent(screen.getByTestId('notifications-type-gap-control'), 'valueChange', false);
    await waitFor(() => {
      expect(screen.getByTestId('notifications-type-count')).toHaveTextContent(/5 sur 6 activés/u);
    });
    expect(screen.getByTestId('settings-save')).toBeEnabled();
  });

  it('enregistre le patch partiel des notifications avec la version attendue (CA-3)', async () => {
    await renderNotifications();
    await fireEvent(
      screen.getByTestId('notifications-type-validation-control'),
      'valueChange',
      false,
    );
    await fireEvent.press(screen.getByTestId('notifications-digest-09:00'));
    await fireEvent.press(screen.getByTestId('settings-save'));
    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledTimes(1);
    });
    const call = firstCall(mockUpdate);
    expect(call.body).toMatchObject({
      digestTime: '09:00',
      expectedUpdatedAt: mockNotifications.updatedAt,
      channels: { email: true },
      types: { validation: false, revision: true },
    });
  });

  it('affiche la plage effective des heures calmes (BR-SET-03)', async () => {
    await renderNotifications();
    expect(screen.getByTestId('notifications-quiet-range')).toHaveTextContent(
      /Plage effective : 21:00–08:00 \(le lendemain\)\./u,
    );
  });

  it('désactive l’enregistrement tant que rien n’a changé (EF-3)', async () => {
    await renderNotifications();
    expect(screen.getByTestId('settings-save')).toBeDisabled();
  });
});
