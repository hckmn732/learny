// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { resultFixture } from './fixture';
import { ResultActions } from './ResultActions';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

afterEach(cleanup);

function renderActions(overrides: Parameters<typeof resultFixture>[0] = {}) {
  return render(
    <ResultActions
      courseHref="/formations/f/modules/m/cours"
      formationId="f"
      homeHref="/accueil"
      moduleId="m"
      remediationHref="/formations/f/modules/m/remediation"
      result={resultFixture(overrides)}
    />,
  );
}

describe('[SPEC-715] actions du résultat', () => {
  it('CA-4, EF-6 — pendant le délai, le bouton est désactivé et la date est affichée', () => {
    renderActions();
    const retry = screen.getByTestId('quiz-retry');
    expect(retry).toHaveProperty('disabled', true);
    expect(retry.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByTestId('quiz-retry-available-at').textContent).toContain(
      'Nouvelle tentative possible mercredi 11 nov. à 14:00.',
    );
    expect(screen.getByTestId('quiz-retry-settings').getAttribute('href')).toBe(
      '/parametres#automatismes',
    );
    expect(screen.getByTestId('quiz-remediation').getAttribute('href')).toBe(
      '/formations/f/modules/m/remediation',
    );
  });

  it('CA-3, EF-6 — le mode obligatoire annonce la remédiation préalable', () => {
    renderActions({
      retry: {
        ...resultFixture().retry,
        remediationRequired: true,
        allowed: false,
      },
    });
    expect(screen.getByTestId('quiz-retry-available-at').textContent).toContain(
      'Nouvelle tentative possible après la remédiation, au plus tôt mercredi 11 nov. à 14:00.',
    );
  });

  it('CA-5, EF-9 — après l’annulation, le bouton redevient actif et le texte disparaît', () => {
    renderActions({
      retry: {
        allowed: true,
        availableAt: null,
        reason: null,
        remediationRequired: false,
        remediationDone: false,
      },
    });
    const retry = screen.getByTestId('quiz-retry');
    expect(retry).toHaveProperty('disabled', false);
    expect(retry.getAttribute('aria-disabled')).toBe('false');
    expect(screen.queryByTestId('quiz-retry-available-at')).toBeNull();
  });
});
