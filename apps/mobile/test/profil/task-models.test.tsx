// Jest + RNTL [SPEC-3401] — écran Modèles d'IA (EF-3, CL-2 ; BR-SET-05, CA-3).
//
// The five tasks are listed with their compatibility; choosing a model sends `assign` with the
// credential of the option, and a learner without a provider sees the empty state of CL-2 with the
// hand-off to the web (adding a key is out of the mobile scope, ADR-3002).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ModelsScreen } from '../../src/features/profil/ModelsScreen';

import { CREDENTIAL_ID as mockCredentialId, MODELS as mockModelsFixture } from './fixtures';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
const mockUpdate = jest.fn();
let mockModels = mockModelsFixture;

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
}));

jest.mock('../../src/api/registry', () => ({
  requireApiClient: () => ({
    api: {
      meAiModelsGet: () => Promise.resolve(mockModels),
      meAiModelsUpdate: mockUpdate,
    },
  }),
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 24, left: 0, right: 0, bottom: 24 },
};

/** Premier argument d'une mutation espionnée, sans `any` : `jest.Mock` l'expose. */
function firstCall(mock: jest.Mock): Record<string, unknown> {
  const calls = mock.mock.calls as unknown as [Record<string, unknown>][];
  const argument = calls[0]?.[0];
  if (argument === undefined) throw new Error('mutation non appelée');
  return argument;
}

async function renderModels(readyTestID = 'model-task-programme'): Promise<void> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <ModelsScreen />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => {
    expect(screen.getByTestId(readyTestID)).toBeTruthy();
  });
}

describe('[SPEC-3401] écran Modèles d’IA', () => {
  beforeEach(() => {
    mockModels = mockModelsFixture;
    mockUpdate.mockReset();
    mockUpdate.mockImplementation(() => Promise.resolve(mockModelsFixture));
  });

  it('liste les cinq tâches avec leur modèle (BR-SET-05)', async () => {
    await renderModels();
    for (const task of ['programme', 'course', 'gaps', 'tutor', 'light']) {
      expect(screen.getByTestId(`model-task-${task}`)).toBeTruthy();
    }
    expect(screen.getByTestId('model-task-programme')).toHaveTextContent(/Modèle local/u);
  });

  it('affecte un modèle à une tâche (CA-3)', async () => {
    await renderModels();
    await fireEvent.press(screen.getByTestId('model-task-gaps'));
    await waitFor(() => {
      expect(screen.getByTestId('model-option-0')).toBeTruthy();
    });
    await fireEvent.press(screen.getByTestId('model-option-0'));
    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledTimes(1);
    });
    const call = firstCall(mockUpdate);
    expect(call.body).toEqual({
      action: 'assign',
      task: 'gaps',
      modelId: 'demo-model',
      credentialId: mockCredentialId,
    });
  });

  it('affiche l’état vide et le renvoi au web sans fournisseur (CL-2)', async () => {
    mockModels = {
      ...mockModelsFixture,
      tasks: mockModelsFixture.tasks.map((task) => ({ ...task, modelId: null, options: [] })),
    };
    await renderModels('models-empty');
    expect(screen.getByTestId('models-empty')).toHaveTextContent(/Aucun fournisseur configuré/u);
    expect(screen.getByTestId('models-manage')).toHaveTextContent(
      /Gérer mes fournisseurs sur le web/u,
    );
  });

  it('explique une tâche sans modèle choisi (CL-3)', async () => {
    mockModels = {
      ...mockModelsFixture,
      tasks: mockModelsFixture.tasks.map((task) => ({
        ...task,
        modelId: null,
        available: false,
        unavailableReason: 'no_model_selected',
      })),
    };
    await renderModels();
    expect(screen.getByTestId('model-task-light')).toHaveTextContent(
      /Aucun modèle choisi pour cette tâche\./u,
    );
  });
});
