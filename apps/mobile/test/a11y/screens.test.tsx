// Jest + RNTL [SPEC-3502] — parcours d'accessibilité des écrans (EF-2, ET-2 ; CA-2).
//
// Chaque écran de l'application est rendu avec les données de démonstration, puis passé au même
// audit d'arbre (`test/utils/a11yAudit.ts`) : rôle annoncé, libellé des boutons d'icône, état, et
// cible tactile ≥ 48 dp (BR-PLA-02, BR-PLA-03). Le helper est partagé : aucun écran ne redéfinit
// ses propres règles, et une cible ajoutée plus tard est auditée sans modifier ce fichier.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react-native';
import type { RenderResult } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AgendaScreen } from '../../src/features/agenda/AgendaScreen';
import { TodayScreen } from '../../src/features/aujourdhui/TodayScreen';
import { CourseScreen } from '../../src/features/cours/CourseScreen';
import { AboutScreen } from '../../src/features/profil/AboutScreen';
import { IdentityScreen } from '../../src/features/profil/IdentityScreen';
import { ModelsScreen } from '../../src/features/profil/ModelsScreen';
import { RhythmScreen } from '../../src/features/profil/RhythmScreen';
import { SubscriptionScreen } from '../../src/features/profil/SubscriptionScreen';
import { NotificationsScreen } from '../../src/features/profil/NotificationsScreen';
import { PrivacyScreen } from '../../src/features/profil/PrivacyScreen';
import { ProfileScreen } from '../../src/features/profil/ProfileScreen';
import { SecurityScreen } from '../../src/features/profil/SecurityScreen';
import { ProgrammeScreen } from '../../src/features/programme/ProgrammeScreen';
import { auditScreen, MIN_TARGET } from '../utils/a11yAudit';

const noop = (): void => undefined;

jest.mock('expo-router', () => {
  const router = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
  return {
    useRouter: () => router,
    useLocalSearchParams: () => ({ courseId: 'c-1', moduleId: 'm-3' }),
    useFocusEffect: () => undefined,
    useNavigation: () => ({ setOptions: jest.fn() }),
    Link: ({ children }: { children: unknown }) => children,
  };
});

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      version: '1.0.0',
      runtimeVersion: 'runtime-3502',
      android: { versionCode: 482 },
      ios: { buildNumber: '482' },
    },
  },
}));

jest.mock('../../src/lib/web', () => ({ openOnWeb: () => Promise.resolve('https://learny.test') }));

jest.mock('../../src/offline/network', () => ({
  useOnlineStatus: () => true,
  isOnline: () => true,
  setOnlineForDemo: () => undefined,
  subscribeNetwork: () => () => undefined,
}));

jest.mock('../../src/api/registry', () => ({
  requireApiClient: () => ({ api: {} }),
  peekApiClient: () => null,
  setApiClient: () => undefined,
}));

jest.mock('../../src/auth/session', () => require('./demo').session);

jest.mock('../../src/data/home', () => require('./demo').home);
jest.mock('../../src/data/use-programme', () => require('./demo').programme);
jest.mock('../../src/data/use-agenda', () => require('./demo').agenda);
jest.mock('../../src/data/course', () => require('./demo').course);
jest.mock('../../src/data/profile', () => require('./demo').profile);
jest.mock('../../src/data/pause', () => require('./demo').pause);
jest.mock('../../src/data/subscription', () => require('./demo').subscription);
jest.mock('../../src/data/task-models', () => require('./demo').taskModels);
jest.mock('../../src/data/notification-settings', () => require('./demo').notificationSettings);
jest.mock('../../src/data/review', () => require('./demo').review);
jest.mock('../../src/data/warmup', () => require('./demo').warmup);

jest.mock('../../src/features/shell/use-shell', () => {
  const actual = jest.requireActual('../../src/features/shell/use-shell');
  return { ...actual, ...require('./demo').shell };
});

jest.mock('../../src/notifications/use-device-channel', () => ({
  useDeviceChannel: () => ({
    status: 'off',
    busy: false,
    canAskAgain: true,
    enable: noop,
    disable: noop,
    permission: 'undetermined',
  }),
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 24, left: 0, right: 0, bottom: 24 },
};

/** Rend un écran dans ses fournisseurs réels (requêtes et insets natifs). */
async function renderScreen(element: React.ReactElement, readyTestID?: string): Promise<RenderResult> {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const view = await render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={METRICS}>{element}</SafeAreaProvider>
    </QueryClientProvider>,
  );
  if (readyTestID !== undefined) {
    await waitFor(() => {
      expect(view.getByTestId(readyTestID)).toBeTruthy();
    });
  }
  return view;
}

/** Applique l'audit et échoue en nommant chaque écart (écran, règle, cible). */
function expectAccessibleScreen(view: RenderResult, screen: string): void {
  const audit = auditScreen(view);
  const summary = audit.violations
    .map((violation) => `${screen} · ${violation.rule} · ${violation.testID} : ${violation.detail}`)
    .join('\n');
  expect(summary).toBe('');
  // Un écran vide passerait l'audit : le nombre de cibles examinées est donc vérifié aussi.
  expect(audit.interactive).toBeGreaterThan(0);
  expect(audit.labeled).toBe(audit.interactive);
}

describe('[SPEC-3502] audit d’accessibilité des écrans', () => {
  it('Aujourd’hui : séance, indicateurs et actions du tuteur', async () => {
    const view = await renderScreen(<TodayScreen />, 'today-screen');
    expectAccessibleScreen(view, 'aujourdhui');
  });

  it('Programme : carte de formation, modules et chapitres', async () => {
    const view = await renderScreen(<ProgrammeScreen />, 'programme-screen');
    expectAccessibleScreen(view, 'programme');
  });

  it('Cours : en-tête, corps, sommaire et tuteur', async () => {
    const view = await renderScreen(<CourseScreen />, 'course-screen');
    expectAccessibleScreen(view, 'cours');
  });

  it('Agenda : vue jour, filtres et replanification', async () => {
    const view = await renderScreen(<AgendaScreen />, 'agenda-screen');
    expectAccessibleScreen(view, 'agenda');
  });

  it('Profil : identité, indicateurs, réglages et déconnexion', async () => {
    const view = await renderScreen(<ProfileScreen />, 'profil-screen');
    expectAccessibleScreen(view, 'profil');
  });

  it('Données et confidentialité : export et suppression', async () => {
    const view = await renderScreen(<PrivacyScreen />);
    expectAccessibleScreen(view, 'confidentialite');
  });

  it('Notifications : canaux, types et heures calmes', async () => {
    const view = await renderScreen(<NotificationsScreen />, 'notifications-screen');
    expectAccessibleScreen(view, 'notifications');
  });

  it('Sécurité et connexion : méthode et déconnexion', async () => {
    const view = await renderScreen(<SecurityScreen />, 'security-screen');
    expectAccessibleScreen(view, 'securite');
  });

  it('À propos : version, build, licences et liens légaux', async () => {
    const view = await renderScreen(<AboutScreen />, 'about-screen');
    expectAccessibleScreen(view, 'a-propos');
  });

  it('Identite : nom, e-mail, ton et fuseau', async () => {
    const view = await renderScreen(<IdentityScreen />, 'identity-screen');
    expectAccessibleScreen(view, 'identite');
  });

  it('Rythme et rappels : heures, jours et moments', async () => {
    const view = await renderScreen(<RhythmScreen />, 'rhythm-screen');
    expectAccessibleScreen(view, 'rythme');
  });

  it('Modeles d IA : taches et fournisseurs', async () => {
    const view = await renderScreen(<ModelsScreen />, 'models-screen');
    expectAccessibleScreen(view, 'modeles');
  });

  it('Abonnement : statut en lecture seule', async () => {
    const view = await renderScreen(<SubscriptionScreen />, 'subscription-screen');
    expectAccessibleScreen(view, 'abonnement');
  });

  it('applique le minimum tactile de la plateforme (48 dp Android, 44 pt iOS)', () => {
    expect(MIN_TARGET).toBeGreaterThanOrEqual(44);
  });
});
