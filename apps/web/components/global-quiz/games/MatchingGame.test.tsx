// @vitest-environment jsdom
// Association game interactions (SPEC-702 EF-1, EF-5, CA-1, CA-2, CA-6).
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ReviewMatchingResponse } from '@learny/contracts';

import { MatchingGame } from './MatchingGame';
import { gameItem, gameResult } from './test-fixtures';

const PAYLOAD = {
  instruction: 'Notions de base SAP : reliez chaque notion à sa définition.',
  lefts: [
    { id: 'p1', text: 'Société' },
    { id: 'p2', text: 'Plan comptable' },
  ],
  rights: [
    { id: 'r1', text: 'Entité juridique qui tient sa propre comptabilité' },
    { id: 'r2', text: 'Liste des comptes généraux utilisables' },
  ],
  sources: [],
};

afterEach(() => {
  cleanup();
});

function rightTile(text: RegExp): HTMLElement {
  return screen.getByRole('button', { name: text });
}

describe('[SPEC-702] MatchingGame', () => {
  it('forme, déplace et efface les paires avant vérification (EF-1)', () => {
    const onSubmit = vi.fn();
    render(<MatchingGame item={gameItem('matching', PAYLOAD)} onSubmit={onSubmit} result={null} />);
    expect(screen.getByTestId('game-matching')).toBeTruthy();
    expect(
      screen.getByText('Touchez une notion, puis la définition qui lui correspond.'),
    ).toBeTruthy();
    expect(screen.getByTestId('matching-verify').hasAttribute('disabled')).toBe(true);
    expect(screen.getByTestId('matching-left-1').getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(screen.getByTestId('matching-left-1'));
    expect(screen.getByTestId('matching-left-1').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(rightTile(/Liste des comptes généraux/));
    expect(rightTile(/Liste des comptes généraux/).getAttribute('aria-label')).toBe(
      'Liste des comptes généraux utilisables, associée au terme 1',
    );
    expect(screen.getByTestId('matching-verify').hasAttribute('disabled')).toBe(true);

    // Réassocier le terme 1 à l'autre définition déplace la paire.
    fireEvent.click(screen.getByTestId('matching-left-1'));
    fireEvent.click(rightTile(/Entité juridique/));
    expect(rightTile(/Liste des comptes généraux/).getAttribute('aria-label')).toContain(
      'non associée',
    );

    fireEvent.click(screen.getByTestId('matching-left-2'));
    fireEvent.click(rightTile(/Liste des comptes généraux/));
    expect(screen.getByTestId('matching-verify').hasAttribute('disabled')).toBe(false);

    // « Recommencer » efface toutes les paires avant vérification.
    fireEvent.click(screen.getByTestId('matching-reset'));
    expect(screen.getByTestId('matching-verify').hasAttribute('disabled')).toBe(true);
    expect(rightTile(/Entité juridique/).getAttribute('aria-label')).toContain('non associée');

    fireEvent.click(screen.getByTestId('matching-left-1'));
    fireEvent.click(rightTile(/Entité juridique/));
    fireEvent.click(screen.getByTestId('matching-left-2'));
    fireEvent.click(rightTile(/Liste des comptes généraux/));
    fireEvent.click(screen.getByTestId('matching-verify'));
    const response = onSubmit.mock.calls[0]?.[0] as ReviewMatchingResponse;
    expect(response.pairs).toEqual([
      { leftId: 'p1', rightId: 'r1' },
      { leftId: 'p2', rightId: 'r2' },
    ]);
  });

  it('colore juste/faux, affiche « Attendu : » et verrouille la réponse (EF-5, CA-6)', () => {
    const result = gameResult({
      isCorrect: false,
      explanation: 'La société porte les comptes, le plan comptable les liste.',
      correction: {
        kind: 'matching',
        pairs: [
          {
            leftId: 'p1',
            rightId: 'r2',
            ok: false,
            expectedRightId: 'r1',
            expectedLeftLabel: 'Société',
          },
          {
            leftId: 'p2',
            rightId: 'r1',
            ok: false,
            expectedRightId: 'r2',
            expectedLeftLabel: 'Plan comptable',
          },
        ],
      },
    });
    render(
      <MatchingGame
        item={gameItem('matching', PAYLOAD, { state: 'answered', result })}
        onSubmit={vi.fn()}
        result={result}
      />,
    );
    expect(screen.getByText('Attendu : Société')).toBeTruthy();
    expect(screen.getByText('Attendu : Plan comptable')).toBeTruthy();
    expect(screen.getByTestId('game-explanation').textContent).toContain(
      'La société porte les comptes',
    );
    expect(screen.getByTestId('matching-left-1').className).toContain('bg-orange-soft');
    expect(screen.getByTestId('matching-verify').hasAttribute('disabled')).toBe(true);
    expect(screen.getByTestId('matching-reset').hasAttribute('disabled')).toBe(true);
    expect(screen.getByTestId('matching-left-1').hasAttribute('disabled')).toBe(true);
    // WCAG 1.4.1 — la couleur est doublée d'un texte lu par les lecteurs d'écran.
    expect(screen.getAllByText('Faux')).toHaveLength(4);
  });
});
