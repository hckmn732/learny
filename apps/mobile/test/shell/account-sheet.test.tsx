// Jest + RNTL [SPEC-3102] — feuille « Mon compte » (EF-4, BR-NAV-01, CA-4).
//
// The sheet reads the identity from `/me/header` and the session from the provider: both are
// injected here, so the test drives the confirmation of the sign-out without a device.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AccountSheet } from '../../src/features/shell/AccountSheet';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
const mockSignOut = jest.fn(() => Promise.resolve());

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
}));

jest.mock('../../src/auth/session', () => ({
  useSession: () => ({
    status: 'signedIn',
    userId: 'user-1',
    accessToken: () => 'token',
    signIn: jest.fn(),
    signOut: mockSignOut,
    expiredNotice: null,
    error: null,
    busy: false,
  }),
}));

jest.mock('../../src/api/registry', () => ({
  requireApiClient: () => ({
    api: {
      headerGet: () =>
        Promise.resolve({
          firstName: 'Alex',
          lastName: 'Perrin',
          emailLabel: 'alex.perrin@exemple.fr',
          activeFormationCount: 3,
          unreadNotificationCount: 3,
        }),
    },
  }),
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 24, left: 0, right: 0, bottom: 24 },
};

async function renderSheet(onClose: jest.Mock = jest.fn()): Promise<void> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <AccountSheet onClose={onClose} />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => {
    expect(screen.getByTestId('account-name')).toHaveTextContent('Alex Perrin');
  });
}

describe('[SPEC-3102] feuille compte', () => {
  it('affiche le prénom, le nom et les formations en cours (CA-4)', async () => {
    await renderSheet();
    expect(screen.getByTestId('account-sheet-title')).toHaveTextContent('Mon compte');
    expect(screen.getByTestId('account-sheet-subtitle')).toHaveTextContent(
      'Apprenant · 3 formations en cours',
    );
    expect(screen.getByTestId('account-email')).toHaveTextContent('alex.perrin@exemple.fr');
  });

  it('propose les paramètres, la pause et la déconnexion (BR-NAV-01)', async () => {
    await renderSheet();
    expect(screen.getByTestId('account-settings')).toBeTruthy();
    expect(screen.getByText('Paramètres')).toBeTruthy();
    expect(screen.getByTestId('account-pause')).toBeTruthy();
    expect(screen.getByText('Mettre en pause')).toBeTruthy();
    expect(screen.getByTestId('account-sign-out')).toBeTruthy();
    expect(screen.getByText('Se déconnecter')).toBeTruthy();
  });

  it('ouvre l’onglet Profil par les paramètres et ferme la feuille (BR-NAV-01)', async () => {
    const onClose = jest.fn();
    await renderSheet(onClose);
    await fireEvent.press(screen.getByTestId('account-settings'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).toHaveBeenCalledWith('/profil');
  });

  it('explique que la pause arrive avec SPEC-3401', async () => {
    await renderSheet();
    await fireEvent.press(screen.getByTestId('account-pause'));
    await waitFor(() => {
      expect(screen.getByTestId('account-pause-toast')).toBeTruthy();
    });
  });

  it('demande confirmation avant de déconnecter (CA-4)', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const onClose = jest.fn();
    await renderSheet(onClose);

    await fireEvent.press(screen.getByTestId('account-sign-out'));
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0]?.[0]).toBe('Se déconnecter ?');

    const buttons = alert.mock.calls[0]?.[2] ?? [];
    expect(buttons.map((button) => button.text)).toEqual(['Annuler', 'Se déconnecter']);

    await buttons[1]?.onPress?.();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    alert.mockRestore();
  });

  it('ne déconnecte rien quand la confirmation est annulée (CA-4)', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await renderSheet();
    mockSignOut.mockClear();

    await fireEvent.press(screen.getByTestId('account-sign-out'));
    const buttons = alert.mock.calls[0]?.[2] ?? [];
    await buttons[0]?.onPress?.();
    expect(mockSignOut).not.toHaveBeenCalled();
    alert.mockRestore();
  });
});
