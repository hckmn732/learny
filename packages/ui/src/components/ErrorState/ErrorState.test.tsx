// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearToasts, getToasts } from '../Toast/store';

import { ErrorState } from './ErrorState';

const writeText = vi.fn<() => Promise<void>>();

beforeEach(() => {
  clearToasts();
  writeText.mockReset();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
});

afterEach(cleanup);

describe('[SPEC-303] ErrorState', () => {
  it('annonce le titre, propose Réessayer et affiche la référence (CA-5)', () => {
    const retry = vi.fn();
    render(<ErrorState data-testid="error" onRetry={retry} requestId="req_demo_0001" />);
    const error = screen.getByTestId('error');
    expect(error.getAttribute('role')).toBe('alert');
    expect(screen.getByRole('heading', { name: 'Impossible de charger ces données' })).toBeTruthy();
    expect(screen.getByText('Vérifiez votre connexion puis réessayez.')).toBeTruthy();
    expect(screen.getByText('req_demo_0001').tagName).toBe('CODE');
    expect(screen.getByText('req_demo_0001').className).toContain('font-mono');
    screen.getByRole('button', { name: 'Réessayer' }).click();
    expect(retry).toHaveBeenCalledOnce();
  });

  it('copie la référence et affiche le toast de succès (EF-14)', async () => {
    writeText.mockResolvedValue();
    render(<ErrorState requestId="req_demo_0001" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copier' }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('req_demo_0001');
    });
    await waitFor(() => {
      expect(getToasts().map((record) => record.title)).toContain('Référence copiée');
    });
  });

  it('signale le refus de copie et sélectionne la référence (CL-9)', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    render(<ErrorState requestId="req_demo_0001" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copier' }));
    expect(
      await screen.findByText('Copie impossible : sélectionnez la référence manuellement.'),
    ).toBeTruthy();
    await waitFor(() => {
      expect(window.getSelection()?.toString()).toBe('req_demo_0001');
    });
  });
});
