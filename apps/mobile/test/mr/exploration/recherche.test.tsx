// Jest + RNTL — écran « Recherche » (maquette Recherche.dc.html ; SPEC-212, SPEC-307).
//
// Le client est simulé à la frontière du registre : la requête part réellement après la pause de
// frappe, et le test vérifie le contrat `search.global` envoyé, les groupes affichés et l'ouverture
// d'un résultat. Aucun instantané de mise en page.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { SearchItem, SearchResponse } from '@learny/contracts';

import { RechercheScreen } from '../../../src/features/mr/exploration/RechercheScreen';
import { openOnWeb } from '../../../src/lib/web';
import { expectAccessible } from '../../utils/expectAccessible';

jest.mock('../../../src/lib/web', () => ({
  openOnWeb: jest.fn(() => Promise.resolve('https://learny.test')),
}));

const mockOpenOnWeb = jest.mocked(openOnWeb);

const mockApi = { searchGlobal: jest.fn() };

jest.mock('../../../src/api/registry', () => ({
  requireApiClient: () => ({ api: mockApi }),
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 24, left: 0, right: 0, bottom: 24 },
};

const NOTION_ID = '00000000-0000-4000-8000-0000000000e1';
const CHAPTER_ID = '00000000-0000-4000-8000-0000000000e2';
const FORMATION_ID = '00000000-0000-4000-8000-0000000000e3';

function item(id: string, title: string, snippet: string, href: string): SearchItem {
  return { id, title, snippet, highlights: [], titleHighlights: [], href };
}

function response(): SearchResponse {
  return {
    query: 'lettrage',
    groups: [
      {
        kind: 'notion',
        label: 'Notions',
        items: [
          item(
            NOTION_ID,
            'Lettrage des comptes fournisseurs',
            'Le lettrage rapproche une facture de son paiement.',
            `/formations/${FORMATION_ID}/lacunes`,
          ),
        ],
        total: 2,
      },
      {
        kind: 'chapter',
        label: 'Chapitres',
        items: [
          item(
            CHAPTER_ID,
            'Rapprocher factures et paiements',
            'Chapitre 2 du module 3 : lettrage manuel et automatique.',
            `/formations/${FORMATION_ID}/modules/${CHAPTER_ID}/cours`,
          ),
        ],
        total: 1,
      },
      { kind: 'formation', label: 'Formations', items: [], total: 0 },
    ],
  };
}

function client(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
}

async function renderScreen(): Promise<void> {
  await render(
    <QueryClientProvider client={client()}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <RechercheScreen onBack={() => undefined} />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
}

async function type(text: string): Promise<void> {
  await fireEvent.changeText(screen.getByTestId('qf-recherche-field'), text);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockApi.searchGlobal.mockResolvedValue(response());
});

describe('[quickfix/mr-d] écran Recherche', () => {
  it('interroge search.global après la pause de frappe et groupe les résultats', async () => {
    await renderScreen();
    expect(screen.getByTestId('qf-recherche-hint')).toBeTruthy();
    await type('lettrage');
    await waitFor(() => {
      expect(screen.getByTestId('qf-recherche-results')).toBeTruthy();
    });
    expect(mockApi.searchGlobal).toHaveBeenCalledTimes(1);
    expect(mockApi.searchGlobal).toHaveBeenCalledWith({ query: { q: 'lettrage' } });
    expect(screen.getByText('Lettrage des comptes fournisseurs')).toBeTruthy();
    expect(screen.getByTestId('qf-recherche-group-notion')).toBeTruthy();
    expect(screen.getByTestId('qf-recherche-group-chapter')).toBeTruthy();
    expectAccessible(screen, `qf-recherche-result-${NOTION_ID}`, {
      role: 'button',
      label: 'Ouvrir Lettrage des comptes fournisseurs',
    });
  });

  it('ouvre le résultat dans le navigateur', async () => {
    await renderScreen();
    await type('lettrage');
    await waitFor(() => {
      expect(screen.getByTestId(`qf-recherche-result-${CHAPTER_ID}`)).toBeTruthy();
    });
    await fireEvent.press(screen.getByTestId(`qf-recherche-result-${CHAPTER_ID}`));
    expect(mockOpenOnWeb).toHaveBeenCalledWith(
      `/formations/${FORMATION_ID}/modules/${CHAPTER_ID}/cours`,
    );
  });

  it('filtre les groupes affichés sans relancer la requête', async () => {
    await renderScreen();
    await type('lettrage');
    await waitFor(() => {
      expect(screen.getByTestId('qf-recherche-group-chapter')).toBeTruthy();
    });
    await fireEvent.press(screen.getByTestId('qf-recherche-filter-notion'));
    expect(screen.queryByTestId('qf-recherche-group-chapter')).toBeNull();
    expect(screen.getByTestId('qf-recherche-group-notion')).toBeTruthy();
    expect(mockApi.searchGlobal).toHaveBeenCalledTimes(1);
  });

  it('n’interroge pas le serveur sous deux caractères', async () => {
    await renderScreen();
    await type('l');
    await fireEvent.changeText(screen.getByTestId('qf-recherche-field'), 'l');
    expect(screen.getByTestId('qf-recherche-hint')).toBeTruthy();
    expect(mockApi.searchGlobal).not.toHaveBeenCalled();
  });

  it('montre l’état vide puis une erreur réessayable', async () => {
    mockApi.searchGlobal.mockResolvedValue({
      query: 'zzz',
      groups: [
        { kind: 'notion', label: 'Notions', items: [], total: 0 },
        { kind: 'chapter', label: 'Chapitres', items: [], total: 0 },
        { kind: 'formation', label: 'Formations', items: [], total: 0 },
      ],
    });
    await renderScreen();
    await type('zzz');
    await waitFor(() => {
      expect(screen.getByTestId('qf-recherche-empty')).toBeTruthy();
    });

    mockApi.searchGlobal.mockRejectedValue(new Error('réseau'));
    await type('lettrage');
    await waitFor(() => {
      expect(screen.getByTestId('qf-recherche-error')).toBeTruthy();
    });
    expect(screen.getByTestId('qf-recherche-error-retry')).toBeTruthy();
  });
});