// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderComponent } from '@learny/testing/render';

import { clearToasts, dismissToast, getToasts, toast } from './store';
import { ToastProvider } from './Toast';

beforeEach(() => {
  clearToasts();
});

afterEach(() => {
  cleanup();
  clearToasts();
  vi.useRealTimers();
});

describe('[SPEC-303] toast', () => {
  it('conserve au plus trois messages, le plus ancien disparaît (CL-8)', () => {
    toast({ title: 'Un' });
    toast({ title: 'Deux' });
    toast({ title: 'Trois' });
    toast({ title: 'Quatre' });
    expect(getToasts().map((record) => record.title)).toEqual(['Deux', 'Trois', 'Quatre']);
    dismissToast(3);
    expect(getToasts().map((record) => record.title)).toEqual(['Deux', 'Quatre']);
  });

  it('applique 5 000 ms, ou 8 000 ms avec une action (EF-10)', () => {
    toast({ title: 'Standard' });
    toast({ title: 'Action', action: { label: 'Annuler', onClick: () => undefined } });
    toast({ title: 'Court', durationMs: 1200 });
    expect(getToasts().map((record) => record.duration)).toEqual([5000, 8000, 1200]);
    expect(getToasts()[0]?.tone).toBe('neutral');
  });

  it('annonce les erreurs de manière assertive et les succès poliment (CA-4)', async () => {
    renderComponent(
      <ToastProvider>
        <div />
      </ToastProvider>,
    );
    act(() => {
      toast({ title: 'La synchronisation a échoué', tone: 'error' });
    });
    await screen.findByText('La synchronisation a échoué');
    await waitFor(() => {
      const status = screen
        .getAllByRole('status')
        .find((node) => node.textContent.includes('La synchronisation a échoué'));
      expect(status?.getAttribute('aria-live')).toBe('assertive');
    });
    const errorToast = screen.getByTestId('ui-toast-error');
    expect(errorToast.className).toContain('bg-ink');
    expect(errorToast.querySelector('span[aria-hidden="true"]')?.className).toContain('bg-orange');

    act(() => {
      toast({ title: 'Révision enregistrée', tone: 'success' });
    });
    await screen.findByText('Révision enregistrée');
    await waitFor(() => {
      const status = screen
        .getAllByRole('status')
        .find((node) => node.textContent.includes('Révision enregistrée'));
      expect(status?.getAttribute('aria-live')).toBe('polite');
    });
    expect(
      screen.getByTestId('ui-toast-success').querySelector('span[aria-hidden="true"]')?.className,
    ).toContain('bg-lime');
  });

  it('se ferme après 5 000 ms simulées (CA-4)', () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <div />
      </ToastProvider>,
    );
    act(() => {
      toast({ title: 'Éphémère' });
    });
    expect(screen.getByText('Éphémère')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(screen.getByText('Éphémère')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText('Éphémère')).toBeNull();
  });
});
