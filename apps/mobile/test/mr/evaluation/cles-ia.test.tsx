// Jest + RNTL [quickfix mr-c] — clés d'IA personnelles (maquette ClesIA.dc.html).
//
// Rendu de l'écran et action principale : choisir un fournisseur, tester la clé (découverte) puis
// l'enregistrer ; et supprimer une clé existante après confirmation. Les routes de l'API sont
// simulées, la logique de l'écran ne calcule rien.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { CredentialDto } from '@learny/contracts';

import { ClesIaScreen } from '../../../src/features/mr/evaluation/ClesIaScreen';

const mockList = jest.fn();
const mockDiscover = jest.fn();
const mockCreate = jest.fn();
const mockDelete = jest.fn();

jest.mock('../../../src/api/registry', () => ({
  requireApiClient: () => ({
    api: {
      meAiCredentialsList: mockList,
      meAiCredentialsDiscover: mockDiscover,
      meAiCredentialsCreate: mockCreate,
      meAiCredentialsDelete: mockDelete,
    },
  }),
}));

const CREDENTIAL_ID = 'cab04e7c-ee2b-5de7-bc49-f60472fe7292';

const CREDENTIAL: CredentialDto = {
  id: CREDENTIAL_ID,
  provider: 'mistral',
  providerLabel: 'Mistral',
  label: 'Mistral',
  baseUrl: null,
  modelIds: ['mistral-large', 'mistral-small'],
  keyMasked: 'sk-…3f2a',
  status: 'qualified',
  outsideEu: false,
  dataNote: 'Traité dans l’Union européenne.',
  qualifiedAt: '2026-11-11T12:20:00.000Z',
  createdAt: '2026-11-11T12:20:00.000Z',
};

const METRICS = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 24, left: 0, right: 0, bottom: 24 },
};

async function renderClesIa(): Promise<void> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <ClesIaScreen onBack={jest.fn()} onOpenModels={jest.fn()} />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => {
    expect(screen.getByTestId('qf-cles-ia-form')).toBeTruthy();
  });
}

function firstCallBody(mock: jest.Mock): Record<string, unknown> {
  const calls = mock.mock.calls as unknown as [{ body: Record<string, unknown> }][];
  const call = calls[0]?.[0];
  if (call === undefined) throw new Error('mutation non appelée');
  return call.body;
}

describe('[quickfix mr-c] clés d’IA personnelles', () => {
  beforeEach(() => {
    mockList.mockReset();
    mockDiscover.mockReset();
    mockCreate.mockReset();
    mockDelete.mockReset();
    mockList.mockResolvedValue({ items: [] });
    mockDiscover.mockResolvedValue({ modelIds: ['mistral-large', 'mistral-small'] });
    mockCreate.mockResolvedValue(CREDENTIAL);
    mockDelete.mockResolvedValue(undefined);
  });

  it('teste la clé puis l’enregistre auprès du fournisseur choisi', async () => {
    await renderClesIa();
    await waitFor(() => {
      expect(screen.getByTestId('qf-cles-ia-keys-empty')).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId('qf-cles-ia-provider-mistral'));
    await fireEvent.changeText(screen.getByTestId('qf-cles-ia-key'), 'sk-test-123456');
    await fireEvent.press(screen.getByTestId('qf-cles-ia-test'));

    await waitFor(() => {
      expect(screen.getByTestId('qf-cles-ia-test-ok')).toHaveTextContent('Clé valide · 2 modèles');
    });
    expect(screen.getByTestId('qf-cles-ia-models')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('qf-cles-ia-save'));
    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });
    expect(firstCallBody(mockCreate)).toEqual({
      provider: 'mistral',
      modelIds: ['mistral-large', 'mistral-small'],
      apiKey: 'sk-test-123456',
    });
    expect(mockDiscover).toHaveBeenCalledWith({
      body: { provider: 'mistral', apiKey: 'sk-test-123456' },
    });
  });

  it('affiche le masque d’une clé enregistrée et la supprime après confirmation', async () => {
    mockList.mockResolvedValue({ items: [CREDENTIAL] });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const destructive = buttons?.find((button) => button.style === 'destructive');
      destructive?.onPress?.();
    });

    await renderClesIa();
    await waitFor(() => {
      expect(screen.getByTestId(`qf-cles-ia-key-${CREDENTIAL_ID}`)).toBeTruthy();
    });
    expect(screen.getByText('Votre clé · sk-…3f2a')).toBeTruthy();
    expect(screen.getByTestId(`qf-cles-ia-status-${CREDENTIAL_ID}`)).toHaveTextContent('Qualifié');

    await fireEvent.press(screen.getByTestId(`qf-cles-ia-delete-${CREDENTIAL_ID}`));
    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith({ params: { id: CREDENTIAL_ID } });
    });
    alert.mockRestore();
  });
});