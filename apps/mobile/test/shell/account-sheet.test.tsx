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
      // SPEC-3401 — la feuille de pause lit la pause courante et la zone du profil.
      mePauseGet: () =>
        Promise.resolve({
          status: 'none',
          startsOn: null,
          endsOn: null,
          diagnosticOnReturn: true,
          endedAt: null,
          pausedFormationIds: [],
          returnDue: false,
          diagnostic: null,
        }),
      meProfileGet: () =>
        Promise.resolve({
          me: {
            id: 'user-1',
            email: 'alex.perrin@exemple.fr',
            firstName: 'Alex',
            lastName: 'Perrin',
            tutorTone: 'vous',
            courseLanguage: 'fr',
            timezone: 'Europe/Paris',
            onboardingStep: 'done',
            onboardingCompletedAt: '2026-10-28T08:05:00.000Z',
            currentFormationId: null,
          },
          rhythm: { hoursPerDay: 5, studyDays: [1, 2, 3, 4, 5], preferredSlots: ['soir'] },
          updatedAt: '2026-11-11T12:20:00.000Z',
          createdAt: '2026-09-21T08:05:00.000Z',
          activeFormationCount: 3,
          deletionScheduledFor: null,
          export: null,
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

  // SPEC-3401 EF-5 : la ligne de pause ouvre désormais la feuille des dates de reprise ; le
  // comportement provisoire de SPEC-3102 (annonce « à venir ») est remplacé.
  it('ouvre la feuille de pause de SPEC-3401 (EF-5, BR-AUT-10)', async () => {
    await renderSheet();
    await fireEvent.press(screen.getByTestId('account-pause'));
    await waitFor(() => {
      expect(screen.getByTestId('pause-sheet')).toBeTruthy();
    });
    expect(screen.getByTestId('pause-date')).toBeTruthy();
    expect(screen.getByTestId('pause-confirm')).toBeTruthy();
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
