// Jest + RNTL [SPEC-3102] — en-tête, bandeau hors ligne et états communs (EF-6, BR-NAV-01, CA-5).
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppErrorScreen } from '../../src/features/shell/AppErrorScreen';
import { AppHeader } from '../../src/features/shell/AppHeader';
import { OfflineBanner } from '../../src/offline/OfflineBanner';
import { ErrorState } from '../../src/ui/ErrorState';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
}));

let mockUnread = 3;

jest.mock('../../src/api/registry', () => ({
  requireApiClient: () => ({
    api: {
      headerGet: () =>
        Promise.resolve({
          firstName: 'Alex',
          lastName: 'Perrin',
          emailLabel: 'alex.perrin@exemple.fr',
          activeFormationCount: 3,
          unreadNotificationCount: mockUnread,
        }),
      notificationsUnreadCount: () => Promise.resolve({ count: mockUnread }),
    },
  }),
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 24, left: 0, right: 0, bottom: 24 },
};

async function renderHeader(): Promise<Awaited<ReturnType<typeof render>>> {
  // No garbage-collection timer: a query cache that outlives the test keeps Jest alive.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const view = await render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <AppHeader title="Aujourd’hui" actions testID="today-header" />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
  // The identity arrives with `/me/header`: the initials prove the header is ready.
  await waitFor(() => {
    expect(view.getByText('AP')).toBeTruthy();
  });
  return view;
}

describe('[SPEC-3102] états communs de la coquille', () => {
  afterEach(() => {
    jest.clearAllMocks();
    onlineManager.setOnline(true);
  });

  it('affiche la cloche, la pastille des non lues et les initiales (BR-NAV-01)', async () => {
    mockUnread = 3;
    const view = await renderHeader();
    expect(view.getByTestId('today-header-title')).toHaveTextContent('Aujourd’hui');
    expect(view.getByTestId('header-bell').props.accessibilityLabel).toBe(
      'Notifications, 3 non lues',
    );
    expect(view.getByTestId('header-unread-badge')).toHaveTextContent('3');
    expect(view.getByTestId('header-unread-badge').props.accessibilityLabel).toBe(
      '3 notifications non lues',
    );
    expect(view.getByTestId('header-account')).toBeTruthy();
    expect(view.getByText('AP')).toBeTruthy();
  });

  it('plafonne la pastille à « 99+ » (CL-3)', async () => {
    mockUnread = 120;
    const view = await renderHeader();
    expect(view.getByTestId('header-unread-badge')).toHaveTextContent('99+');
  });

  it('ouvre le centre de notifications et la feuille compte (EF-3, EF-4)', async () => {
    mockUnread = 3;
    const view = await renderHeader();
    await fireEvent.press(view.getByTestId('header-bell'));
    expect(mockRouter.push).toHaveBeenCalledWith('/notifications');
    await fireEvent.press(view.getByTestId('header-account'));
    expect(mockRouter.push).toHaveBeenCalledWith('/compte');
  });

  it('propose « Réessayer » sur une erreur de chargement (EF-6)', async () => {
    const onRetry = jest.fn();
    const view = await render(<ErrorState testID="today-error" onRetry={onRetry} />);
    expect(view.getByTestId('today-error')).toBeTruthy();
    await fireEvent.press(view.getByTestId('today-error-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('affiche la frontière d’erreur globale avec « Relancer » (EF-6)', async () => {
    const retry = jest.fn();
    const view = await render(<AppErrorScreen error={new Error('boom')} retry={retry} />);
    expect(view.getByText('Une erreur inattendue est survenue')).toBeTruthy();
    await fireEvent.press(view.getByTestId('app-error-retry'));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

describe('[SPEC-3102] bandeau hors ligne', () => {
  afterEach(() => {
    onlineManager.setOnline(true);
  });

  it('affiche le bandeau quand le réseau est absent (EF-6, CA-5)', async () => {
    onlineManager.setOnline(false);
    const view = await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <OfflineBanner testID="shell-offline-banner" />
      </SafeAreaProvider>,
    );
    expect(view.getByTestId('shell-offline-banner')).toBeTruthy();
  });
});
