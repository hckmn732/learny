// @vitest-environment jsdom
// Unit tests of the duration switch (SPEC-703 EF-1, ET-6, ET-7; CA-1).
//
// The component replaces the URL without adding a history entry, keeps a group of pressed buttons
// (never tabs) and announces the loaded mode through `aria-live`.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SessionModeSwitch } from './SessionModeSwitch';

const router = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/formations/fid/quiz-global',
}));

afterEach(() => {
  cleanup();
  router.replace.mockReset();
});

const PROPS = {
  fullMinutes: 10,
  microMinutes: 5,
  note: 'Version courte de secours : une carte de rappel et une question.',
} as const;

describe('[SPEC-703] SessionModeSwitch', () => {
  it('EF-1 — groupe de boutons pressés, jamais des onglets', () => {
    render(<SessionModeSwitch {...PROPS} mode="full" />);
    expect(screen.getByRole('group', { name: 'Durée de la séance' })).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.getByTestId('gq-mode-full').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('gq-mode-micro').getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByTestId('gq-mode-micro').textContent).toBe('Micro-séance · 5 min');
    expect(screen.getByTestId('gq-mode-micro').hasAttribute('disabled')).toBe(false);
  });

  it('EF-1, ET-6 — cliquer micro remplace l’URL sans entrée d’historique', () => {
    const onModeChange = vi.fn();
    render(<SessionModeSwitch {...PROPS} mode="full" onModeChange={onModeChange} />);
    fireEvent.click(screen.getByTestId('gq-mode-micro'));
    expect(onModeChange).toHaveBeenCalledWith('micro');
    expect(router.replace).toHaveBeenCalledWith('/formations/fid/quiz-global?mode=micro', {
      scroll: false,
    });
    expect(router.push).not.toHaveBeenCalled();
  });

  it('EF-1, ET-7 — l’état pressé suit le mode et l’annonce est polie', () => {
    const { rerender } = render(<SessionModeSwitch {...PROPS} mode="full" />);
    expect(screen.getByTestId('gq-mode-announcement').getAttribute('aria-live')).toBe('polite');
    expect(screen.getByTestId('gq-mode-announcement').textContent).toBe('');

    fireEvent.click(screen.getByTestId('gq-mode-micro'));
    expect(screen.getByTestId('gq-mode-announcement').textContent).toBe('Micro-séance chargée');
    rerender(<SessionModeSwitch {...PROPS} mode="micro" />);
    expect(screen.getByTestId('gq-mode-micro').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('gq-mode-full').getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(screen.getByTestId('gq-mode-full'));
    expect(router.replace).toHaveBeenLastCalledWith('/formations/fid/quiz-global', {
      scroll: false,
    });
    expect(screen.getByTestId('gq-mode-announcement').textContent).toBe('Séance complète chargée');
  });

  it('EF-1 — cliquer le mode déjà actif ne navigue pas', () => {
    render(<SessionModeSwitch {...PROPS} mode="micro" />);
    fireEvent.click(screen.getByTestId('gq-mode-micro'));
    expect(router.replace).not.toHaveBeenCalled();
  });
});
