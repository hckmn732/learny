// Jest + RNTL — écran « Mes lacunes » (maquette Lacunes.dc.html ; SPEC-615 EF-2 à EF-5).
//
// Le client d'API est simulé à la frontière du registre : l'écran exécute ses vrais hooks, TanStack
// Query et les composants du design system, donc le test prouve le câblage des données et des
// actions. Aucun instantané de mise en page : les assertions portent sur le contenu et les gestes.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { GapCard, GapListDto, SidebarDto, SidebarFormation } from '@learny/contracts';

import { LacunesScreen } from '../../../src/features/mr/exploration/LacunesScreen';
import { openOnWeb } from '../../../src/lib/web';
import { expectAccessible } from '../../utils/expectAccessible';

jest.mock('../../../src/lib/web', () => ({
  openOnWeb: jest.fn(() => Promise.resolve('https://learny.test')),
}));

const mockOpenOnWeb = jest.mocked(openOnWeb);

const mockApi = {
  sidebarGet: jest.fn(),
  gapsList: jest.fn(),
};

jest.mock('../../../src/api/registry', () => ({
  requireApiClient: () => ({ api: mockApi }),
}));

const FORMATION_ID = '00000000-0000-4000-8000-0000000000d1';
const MODULE_ID = '00000000-0000-4000-8000-0000000000d2';
const CHAPTER_ID = '00000000-0000-4000-8000-0000000000d3';
const NOTION_FNP = '00000000-0000-4000-8000-0000000000d4';
const NOTION_LETTRAGE = '00000000-0000-4000-8000-0000000000d5';

const METRICS = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 24, left: 0, right: 0, bottom: 24 },
};

function formation(): SidebarFormation {
  return {
    id: FORMATION_ID,
    title: 'SAP S/4HANA Finance',
    monogram: 'SAP',
    accent: 'indigo',
    status: 'active',
    progressPercent: 38,
    currentModulePosition: 3,
    moduleCount: 7,
  };
}

function sidebar(): SidebarDto {
  return {
    collapsed: false,
    currentFormation: formation(),
    formations: [formation()],
    quizDueCount: 2,
    gapCount: 2,
    streak: {
      days: 5,
      regularity: Array.from({ length: 14 }, (_, index) => ({
        date: `2026-11-${String(index + 1).padStart(2, '0')}`,
        status: 'none' as const,
      })),
    },
  };
}

function gap(overrides: Partial<GapCard>): GapCard {
  return {
    notionId: NOTION_FNP,
    notionLabel: 'Factures non parvenues',
    nature: 'confusion',
    recommendedAction: 'confrontation',
    confusedWithLabel: 'Compte de tiers',
    moduleId: MODULE_ID,
    modulePosition: 6,
    moduleTitle: 'Clôture mensuelle',
    chapterId: CHAPTER_ID,
    chapterTitle: 'Charges à payer',
    revealedBy: '3 erreurs sur les 2 derniers quiz.',
    detectedAt: '2026-11-09T08:00:00.000Z',
    mastery: 27,
    threshold: 75,
    training: {
      kind: 'quiz',
      href: `/formations/${FORMATION_ID}/quiz-global?cible=${NOTION_FNP}`,
    },
    course: {
      sectionId: CHAPTER_ID,
      anchor: 'charges-a-payer',
      href: `/formations/${FORMATION_ID}/modules/${MODULE_ID}/cours#charges-a-payer`,
    },
    ...overrides,
  };
}

function gapsList(): GapListDto {
  return {
    formationId: FORMATION_ID,
    formationTitle: 'SAP S/4HANA Finance',
    nature: null,
    summary: {
      openGaps: 2,
      masteredNotions: 19,
      gapModules: [6],
      masteredModules: [1, 2],
    },
    countsByNature: { forgetting: 0, confusion: 1, misunderstanding: 1, application: 0 },
    items: [
      gap({}),
      gap({
        notionId: NOTION_LETTRAGE,
        notionLabel: 'Lettrage des comptes fournisseurs',
        nature: 'misunderstanding',
        recommendedAction: 'alternative_explanation',
        confusedWithLabel: null,
        modulePosition: 3,
        moduleTitle: 'Fournisseurs',
        mastery: 42,
      }),
    ],
    nextReviewAt: '2026-11-11T18:00:00.000Z',
    timezone: 'Europe/Paris',
    generatedAt: '2026-11-11T12:20:00.000Z',
  };
}

function client(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
}

async function renderScreen(): Promise<void> {
  await render(
    <QueryClientProvider client={client()}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <LacunesScreen
          onBack={() => {
            // Le retour est prouvé par le test de la route ; ici, il ne doit rien casser.
          }}
        />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => {
    expect(screen.getByTestId('qf-lacunes-list')).toBeTruthy();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockApi.sidebarGet.mockResolvedValue(sidebar());
  mockApi.gapsList.mockResolvedValue(gapsList());
});

describe('[quickfix/mr-d] écran Mes lacunes', () => {
  it('liste les lacunes ouvertes avec leur nature, leur module et leur maîtrise', async () => {
    await renderScreen();
    expect(screen.getByTestId('qf-lacunes')).toBeTruthy();
    expect(screen.getByText('Factures non parvenues')).toBeTruthy();
    expect(screen.getByText('Lettrage des comptes fournisseurs')).toBeTruthy();
    expect(screen.getByText('Module 6 · Clôture mensuelle')).toBeTruthy();
    expect(screen.getByText('Maîtrise 27 % · seuil 75 %')).toBeTruthy();
    expect(mockApi.gapsList).toHaveBeenCalledWith({
      params: { fid: FORMATION_ID },
      query: {},
    });
    expectAccessible(screen, `qf-lacunes-train-${NOTION_FNP}`, { role: 'button' });
  });

  it('filtre par nature de lacune et relit les compteurs du serveur', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByTestId('qf-lacunes-filter-confusion'));
    await waitFor(() => {
      expect(mockApi.gapsList).toHaveBeenLastCalledWith({
        params: { fid: FORMATION_ID },
        query: { nature: 'confusion' },
      });
    });
    expect(screen.getByTestId('qf-lacunes-filters')).toBeTruthy();
  });

  it('ouvre la révision ciblée dans le navigateur et laisse le cours accessible', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByTestId(`qf-lacunes-train-${NOTION_FNP}`));
    expect(mockOpenOnWeb).toHaveBeenCalledWith(
      `/formations/${FORMATION_ID}/quiz-global?cible=${NOTION_FNP}`,
    );
    await fireEvent.press(screen.getByTestId(`qf-lacunes-course-${NOTION_FNP}`));
    expect(mockOpenOnWeb).toHaveBeenCalledWith(
      `/formations/${FORMATION_ID}/modules/${MODULE_ID}/cours#charges-a-payer`,
    );
  });

  it('montre l’état vide quand aucune lacune n’est ouverte', async () => {
    mockApi.gapsList.mockResolvedValue({
      ...gapsList(),
      countsByNature: { forgetting: 0, confusion: 0, misunderstanding: 0, application: 0 },
      items: [],
      nextReviewAt: null,
    });
    await render(
      <QueryClientProvider client={client()}>
        <SafeAreaProvider initialMetrics={METRICS}>
          <LacunesScreen onBack={() => undefined} />
        </SafeAreaProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('qf-lacunes-empty')).toBeTruthy();
    });
  });

  it('montre une erreur réessayable quand la lecture échoue', async () => {
    mockApi.gapsList.mockRejectedValue(new Error('réseau'));
    await render(
      <QueryClientProvider client={client()}>
        <SafeAreaProvider initialMetrics={METRICS}>
          <LacunesScreen onBack={() => undefined} />
        </SafeAreaProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('qf-lacunes-error')).toBeTruthy();
    });
    expect(screen.getByTestId('qf-lacunes-error-retry')).toBeTruthy();
  });
});