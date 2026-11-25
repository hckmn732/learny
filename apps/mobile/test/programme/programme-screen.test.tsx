// Jest + RNTL [SPEC-3202] — onglet Programme (CA-1, CA-2, CA-4; EF-2 to EF-5).
//
// The API client is mocked at the registry boundary: the screen runs its real hooks, TanStack
// Query and components, so the test proves the wiring of the fixtures of 11 November 2026.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ProgrammeScreen } from '../../src/features/programme/ProgrammeScreen';
import { openOnWeb } from '../../src/lib/web';
import { expectAccessible } from '../utils/expectAccessible';

import { FORMATION_ID, activeProgramme, courseScreen, me, sidebar } from './fixtures';

jest.mock('../../src/lib/web', () => ({
  openOnWeb: jest.fn(() => Promise.resolve('https://learny.test')),
}));

const mockOpenOnWeb = jest.mocked(openOnWeb);

const mockApi = {
  meGet: jest.fn(),
  sidebarGet: jest.fn(),
  formationsList: jest.fn(),
  programmeGet: jest.fn(),
  moduleCourse: jest.fn(),
  currentFormationUpdate: jest.fn(),
};

jest.mock('../../src/api/registry', () => ({
  requireApiClient: () => ({ api: mockApi }),
}));

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn() };

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({}),
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 24, left: 0, right: 0, bottom: 24 },
};

function client(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
}

async function renderScreen(): Promise<void> {
  await render(
    <QueryClientProvider client={client()}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <ProgrammeScreen />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => {
    expect(screen.getByTestId('programme-formation-card')).toBeTruthy();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockApi.meGet.mockResolvedValue(me());
  mockApi.sidebarGet.mockResolvedValue(sidebar());
  mockApi.formationsList.mockResolvedValue({
    items: [{ id: FORMATION_ID, title: 'SAP S/4HANA Finance', status: 'active' }],
  });
  mockApi.programmeGet.mockResolvedValue(activeProgramme());
  mockApi.moduleCourse.mockResolvedValue(courseScreen());
});

describe('[SPEC-3202] onglet Programme', () => {
  it('affiche les valeurs de démonstration et les quatre chapitres du module 3 (CA-1)', async () => {
    await renderScreen();
    expect(screen.getByText('38 %')).toBeTruthy();
    expect(screen.getByText(/Module 3 sur 7/)).toBeTruthy();
    expect(screen.getByText('Validé · 91 %')).toBeTruthy();
    expect(screen.getAllByText('En cours').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Comptabilité générale')).toBeTruthy();
    expect(screen.getByText('Saisie des pièces comptables')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText('8 min')).toBeTruthy();
    });
    expect(screen.getAllByText('Validé').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('chapter-00000000-0000-4000-8000-00000000000302')).toBeTruthy();
    expect(screen.getByTestId('module-4-toggle')).toBeTruthy();
    expectAccessible(screen, 'programme-resume', { role: 'button' });
  });

  it('reprend le chapitre 2 dans l’écran Cours natif (CA-2, SPEC-3302 EF-1)', async () => {
    await renderScreen();
    // La reprise dépend de la progression de lecture (`/modules/:mid/course`) : attendre que le
    // chapitre en cours soit annoncé évite de lire la première rangée avant la réponse du serveur.
    await waitFor(() => {
      expect(screen.getByText('8 min')).toBeTruthy();
    });
    await fireEvent.press(screen.getByTestId('programme-resume'));
    // SPEC-3302 EF-1 — la reprise ouvre l'écran Cours empilé, avec le chapitre transmis.
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/cours/[courseId]',
      params: {
        courseId: '00000000-0000-4000-8000-000000000003',
        chapitre: '00000000-0000-4000-8000-00000000000302',
      },
    });
  });

  it('ouvre un chapitre lisible dans l’écran Cours et son quiz sur le web (EF-5, SPEC-3302 EF-1)', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByTestId('chapter-00000000-0000-4000-8000-00000000000301'));
    // SPEC-3302 EF-1 — le chapitre lisible ouvre l'écran Cours natif, chapitre transmis.
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/cours/[courseId]',
      params: {
        courseId: '00000000-0000-4000-8000-000000000003',
        chapitre: '00000000-0000-4000-8000-00000000000301',
      },
    });
    // SPEC-3304 : le quiz de validation s'ouvre en natif (route `quiz/[attemptId]`), il ne part
    // plus vers le web (CA-3, BR-QUI-05).
    await fireEvent.press(screen.getByTestId('module-3-quiz'));
    expect(mockRouter.push).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/programme/module/[moduleId]' }),
    );
  });

  it('affiche la condition de déblocage d’un module verrouillé (CA-2, BR-FOR-08)', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByTestId('module-4-toggle'));
    expect(screen.getByTestId('programme-locked')).toBeTruthy();
    expect(screen.getByText('Se débloque quand le quiz du module 3 est validé.')).toBeTruthy();
  });

  it('garde l’import sur le web sans écrire le programme (CA-4, quickfix)', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByTestId('programme-import'));
    expect(screen.getByTestId('programme-web-import')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('programme-web-import-action'));
    expect(mockOpenOnWeb).toHaveBeenCalledWith(`/formations/${FORMATION_ID}/programme`);
    expect(mockApi.currentFormationUpdate).not.toHaveBeenCalled();
  });

  it('ouvre le sélecteur de formation et propose la reprise en pause sur le web (BR-FOR-11)', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByTestId('programme-formation-card'));
    expect(screen.getByTestId('formation-switcher')).toBeTruthy();
    expect(screen.getByText('Scrum Product Owner')).toBeTruthy();
    expect(screen.getByText('Reprendre sur le web')).toBeTruthy();
  });

  it('montre un état d’erreur réessayable (EF-7)', async () => {
    mockApi.programmeGet.mockRejectedValue(new Error('réseau'));
    await render(
      <QueryClientProvider client={client()}>
        <SafeAreaProvider initialMetrics={METRICS}>
          <ProgrammeScreen />
        </SafeAreaProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('programme-error')).toBeTruthy();
    });
    expect(screen.getByTestId('programme-error-retry')).toBeTruthy();
  });

  it('affiche l’état vide quand le compte n’a aucune formation (EF-7)', async () => {
    mockApi.formationsList.mockResolvedValue({ items: [] });
    mockApi.sidebarGet.mockResolvedValue({
      collapsed: false,
      currentFormation: null,
      formations: [],
      quizDueCount: 0,
      gapCount: 0,
      streak: { days: 0, regularity: [] },
    });
    mockApi.meGet.mockResolvedValue({ ...me(), currentFormationId: null });
    await render(
      <QueryClientProvider client={client()}>
        <SafeAreaProvider initialMetrics={METRICS}>
          <ProgrammeScreen />
        </SafeAreaProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('programme-empty')).toBeTruthy();
    });
  });

  it('garde la carte, les segments et l’import accessibles (BR-PLA-03)', async () => {
    await renderScreen();
    expectAccessible(screen, 'programme-formation-card', { role: 'button' });
    expect(screen.getByTestId('programme-segmented')).toBeTruthy();
    expectAccessible(screen, 'programme-import', { role: 'button' });
  });
});
