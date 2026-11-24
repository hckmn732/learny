// Jest + RNTL [SPEC-3401] — racine Profil (EF-1, EF-2, EF-6, CA-1, CA-5).
//
// The screen reads seven routes; the client is injected so the test drives the demonstration values
// of SPEC-115 (Alex Perrin, 3 formations, 12 j, 86 %, 4 lacunes) without a device.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ProfileScreen } from '../../src/features/profil/ProfileScreen';

import {
  GAPS as mockGaps,
  HOME as mockHome,
  MODELS as mockModels,
  NOTIFICATIONS as mockNotifications,
  PAUSE as mockPauseIdle,
  PAUSE_ACTIVE as mockPauseRunning,
  SETTINGS as mockSettingsBase,
  STREAK as mockStreak,
  SUBSCRIPTION as mockSubscription,
} from './fixtures';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
const mockSignOut = jest.fn(() => Promise.resolve());
const mockMeDeletionCancel = jest.fn(() => Promise.resolve());

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '1.0.0', android: { versionCode: 482 } } },
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

let mockSettings = mockSettingsBase;
let mockPause = mockPauseIdle;

jest.mock('../../src/api/registry', () => ({
  requireApiClient: () => ({
    api: {
      meProfileGet: () => Promise.resolve(mockSettings),
      mePauseGet: () => Promise.resolve(mockPause),
      meDeletionCancel: mockMeDeletionCancel,
      notificationsUnreadCount: () => Promise.resolve({ count: 3 }),
      streakGet: () => Promise.resolve(mockStreak),
      homeGet: () => Promise.resolve(mockHome),
      gapsList: () => Promise.resolve(mockGaps),
      meAiModelsGet: () => Promise.resolve(mockModels),
      meNotificationSettingsGet: () => Promise.resolve(mockNotifications),
      billingSubscription: () => Promise.resolve(mockSubscription),
    },
  }),
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 24, left: 0, right: 0, bottom: 24 },
};

async function renderProfile(readyTestID = 'profile-identity'): Promise<void> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <ProfileScreen />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => {
    expect(screen.getByTestId(readyTestID)).toBeTruthy();
  });
}

describe('[SPEC-3401] racine Profil', () => {
  beforeEach(() => {
    mockSettings = mockSettingsBase;
    mockPause = mockPauseIdle;
    mockRouter.push.mockClear();
    mockSignOut.mockClear();
    mockMeDeletionCancel.mockClear();
  });

  it('affiche la carte d’identité de la maquette (EF-1, CA-1)', async () => {
    await renderProfile();
    expect(screen.getByTestId('profile-name')).toHaveTextContent('Alex Perrin');
    expect(screen.getByTestId('profile-role')).toHaveTextContent(
      /Apprenant · 3 formations en cours/u,
    );
    expect(screen.getByTestId('profile-member-since')).toHaveTextContent(
      /Membre depuis septembre/u,
    );
  });

  it('affiche les trois indicateurs de démonstration (EF-1, CA-1)', async () => {
    await renderProfile();
    await waitFor(() => {
      expect(screen.getByTestId('profile-stat-1')).toBeTruthy();
    });
    expect(screen.getByTestId('profile-stat-1')).toHaveTextContent(/12/u);
    expect(screen.getByTestId('profile-stat-2')).toHaveTextContent(/86/u);
    expect(screen.getByTestId('profile-stat-3')).toHaveTextContent(/4/u);
  });

  it('affiche les quatre groupes, la déconnexion et la version (EF-2, CA-1)', async () => {
    await renderProfile();
    expect(screen.getByText('Compte')).toBeTruthy();
    expect(screen.getByText('Apprentissage')).toBeTruthy();
    // « Abonnement » apparaît deux fois : l'en-tête de groupe et la ligne (EF-2).
    expect(screen.getAllByText('Abonnement').length).toBeGreaterThan(0);
    expect(screen.getByText('Aide et confidentialité')).toBeTruthy();
    for (const row of [
      'identity',
      'notifications',
      'security',
      'rhythm',
      'models',
      'subscription',
      'help',
      'terms',
      'privacy',
      'data',
    ]) {
      expect(screen.getByTestId(`profile-row-${row}`)).toBeTruthy();
    }
    expect(screen.getByTestId('profile-sign-out')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByTestId('profile-version')).toHaveTextContent(/Learny 1.0.0 · build 482/u);
    });
  });

  it('résume le rythme et le statut d’abonnement (BR-ACC-08, BR-SET-06)', async () => {
    await renderProfile();
    expect(screen.getByTestId('profile-row-rhythm')).toHaveTextContent(/25 h par semaine · soir/u);
    await waitFor(() => {
      expect(screen.getByTestId('profile-row-subscription')).toHaveTextContent(/Actif/u);
    });
  });

  it('ouvre chaque écran empilé de la pile Profil (EF-3)', async () => {
    await renderProfile();
    const routes: readonly (readonly [string, string])[] = [
      ['profile-row-identity', '/profil/identite'],
      ['profile-row-notifications', '/profil/notifications'],
      ['profile-row-security', '/profil/securite'],
      ['profile-row-rhythm', '/profil/rythme'],
      ['profile-row-models', '/profil/modeles'],
      ['profile-row-subscription', '/profil/abonnement'],
      ['profile-row-data', '/profil/confidentialite'],
    ];
    for (const [testID] of routes) {
      await fireEvent.press(screen.getByTestId(testID));
    }
    const pushed = mockRouter.push.mock.calls as unknown as [string][];
    expect(pushed.map((entry) => entry[0])).toEqual(routes.map(([, route]) => route));
  });

  it('affiche le bandeau de pause et reprend la formation (BR-AUT-10, CA-4)', async () => {
    mockPause = mockPauseRunning;
    await renderProfile();
    await waitFor(() => {
      expect(screen.getByTestId('profile-pause-banner')).toBeTruthy();
    });
    expect(screen.getByTestId('profile-pause-banner')).toHaveTextContent(/En pause jusqu’au/u);
    expect(screen.getByTestId('profile-pause-banner')).toHaveTextContent(/Reprendre maintenant/u);
  });

  it('affiche le bandeau de suppression programmée et l’annule (EF-6, BR-ACC-11)', async () => {
    mockSettings = { ...mockSettingsBase, deletionScheduledFor: '2026-12-11T12:20:00.000Z' };
    await renderProfile();
    await waitFor(() => {
      expect(screen.getByTestId('profile-deletion-banner')).toBeTruthy();
    });
    expect(screen.getByTestId('profile-deletion-banner')).toHaveTextContent(
      /Suppression prévue le/u,
    );
    await fireEvent.press(screen.getByText('Annuler la suppression'));
    expect(mockMeDeletionCancel).toHaveBeenCalledTimes(1);
  });

  it('ne propose aucun achat ni portail d’abonnement (CA-5)', async () => {
    await renderProfile();
    expect(screen.queryByText(/acheter/i)).toBeNull();
    expect(screen.queryByText(/gérer l’abonnement/i)).toBeNull();
    expect(screen.queryByText(/abonnement, gérer/i)).toBeNull();
  });

  it('demande confirmation avant de se déconnecter (BR-ACC-09)', async () => {
    const { Alert } = jest.requireActual<typeof import('react-native')>('react-native');
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await renderProfile();
    await fireEvent.press(screen.getByTestId('profile-sign-out'));
    expect(alert).toHaveBeenCalledTimes(1);
    const buttons = alert.mock.calls[0]?.[2] ?? [];
    (buttons[1]?.onPress as (() => void) | undefined)?.();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    alert.mockRestore();
  });

  it('n’affiche aucun bandeau quand rien n’est programmé (EF-6)', async () => {
    await renderProfile();
    expect(screen.queryByTestId('profile-pause-banner')).toBeNull();
    expect(screen.queryByTestId('profile-deletion-banner')).toBeNull();
  });
});
