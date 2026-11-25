// Jest + RNTL — écran Apports (zone A du rattrapage mobile).
//
// Le rendu de la liste (statuts en mots), l'action principale « J’ai terminé mes apports » et
// l'import d'un programme collé. Aucune capture de mise en page : seuls le comportement et les
// testID comptent.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { ModuleScreen } from '@learny/contracts';

import { ApportsScreen } from '../../../src/features/mr/programme/ApportsScreen';

const CHAPTER = '3c9a1b1e-1111-4a4a-8a8a-aaaaaaaaaaa1';
const CHAPTER_2 = '3c9a1b1e-2222-4a4a-8a8a-aaaaaaaaaaa2';
const MODULE_ID = '4d0b2c2f-3333-4b4b-9b9b-bbbbbbbbbbb3';

const MODULE: ModuleScreen = {
  formation: { id: '5e1c3d3a-4444-4c4c-8c8c-ccccccccccc4', title: 'SAP S/4HANA Finance' },
  module: {
    id: MODULE_ID,
    position: 2,
    positionTotal: 6,
    title: 'Écritures',
    plannedStart: '2026-11-03',
    plannedEnd: '2026-11-16',
    threshold: 80,
    status: 'open',
  },
  chapters: [
    {
      id: CHAPTER,
      position: 1,
      title: 'Le plan de comptes',
      contributionsStatus: 'in_progress',
      doneAt: null,
      resourceCount: 3,
    },
    {
      id: CHAPTER_2,
      position: 2,
      title: 'Les écritures courantes',
      contributionsStatus: 'in_progress',
      doneAt: null,
      resourceCount: 0,
    },
  ],
  selectedChapterId: CHAPTER,
  resources: [
    {
      id: '6f2d4e4b-5555-4d4d-9d9d-ddddddddddd5',
      kind: 'pdf',
      title: 'Cours écritures comptables',
      status: 'ready',
      errorCode: null,
      errorMessage: null,
      sizeBytes: 2_400_000,
      pages: 42,
      url: null,
      createdAt: '2026-11-10T09:00:00.000Z',
      updatedAt: '2026-11-10T09:02:00.000Z',
    },
    {
      id: '7a3e5f5c-6666-4e4e-8e8e-eeeeeeeeeee6',
      kind: 'image',
      title: 'TD n°3 — 4 photos',
      status: 'processing',
      errorCode: null,
      errorMessage: null,
      sizeBytes: 800_000,
      pages: null,
      url: null,
      createdAt: '2026-11-10T09:05:00.000Z',
      updatedAt: '2026-11-10T09:05:00.000Z',
    },
    {
      id: '8b4f6a6d-7777-4f4f-9f9f-fffffffffff7',
      kind: 'youtube',
      title: 'Vidéo : le plan de comptes',
      status: 'ready',
      errorCode: null,
      errorMessage: null,
      sizeBytes: null,
      pages: null,
      url: 'https://www.youtube.com/watch?v=abcdefghijk',
      createdAt: '2026-11-10T09:10:00.000Z',
      updatedAt: '2026-11-10T09:12:00.000Z',
    },
  ],
  suggestions: [],
  counts: {
    chaptersDone: 0,
    chaptersTotal: 2,
    chapterResources: 3,
    chapterResourceLimit: 20,
    storageUsedBytes: 3_200_000,
    storageQuotaBytes: 100_000_000,
  },
  allChaptersDone: false,
};

const PROPOSAL = {
  formationId: '5e1c3d3a-4444-4c4c-8c8c-ccccccccccc4',
  title: 'SAP S/4HANA Finance',
  description: null,
  formationStatus: 'programme_proposed' as const,
  cadrageCompleted: true,
  proposal: null,
};

const mockChapterComplete = jest.fn();
const mockProgrammeImport = jest.fn();

jest.mock('../../../src/api/registry', () => ({
  requireApiClient: () => ({
    api: {
      moduleScreen: () => Promise.resolve(MODULE),
      chaptersComplete: jest.fn(),
      chapterComplete: (input: unknown) => {
        mockChapterComplete(input);
        return Promise.resolve({
          chapterId: CHAPTER,
          moduleId: MODULE_ID,
          contributionsStatus: 'done',
          doneAt: '2026-11-10T10:00:00.000Z',
          chaptersDone: 1,
          chaptersTotal: 2,
          generationRequested: false,
        });
      },
      programmeGet: () => Promise.resolve(PROPOSAL),
      programmeImport: (input: unknown) => {
        mockProgrammeImport(input);
        return Promise.resolve(PROPOSAL);
      },
      resourcesCreate: () => Promise.resolve({}),
      resourcesRetry: () => Promise.resolve({}),
    },
  }),
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 24, left: 0, right: 0, bottom: 24 },
};

async function renderApports(): Promise<void> {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  await render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <ApportsScreen moduleId={MODULE_ID} onBack={jest.fn()} />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => {
    expect(screen.getByText('Cours écritures comptables')).toBeTruthy();
  });
}

describe('écran Apports', () => {
  beforeEach(() => {
    mockChapterComplete.mockClear();
    mockProgrammeImport.mockClear();
  });

  it('affiche les apports du chapitre avec leur statut en mots', async () => {
    await renderApports();

    expect(screen.getByTestId('qf-apports')).toBeTruthy();
    expect(screen.getByText('Déjà ajoutés · 3')).toBeTruthy();
    expect(screen.getAllByText('Analysé')).toHaveLength(2);
    expect(screen.getByText('Lecture en cours…')).toBeTruthy();
    expect(screen.getByText('Cours écritures comptables')).toBeTruthy();
    expect(screen.getByText('TD n°3 — 4 photos')).toBeTruthy();
    expect(screen.getByText('Vidéo : le plan de comptes')).toBeTruthy();
  });

  it('déclare les apports du chapitre terminés (action principale)', async () => {
    await renderApports();

    await fireEvent.press(screen.getByTestId('qf-apports-done'));

    await waitFor(() => {
      expect(mockChapterComplete).toHaveBeenCalledWith({
        params: { cid: CHAPTER },
        body: { done: true },
      });
    });
  });

  it('importe un programme collé depuis le bloc « Vous avez déjà un programme ? »', async () => {
    await renderApports();

    await fireEvent.press(screen.getByTestId('qf-apports-import-open'));
    await waitFor(() => {
      expect(screen.getByTestId('qf-import-text')).toBeTruthy();
    });
    await fireEvent.changeText(
      screen.getByTestId('qf-import-text'),
      'Module 1 : Écritures\nChapitre 1 : Plan de comptes',
    );
    await fireEvent.press(screen.getByTestId('qf-import-submit'));

    await waitFor(() => {
      expect(mockProgrammeImport).toHaveBeenCalledWith({
        params: { fid: '5e1c3d3a-4444-4c4c-8c8c-ccccccccccc4' },
        body: {
          kind: 'text',
          text: 'Module 1 : Écritures\nChapitre 1 : Plan de comptes',
          expectedVersion: 0,
        },
      });
    });
  });
});