// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { renderComponent } from '@learny/testing/render';

import { CountBadge } from './CountBadge';

afterEach(cleanup);

describe('[SPEC-302] CountBadge', () => {
  it('affiche la valeur et la tronque à 99+ (EF-13)', () => {
    const { rerender } = renderComponent(<CountBadge data-testid="compteur" value={14} />);
    expect(screen.getByTestId('compteur').textContent).toBe('14');
    rerender(<CountBadge data-testid="compteur" value={120} />);
    expect(screen.getByTestId('compteur').textContent).toBe('99+');
  });

  it('ton orange sur fond sombre', () => {
    renderComponent(<CountBadge data-testid="compteur" tone="orange-on-dark" value={3} />);
    const badge = screen.getByTestId('compteur');
    expect(badge.className).toContain('bg-orange-dark');
    expect(badge.className).toContain('text-orange-on-dark');
  });
});
