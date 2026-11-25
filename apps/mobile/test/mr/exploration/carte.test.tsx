// Jest + RNTL — écran « Carte des notions », modes grille et cerveau (SPEC-616 EF-1 à EF-5).
//
// Le client est simulé à la frontière du registre : la grille, le réseau SVG, la liste accessible
// et le panneau de détail sont rendus pour de vrai. Aucun instantané de mise en page ; les
// assertions portent sur les nœuds, les actions et les états.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { NotionGraphDto, NotionGraphNode } from '@learny/contracts';

import { CarteScreen } from '../../../src/features/mr/exploration/CarteScreen';
import { openOnWeb } from '../../../src/lib/web';
import { expectAccessible } from '../../utils/expectAccessible';

jest.mock('../../../src/lib/web', () => ({
  openOnWeb: jest.fn(() => Promise.resolve('https://learny.test')),
}));

const mockOpenOnWeb = jest.mocked(openOnWeb);

const mockApi = { notionGraph: jest.fn() };

jest.mock('../../../src/api/registry', () => ({
  requireApiClient: () => ({ api: mockApi }),
}));

const FORMATION_ID = '00000000-0000-4000-8000-0000000000f1';
const MODULE_A = '00000000-0000-4000-8000-0000000000f2';
const MODULE_B = '00000000-0000-4000-8000-0000000000f3';
const NOTION_MASTERED = '00000000-0000-4000-8000-0000000000f4';
const NOTION_FRAGILE = '00000000-0000-4000-8000-0000000000f5';
const NOTION_UPCOMING = '00000000-0000-4000-8000-0000000000f6';

const METRICS = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 24, left: 0, right: 0, bottom: 24 },
};

function node(overrides: Partial<NotionGraphNode> & Pick<NotionGraphNode, 'id' | 'kind' | 'label' | 'order'>): NotionGraphNode {
  return {
    moduleId: null,
    modulePosition: null,
    moduleTitle: null,
    chapterPosition: null,
    notionPosition: null,
    definition: null,
    mastery: null,
    masteryStatus: null,
    gapNature: null,
    courseHref: null,
    trainingHref: null,
    gapHref: null,
    ...overrides,
  };
}

function graph(): NotionGraphDto {
  const formation = node({
    id: `notion:${FORMATION_ID}`,
    kind: 'formation',
    label: 'SAP S/4HANA Finance',
    order: 0,
  });
  const moduleA = node({
    id: `notion:${MODULE_A}`,
    kind: 'module',
    label: 'Module 1 · Fondamentaux',
    order: 1,
    moduleId: MODULE_A,
    modulePosition: 1,
    moduleTitle: 'Fondamentaux',
  });
  const moduleB = node({
    id: `notion:${MODULE_B}`,
    kind: 'module',
    label: 'Module 2 · Clients',
    order: 2,
    moduleId: MODULE_B,
    modulePosition: 2,
    moduleTitle: 'Clients',
  });
  const mastered = node({
    id: `notion:${NOTION_MASTERED}`,
    kind: 'notion',
    label: 'Plan de comptes',
    order: 3,
    moduleId: MODULE_A,
    modulePosition: 1,
    moduleTitle: 'Fondamentaux',
    chapterPosition: 1,
    notionPosition: 1,
    mastery: 96,
    masteryStatus: 'mastered',
    courseHref: `/formations/${FORMATION_ID}/modules/${MODULE_A}/cours`,
    trainingHref: `/formations/${FORMATION_ID}/quiz-global?cible=${NOTION_MASTERED}`,
  });
  const fragile = node({
    id: `notion:${NOTION_FRAGILE}`,
    kind: 'notion',
    label: 'Lettrage fournisseurs',
    order: 4,
    moduleId: MODULE_A,
    modulePosition: 1,
    moduleTitle: 'Fondamentaux',
    chapterPosition: 2,
    notionPosition: 2,
    mastery: 27,
    masteryStatus: 'to_consolidate',
    gapNature: 'confusion',
    courseHref: `/formations/${FORMATION_ID}/modules/${MODULE_A}/cours`,
    trainingHref: `/formations/${FORMATION_ID}/quiz-global?cible=${NOTION_FRAGILE}`,
    gapHref: `/formations/${FORMATION_ID}/lacunes?nature=confusion`,
  });
  const upcoming = node({
    id: `notion:${NOTION_UPCOMING}`,
    kind: 'notion',
    label: 'Relances clients',
    order: 5,
    moduleId: MODULE_B,
    modulePosition: 2,
    moduleTitle: 'Clients',
    chapterPosition: 1,
    notionPosition: 1,
    masteryStatus: 'upcoming',
  });
  return {
    formationId: FORMATION_ID,
    formationTitle: 'SAP S/4HANA Finance',
    timezone: 'Europe/Paris',
    generatedAt: '2026-11-11T12:20:00.000Z',
    nodes: [formation, moduleA, moduleB, mastered, fragile, upcoming],
    links: [
      { id: 'formation:a', from: formation.id, to: moduleA.id, kind: 'formation' },
      { id: 'formation:b', from: formation.id, to: moduleB.id, kind: 'formation' },
      { id: 'contains:a1', from: moduleA.id, to: mastered.id, kind: 'contains' },
      { id: 'contains:a2', from: moduleA.id, to: fragile.id, kind: 'contains' },
      { id: 'contains:b1', from: moduleB.id, to: upcoming.id, kind: 'contains' },
      { id: 'link:1', from: mastered.id, to: fragile.id, kind: 'prerequisite' },
    ],
    gaps: [
      {
        notionId: NOTION_FRAGILE,
        label: 'Lettrage fournisseurs',
        mastery: 27,
        nature: 'confusion',
        href: `/formations/${FORMATION_ID}/lacunes?nature=confusion`,
      },
    ],
    stats: { notions: 3, links: 1, modules: 2, mastered: 1, upcoming: 1, openGaps: 1 },
  };
}

function client(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
}

async function renderScreen(
  formationId: string | null,
  initialMode: 'grille' | 'cerveau' = 'grille',
): Promise<void> {
  await render(
    <QueryClientProvider client={client()}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <CarteScreen formationId={formationId} initialMode={initialMode} onBack={() => undefined} />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockApi.notionGraph.mockResolvedValue(graph());
});

describe('[quickfix/mr-d] écran Carte des notions', () => {
  it('affiche la grille par module avec la maîtrise et ouvre le détail d’une notion', async () => {
    await renderScreen(FORMATION_ID);
    await waitFor(() => {
      expect(screen.getByTestId('qf-carte-grid')).toBeTruthy();
    });
    expect(mockApi.notionGraph).toHaveBeenCalledWith({ params: { fid: FORMATION_ID } });
    expect(screen.getByText('Module 1 · Fondamentaux')).toBeTruthy();
    expect(screen.getByText('Module 2 · Clients')).toBeTruthy();
    expect(screen.getByText('Maîtrisée')).toBeTruthy();
    expectAccessible(screen, `qf-carte-cell-notion:${NOTION_MASTERED}`, { role: 'button' });

    await fireEvent.press(screen.getByTestId(`qf-carte-cell-notion:${NOTION_FRAGILE}`));
    expect(screen.getByTestId('qf-carte-detail')).toBeTruthy();
    expect(screen.getByTestId('qf-carte-detail-title')).toHaveTextContent('Lettrage fournisseurs');

    await fireEvent.press(screen.getByTestId('qf-carte-detail-train'));
    expect(mockOpenOnWeb).toHaveBeenCalledWith(
      `/formations/${FORMATION_ID}/quiz-global?cible=${NOTION_FRAGILE}`,
    );
    await fireEvent.press(screen.getByTestId('qf-carte-detail-gap'));
    expect(mockOpenOnWeb).toHaveBeenCalledWith(
      `/formations/${FORMATION_ID}/lacunes?nature=confusion`,
    );
  });

  it('passe au mode cerveau, liste les nœuds et relations et zoome', async () => {
    await renderScreen(FORMATION_ID);
    await waitFor(() => {
      expect(screen.getByTestId('qf-carte-grid')).toBeTruthy();
    });
    await fireEvent.press(screen.getByTestId('qf-carte-mode-cerveau'));
    expect(screen.getByTestId('qf-carte-brain')).toBeTruthy();
    expect(screen.getByTestId('qf-carte-canvas')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('qf-carte-zoom-in'));
    await fireEvent.press(screen.getByTestId('qf-carte-zoom-out'));
    await fireEvent.press(screen.getByTestId('qf-carte-zoom-reset'));

    await fireEvent.press(screen.getByTestId('qf-carte-list-toggle'));
    expect(screen.getByTestId('qf-carte-list')).toBeTruthy();
    // La liste annonce les relations du contrat (BR-CAR-01).
    expect(
      screen.getAllByText('Plan de comptes prépare Lettrage fournisseurs').length,
    ).toBeGreaterThan(0);
    await fireEvent.press(screen.getByTestId(`qf-carte-list-item-notion:${NOTION_UPCOMING}`));
    expect(screen.getByTestId('qf-carte-detail-title')).toHaveTextContent('Relances clients');
  });

  it('ouvre le mode cerveau quand la route porte ?mode=cerveau', async () => {
    await renderScreen(FORMATION_ID, 'cerveau');
    await waitFor(() => {
      expect(screen.getByTestId('qf-carte-brain')).toBeTruthy();
    });
    expect(screen.queryByTestId('qf-carte-grid')).toBeNull();
  });

  it('montre une erreur réessayable quand le graphe ne charge pas', async () => {
    mockApi.notionGraph.mockRejectedValue(new Error('réseau'));
    await renderScreen(FORMATION_ID);
    await waitFor(() => {
      expect(screen.getByTestId('qf-carte-error')).toBeTruthy();
    });
    expect(screen.getByTestId('qf-carte-error-retry')).toBeTruthy();
  });

  it('refuse un identifiant de formation invalide sans appeler l’API', async () => {
    await renderScreen('pas-un-uuid');
    await waitFor(() => {
      expect(screen.getByTestId('qf-carte-invalid')).toBeTruthy();
    });
    expect(mockApi.notionGraph).not.toHaveBeenCalled();
  });
});