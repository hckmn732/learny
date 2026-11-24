// Jest + RNTL [SPEC-3401] — écran Données et confidentialité (EF-6, CL-3, CA-4 ; BR-ACC-10/11).
//
// The export is requested once and its state is read back (the download link appears when the server
// has it) ; the deletion needs the word « SUPPRIMER », then shows the banner and the cancellation.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { PrivacyScreen } from '../../src/features/profil/PrivacyScreen';

import { EXPORT_DONE as mockExportDone, SETTINGS as mockSettingsBase } from './fixtures';

const mockRequest = jest.fn();
const mockExportRead = jest.fn();
const mockSchedule = jest.fn();
const mockCancel = jest.fn();
let mockSettings = mockSettingsBase;

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock('../../src/api/registry', () => ({
  requireApiClient: () => ({
    api: {
      meProfileGet: () => Promise.resolve(mockSettings),
      meExportRequest: mockRequest,
      meExportRead: mockExportRead,
      meDeletionSchedule: mockSchedule,
      meDeletionCancel: mockCancel,
    },
  }),
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 24, left: 0, right: 0, bottom: 24 },
};

async function renderPrivacy(readyTestID = 'privacy-export-state'): Promise<void> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <PrivacyScreen />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => {
    expect(screen.getByTestId(readyTestID)).toBeTruthy();
  });
}

describe('[SPEC-3401] écran Données et confidentialité', () => {
  beforeEach(() => {
    mockSettings = mockSettingsBase;
    mockRequest.mockReset();
    mockRequest.mockImplementation(() =>
      Promise.resolve({ exportId: mockExportDone.id, status: 'queued' }),
    );
    mockExportRead.mockReset();
    mockExportRead.mockImplementation(() => Promise.resolve(mockExportDone));
    mockSchedule.mockReset();
    mockSchedule.mockImplementation(() =>
      Promise.resolve({ scheduledFor: '2026-12-11T12:20:00.000Z' }),
    );
    mockCancel.mockReset();
    mockCancel.mockImplementation(() => Promise.resolve());
  });

  it('dit qu’aucun export n’a été demandé et propose d’en demander un (BR-ACC-10)', async () => {
    await renderPrivacy();
    expect(screen.getByTestId('privacy-export-state')).toHaveTextContent(
      /Aucun export demandé pour l’instant\./u,
    );
    expect(screen.getByTestId('export-request')).toBeEnabled();
  });

  it('demande l’export une seule fois et en affiche l’état (CL-3, CA-4)', async () => {
    await renderPrivacy();
    await fireEvent.press(screen.getByTestId('export-request'));
    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(mockExportRead).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByTestId('export-download')).toBeTruthy();
    });
  });

  it('n’offre pas de second export pendant une préparation (CL-3)', async () => {
    mockSettings = {
      ...mockSettingsBase,
      export: {
        id: mockExportDone.id,
        status: 'running',
        sizeBytes: null,
        createdAt: mockSettingsBase.updatedAt,
        expiresAt: null,
      },
    };
    mockExportRead.mockImplementation(() =>
      Promise.resolve({ ...mockExportDone, status: 'running', sizeBytes: null, expiresAt: null }),
    );
    await renderPrivacy();
    await waitFor(() => {
      expect(screen.getByTestId('privacy-export-state')).toHaveTextContent(/Export en cours\./u);
    });
    expect(screen.getByTestId('export-request')).toBeDisabled();
  });

  it('exige le mot SUPPRIMER avant de demander la suppression (EF-6, CA-4)', async () => {
    await renderPrivacy();
    expect(screen.getByTestId('deletion-submit')).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('deletion-confirm'), 'SUPPRIMER');
    expect(screen.getByTestId('deletion-submit')).toBeEnabled();
    await fireEvent.press(screen.getByTestId('deletion-submit'));
    await waitFor(() => {
      expect(mockSchedule).toHaveBeenCalledTimes(1);
    });
  });

  it('affiche le délai de 30 jours et l’annulation (BR-ACC-11)', async () => {
    mockSettings = { ...mockSettingsBase, deletionScheduledFor: '2026-12-11T12:20:00.000Z' };
    await renderPrivacy();
    await waitFor(() => {
      expect(screen.getByTestId('privacy-deletion-state')).toHaveTextContent(
        /Suppression programmée le 11\/12\/2026/u,
      );
    });
    await fireEvent.press(screen.getByTestId('deletion-cancel'));
    await waitFor(() => {
      expect(mockCancel).toHaveBeenCalledTimes(1);
    });
  });

  it('affiche la taille de l’archive prête (BR-ACC-10)', async () => {
    mockSettings = {
      ...mockSettingsBase,
      export: {
        id: mockExportDone.id,
        status: 'done',
        sizeBytes: 1_258_291,
        createdAt: mockSettingsBase.updatedAt,
        expiresAt: mockExportDone.expiresAt,
      },
    };
    await renderPrivacy();
    await waitFor(() => {
      expect(screen.getByTestId('privacy-export-size')).toHaveTextContent(/Taille : 1,2 Mo\./u);
    });
  });
});
