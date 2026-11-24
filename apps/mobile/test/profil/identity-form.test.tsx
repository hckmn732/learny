// Jest + RNTL [SPEC-3401] — écran Identité (EF-3, EF-4, CL-1 ; BR-ACC-05, BR-ACC-12, BR-SET-02).
//
// The save is proven twice: the patch carries the version the screen read (BR-SET-02), and a 409
// reloads the settings and shows the sentence of CL-1 instead of a silent failure.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppError } from '@learny/core';

import { IdentityScreen } from '../../src/features/profil/IdentityScreen';

import { SETTINGS } from './fixtures';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
const mockUpdate = jest.fn();
let mockSettings = SETTINGS;

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
}));

jest.mock('../../src/api/registry', () => ({
  requireApiClient: () => ({
    api: {
      meProfileGet: () => Promise.resolve(mockSettings),
      meProfileUpdate: mockUpdate,
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

async function renderIdentity(): Promise<void> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <IdentityScreen />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => {
    expect(screen.getByTestId('identity-first-name')).toBeTruthy();
  });
}

describe('[SPEC-3401] écran Identité', () => {
  beforeEach(() => {
    mockSettings = SETTINGS;
    mockUpdate.mockReset();
    mockUpdate.mockImplementation(() => Promise.resolve(SETTINGS));
  });

  it('reprend les valeurs du profil et n’active « Enregistrer » qu’après modification (EF-3)', async () => {
    await renderIdentity();
    expect(screen.getByTestId('identity-first-name')).toHaveDisplayValue('Alex');
    expect(screen.getByTestId('identity-last-name')).toHaveDisplayValue('Perrin');
    expect(screen.getByTestId('identity-email')).toHaveDisplayValue('alex.perrin@demo.learny.test');
    expect(screen.getByTestId('settings-save')).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('identity-first-name'), 'Alexandre');
    expect(screen.getByTestId('settings-save')).toBeEnabled();
  });

  it('laisse l’e-mail en lecture seule (BR-ACC-12)', async () => {
    await renderIdentity();
    expect(screen.getByTestId('identity-email').props.editable).toBe(false);
  });

  it('enregistre le ton et la langue avec la version attendue (CA-2, BR-SET-02)', async () => {
    await renderIdentity();
    await fireEvent.press(screen.getByTestId('identity-tone-control-tu'));
    await fireEvent.press(screen.getByTestId('identity-language-control-en'));
    await fireEvent.press(screen.getByTestId('settings-save'));
    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledTimes(1);
    });
    expect(firstCall(mockUpdate)).toEqual({
      body: {
        firstName: 'Alex',
        lastName: 'Perrin',
        tutorTone: 'tu',
        courseLanguage: 'en',
        expectedUpdatedAt: SETTINGS.updatedAt,
      },
    });
    await waitFor(() => {
      expect(screen.getByTestId('identity-toast')).toBeTruthy();
    });
  });

  it('recharge et explique un conflit de version (CL-1, CA-2)', async () => {
    mockUpdate.mockImplementation(() =>
      Promise.reject(new AppError('CONFLICT', 'version périmée', { status: 409 })),
    );
    await renderIdentity();
    await fireEvent.changeText(screen.getByTestId('identity-last-name'), 'Perrin-Durand');
    await fireEvent.press(screen.getByTestId('settings-save'));
    await waitFor(() => {
      expect(screen.getByTestId('identity-error-message')).toHaveTextContent(
        'Vos réglages ont changé ailleurs. Nous avons rechargé la dernière version.',
      );
    });
  });

  it('signale un prénom vide (BR-ACC-12)', async () => {
    await renderIdentity();
    await fireEvent.changeText(screen.getByTestId('identity-first-name'), ' ');
    await waitFor(() => {
      expect(screen.getByTestId('identity-first-name-error')).toBeTruthy();
    });
  });
});
