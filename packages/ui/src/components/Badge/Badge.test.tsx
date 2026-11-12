// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { renderComponent } from '@learny/testing/render';

import { Badge } from './Badge';

afterEach(cleanup);

describe('[SPEC-302] Badge', () => {
  it('applique les neuf tons et les deux tailles (EF-12)', () => {
    const cases = [
      ['neutral', 'bg-canvas'],
      ['lime', 'bg-lime'],
      ['lime-soft', 'bg-lime-softer'],
      ['indigo', 'bg-indigo-soft'],
      ['green', 'bg-green-soft'],
      ['orange', 'bg-orange-soft'],
      ['violet', 'bg-violet-soft'],
      ['on-dark', 'bg-dark-700'],
      ['default-model', 'bg-surface-muted'],
    ] as const;

    for (const [tone, colour] of cases) {
      const { unmount } = renderComponent(
        <Badge data-testid={`badge-${tone}`} tone={tone}>
          État
        </Badge>,
      );
      expect(screen.getByTestId(`badge-${tone}`).className, tone).toContain(colour);
      unmount();
    }

    renderComponent(
      <Badge data-testid="badge-sm" size="sm" tone="lime">
        État
      </Badge>,
    );
    expect(screen.getByTestId('badge-sm').className).toContain('px-8');
    expect(screen.getByTestId('badge-sm').className).toContain('font-600');
  });
});
