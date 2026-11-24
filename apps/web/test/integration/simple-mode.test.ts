// @vitest-environment jsdom
// [SPEC-4002] Client API du mode simple contre un serveur simulé : dépôt, analyse interrogée
// toutes les deux secondes, état sans clé et changement de rôle (EF-2 à EF-4, ET-2, CA-2).
import { act, createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SimpleState } from '@learny/contracts';
import { cleanup, renderComponent, screen, waitFor } from '@learny/testing/render';

const mocks = vi.hoisted(() => ({
  simpleCreate: vi.fn(),
  simpleGet: vi.fn(),
  simpleAnalysis: vi.fn(),
  simpleUpload: vi.fn(),
  simpleLink: vi.fn(),
  resourceRole: vi.fn(),
  resourcesFinalize: vi.fn(),
  resourcesDelete: vi.fn(),
  meAiModelsGet: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
}));

const { simpleGet, resourceRole, meAiModelsGet } = mocks;

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mocks.replace,
    push: mocks.push,
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/formations/depot',
}));

vi.mock('@learny/api-client', async (importOriginal) => {
  const original = await importOriginal<typeof import('@learny/api-client')>();
  return {
    ...original,
    api: new Proxy(
      {},
      {
        get: (_target, name) => {
          if (name === 'simpleCreate') return mocks.simpleCreate;
          if (name === 'simpleGet') return mocks.simpleGet;
          if (name === 'simpleAnalysis') return mocks.simpleAnalysis;
          if (name === 'simpleUpload') return mocks.simpleUpload;
          if (name === 'simpleLink') return mocks.simpleLink;
          if (name === 'resourceRole') return mocks.resourceRole;
          if (name === 'resourcesFinalize') return mocks.resourcesFinalize;
          if (name === 'resourcesDelete') return mocks.resourcesDelete;
          if (name === 'meAiModelsGet') return mocks.meAiModelsGet;
          return vi.fn();
        },
      },
    ),
  };
});

const { DepotScreen } = await import('../../components/simple/depot-screen');

const FID = '3f1a0a3c-0000-4000-8000-000000000001';
const RESOURCE = '3f1a0a3c-0000-4000-8000-000000000002';
const NOW = '2026-11-11T12:20:00Z';

function state(overrides: Partial<SimpleState> = {}): SimpleState {
  return {
    formationId: FID,
    title: 'Comptabilité générale',
    status: 'collecting',
    motivation: null,
    steps: [
      { key: 'read', state: 'todo', detail: null },
      { key: 'structure', state: 'todo', detail: null },
      { key: 'practice', state: 'todo', detail: null },
      { key: 'programme', state: 'todo', detail: null },
    ],
    chaptersFound: [],
    sources: [],
    error: null,
    proposalVersion: null,
    ...overrides,
  };
}

function models(available: boolean) {
  return {
    tasks: [
      { task: 'programme', available },
      { task: 'course', available },
      { task: 'tutor', available: true },
      { task: 'gaps', available: true },
      { task: 'light', available: true },
    ],
    providers: [],
    updatedAt: NOW,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  meAiModelsGet.mockResolvedValue(models(true));
});

afterEach(cleanup);

describe('[SPEC-4002] dépôt et analyse du mode simple', () => {
  it('CA-2, EF-3 — sans clé d’IA, l’encart s’affiche et la création reste bloquée', async () => {
    meAiModelsGet.mockResolvedValue(models(false));
    renderComponent(
      createElement(DepotScreen, {
        fid: FID,
        initialState: state({
          sources: [
            {
              resourceId: RESOURCE,
              title: 'Manuel.pdf',
              kind: 'pdf',
              role: 'course',
              pages: 712,
              status: 'ready',
            },
          ],
        }),
      }),
    );

    await waitFor(() => {
      expect(screen.queryByTestId('simple-key-warning')).not.toBeNull();
    });
    expect(screen.getByTestId('simple-key-action').getAttribute('href')).toContain(
      'retour=%2Fformations%2F' + FID + '%2Fdepot',
    );
    expect(screen.getByTestId<HTMLButtonElement>('simple-create').disabled).toBe(true);
    // Les fichiers déposés restent affichés (BR-IA-06).
    expect(screen.getByTestId('simple-file-0').textContent).toContain('Manuel.pdf');
  });

  it('EF-2 — un document prêt de rôle « Cours » active « Créer ma formation »', async () => {
    renderComponent(
      createElement(DepotScreen, {
        fid: FID,
        initialState: state({
          sources: [
            {
              resourceId: RESOURCE,
              title: 'Manuel.pdf',
              kind: 'pdf',
              role: 'course',
              pages: 712,
              status: 'ready',
            },
          ],
        }),
      }),
    );
    await waitFor(() => {
      expect(screen.getByTestId<HTMLButtonElement>('simple-create').disabled).toBe(false);
    });
    expect(meAiModelsGet).toHaveBeenCalledTimes(1);
  });

  it('EF-2 — changer le rôle appelle resources.role sur le serveur', async () => {
    resourceRole.mockResolvedValue({ resourceId: RESOURCE, role: 'exam_papers' });
    renderComponent(
      createElement(DepotScreen, {
        fid: FID,
        initialState: state({
          sources: [
            {
              resourceId: RESOURCE,
              title: 'Manuel.pdf',
              kind: 'pdf',
              role: 'course',
              pages: 712,
              status: 'ready',
            },
          ],
        }),
      }),
    );
    const select = screen.getByTestId<HTMLSelectElement>('simple-role-0');
    act(() => {
      select.value = 'exam_papers';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await waitFor(() => {
      expect(resourceRole).toHaveBeenCalledWith({
        params: { rid: RESOURCE },
        body: { role: 'exam_papers' },
      });
    });
  });

  it('EF-4 — l’analyse est interrogée toutes les deux secondes jusqu’au programme prêt', async () => {
    const intervals: number[] = [];
    const realSetInterval = window.setInterval.bind(window);
    // Espion qui laisse tourner les minuteries réelles : RTL s'appuie sur elles pour attendre.
    const setIntervalSpy = vi.spyOn(window, 'setInterval').mockImplementation(((
      handler: TimerHandler,
      delay?: number,
      ...args: unknown[]
    ) => {
      intervals.push(delay ?? 0);
      return realSetInterval(handler, delay, ...args);
    }) as typeof window.setInterval);
    try {
      const analysing = state({
        status: 'analysing',
        steps: [
          { key: 'read', state: 'done', detail: 'Lecture du document de cours.' },
          { key: 'structure', state: 'done', detail: 'Chapitres détectés.' },
          { key: 'practice', state: 'running', detail: null },
          { key: 'programme', state: 'todo', detail: null },
        ],
        chaptersFound: [
          { position: 1, title: 'Introduction' },
          { position: 2, title: 'Plan comptable' },
        ],
      });
      simpleGet.mockResolvedValue({ ...analysing, status: 'proposed', chaptersFound: [] });
      renderComponent(createElement(DepotScreen, { fid: FID, initialState: analysing }));

      // EF-4 — les quatre étapes et les chapitres trouvés sont affichés pendant l'analyse.
      expect(screen.getByTestId('simple-steps').textContent).toContain('Lecture des documents');
      expect(screen.getByTestId('simple-chapters-found').textContent).toContain('Plan comptable');
      // L'interrogation est réglée sur deux secondes (ET-2, EF-4).
      expect(intervals).toContain(2000);

      await waitFor(() => {
        expect(simpleGet).toHaveBeenCalledWith({ params: { fid: FID } });
      });
      // Le programme prêt fait quitter l'écran d'analyse (EF-4).
      await waitFor(
        () => {
          expect(screen.queryByTestId('simple-analysis-page')).toBeNull();
        },
        { timeout: 5000 },
      );
    } finally {
      setIntervalSpy.mockRestore();
    }
  });

  it('CL-3 — un rechargement en pleine analyse reprend l’état serveur', () => {
    simpleGet.mockResolvedValue(state({ status: 'analysing' }));
    renderComponent(
      createElement(DepotScreen, {
        fid: FID,
        initialState: state({
          status: 'analysing',
          steps: [
            { key: 'read', state: 'done', detail: null },
            { key: 'structure', state: 'running', detail: null },
            { key: 'practice', state: 'todo', detail: null },
            { key: 'programme', state: 'todo', detail: null },
          ],
          chaptersFound: [{ position: 1, title: 'Introduction' }],
        }),
      }),
    );
    expect(screen.queryByTestId('simple-analysis-page')).not.toBeNull();
    expect(screen.getByTestId('simple-step-structure').getAttribute('data-state')).toBe('running');
    expect(screen.getByTestId('simple-chapters-found').textContent).toContain('Introduction');
  });
});
