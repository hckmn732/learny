// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { cleanup, renderComponent, screen } from '@learny/testing/render';

import { SuggestionGroup } from './SuggestionGroup';

afterEach(cleanup);

const suggestions = [
  { label: 'Utilisateur autonome', value: 'Utilisateur autonome', description: 'Au quotidien', multi: true },
  { label: 'Certification SAP', value: 'Certification SAP', description: null, multi: true },
];

describe('[SPEC-604] SuggestionGroup', () => {
  it('CA-3 — un choix multiple bascule la sélection et expose aria-pressed', async () => {
    const onToggle = vi.fn();
    const { user } = renderComponent(
      <SuggestionGroup
        multi
        onPick={() => undefined}
        onToggle={onToggle}
        selected={new Set(['Certification SAP'])}
        suggestions={suggestions}
      />,
    );
    const group = screen.getByRole('group', { name: 'Réponses proposées' });
    expect(group).toBeTruthy();
    const selected = screen.getByTestId('cadrage-suggestion-Certification SAP');
    expect(selected.getAttribute('aria-pressed')).toBe('true');
    expect(
      screen.getByTestId('cadrage-suggestion-Utilisateur autonome').getAttribute('aria-pressed'),
    ).toBe('false');
    await user.click(screen.getByTestId('cadrage-suggestion-Utilisateur autonome'));
    expect(onToggle).toHaveBeenCalledWith('Utilisateur autonome');
  });

  it('EF-6 — un choix simple envoie immédiatement le libellé', async () => {
    const onPick = vi.fn();
    const { user } = renderComponent(
      <SuggestionGroup
        multi={false}
        onPick={onPick}
        onToggle={() => undefined}
        selected={new Set()}
        suggestions={suggestions}
      />,
    );
    await user.click(screen.getByTestId('cadrage-suggestion-Utilisateur autonome'));
    expect(onPick).toHaveBeenCalledWith('Utilisateur autonome');
  });
});
