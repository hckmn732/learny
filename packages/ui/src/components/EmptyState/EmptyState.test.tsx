// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import { Inbox } from 'lucide-react';
import { afterEach, describe, expect, it } from 'vitest';

import { renderComponent } from '@learny/testing/render';

import { EmptyState } from './EmptyState';

afterEach(cleanup);

describe('[SPEC-303] EmptyState', () => {
  it('présente pictogramme, titre et description (EF-12)', () => {
    renderComponent(
      <EmptyState
        action={<button type="button">Agir</button>}
        data-testid="empty"
        description="Le prochain quiz les réactivera."
        icon={Inbox}
        title="Aucune lacune en attente"
      />,
    );
    const empty = screen.getByTestId('empty');
    expect(
      screen.getByRole('heading', { level: 2, name: 'Aucune lacune en attente' }),
    ).toBeTruthy();
    expect(screen.getByText('Le prochain quiz les réactivera.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Agir' })).toBeTruthy();
    const picture = empty.querySelector('span[aria-hidden="true"]');
    expect(picture?.className).toContain('size-64');
    expect(picture?.className).toContain('rounded-20');
    expect(picture?.className).toContain('bg-lime-softer');
  });

  it('variante compacte : texte seul centré (EF-12)', () => {
    renderComponent(
      <EmptyState
        compact
        data-testid="empty-compact"
        title="Vous avez tout lu pour aujourd’hui."
      />,
    );
    const compact = screen.getByTestId('empty-compact');
    expect(compact.textContent).toBe('Vous avez tout lu pour aujourd’hui.');
    expect(compact.className).toContain('text-14');
    expect(compact.className).toContain('text-ink-muted');
    expect(compact.querySelector('h2')).toBeNull();
  });
});
