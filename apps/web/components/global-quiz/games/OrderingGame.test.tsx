// @vitest-environment jsdom
// Remise en ordre interactions and focus (SPEC-702 EF-2, EF-6, CA-3).
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ReviewOrderingResponse } from '@learny/contracts';

import { OrderingGame } from './OrderingGame';
import { gameItem, gameResult } from './test-fixtures';

const PAYLOAD = {
  instruction: 'Remettez les niveaux de l’organisation SAP dans l’ordre.',
  items: [
    { id: 'o1', text: 'Société' },
    { id: 'o2', text: 'Magasin' },
    { id: 'o3', text: 'Mandant' },
    { id: 'o4', text: 'Division' },
  ],
  sources: [],
};

afterEach(() => {
  cleanup();
});

describe('[SPEC-702] OrderingGame', () => {
  it('permute avec Monter/Descendre, désactive les extrémités et suit le focus (EF-2, EF-6)', () => {
    const onSubmit = vi.fn();
    render(<OrderingGame item={gameItem('ordering', PAYLOAD)} onSubmit={onSubmit} result={null} />);
    expect(screen.getByTestId('game-ordering').textContent).toContain(
      'Remettez les niveaux de l’organisation SAP dans l’ordre.',
    );
    expect(screen.getByTestId('ordering-up-1').hasAttribute('disabled')).toBe(true);
    expect(screen.getByTestId('ordering-down-4').hasAttribute('disabled')).toBe(true);
    expect(screen.getByTestId('ordering-item-1').textContent).toContain('1Société');
    expect(screen.getByTestId('ordering-up-1').getAttribute('aria-label')).toBe('Monter');
    expect(screen.getByTestId('ordering-down-1').getAttribute('aria-label')).toBe('Descendre');

    fireEvent.click(screen.getByTestId('ordering-up-2'));
    expect(screen.getByTestId('ordering-item-1').textContent).toContain('Magasin');
    // Le bouton « Monter » de l'élément déplacé est désactivé en tête : le focus passe à « Descendre ».
    expect(document.activeElement).toBe(screen.getByTestId('ordering-down-1'));
    expect(screen.getByTestId('ordering-up-1').hasAttribute('disabled')).toBe(true);

    fireEvent.click(screen.getByTestId('ordering-down-4'));
    expect(screen.getByTestId('ordering-down-4').hasAttribute('disabled')).toBe(true);

    fireEvent.click(screen.getByTestId('ordering-verify'));
    const response = onSubmit.mock.calls[0]?.[0] as ReviewOrderingResponse;
    expect(response.order).toHaveLength(4);
    expect(new Set(response.order)).toEqual(new Set(['o1', 'o2', 'o3', 'o4']));
  });

  it('affiche « Position attendue : n » sur chaque ligne fausse et verrouille (EF-5, CA-3)', () => {
    const result = gameResult({
      isCorrect: false,
      explanation: 'Le mandant contient les sociétés, puis les divisions et les magasins.',
      correction: {
        kind: 'ordering',
        rows: [
          { stepId: 'o3', position: 1, ok: true, expectedPosition: 1 },
          { stepId: 'o1', position: 2, ok: true, expectedPosition: 2 },
          { stepId: 'o2', position: 3, ok: false, expectedPosition: 4 },
          { stepId: 'o4', position: 4, ok: false, expectedPosition: 3 },
        ],
      },
    });
    render(
      <OrderingGame
        item={gameItem('ordering', PAYLOAD, { state: 'answered', result })}
        onSubmit={vi.fn()}
        result={result}
      />,
    );
    expect(screen.getByTestId('ordering-item-1').textContent).toContain('Mandant');
    expect(screen.getAllByText('Position attendue : 4')).toHaveLength(1);
    expect(screen.getAllByText('Position attendue : 3')).toHaveLength(1);
    expect(screen.getByTestId('ordering-item-3').className).toContain('bg-orange-soft');
    expect(screen.getByTestId('ordering-item-1').className).toContain('bg-green-soft');
    expect(screen.getByTestId('ordering-up-2').hasAttribute('disabled')).toBe(true);
  });
});
