// @vitest-environment jsdom
// Classement interactions and correction (SPEC-702 EF-3, EF-5, CA-4).
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ReviewCategorizationResponse } from '@learny/contracts';

import { CategorizationGame } from './CategorizationGame';
import { gameItem, gameResult } from './test-fixtures';

const PAYLOAD = {
  instruction: 'Classez chaque élément : donnée de base ou opération ?',
  categories: [
    { id: 'c1', label: 'Donnée de base' },
    { id: 'c2', label: 'Opération' },
  ],
  items: [
    { id: 'i1', text: 'Compte général' },
    { id: 'i2', text: 'Facture d’achat' },
  ],
  sources: [],
};

afterEach(() => {
  cleanup();
});

describe('[SPEC-702] CategorizationGame', () => {
  it('désactive Vérifier tant que tout n’est pas classé et remplit les zones (EF-3, CA-4)', () => {
    const onSubmit = vi.fn();
    render(
      <CategorizationGame
        item={gameItem('categorization', PAYLOAD)}
        onSubmit={onSubmit}
        result={null}
      />,
    );
    expect(screen.getByTestId('game-categorization').textContent).toContain(
      'Classez chaque élément : donnée de base ou opération ?',
    );
    expect(screen.getByTestId('categorization-verify').hasAttribute('disabled')).toBe(true);
    expect(screen.getByTestId('categorization-bucket-1').textContent).toContain('Donnée de base');
    expect(screen.getByTestId('categorization-bucket-2').textContent).toContain('Opération');
    const group = screen.getByRole('group', { name: 'Compte général' });
    expect(group.getAttribute('role')).toBe('group');

    fireEvent.click(screen.getByTestId('categorization-choice-1-1'));
    expect(screen.getByTestId('categorization-bucket-1').textContent).toContain('Compte général');
    expect(screen.getByTestId('categorization-choice-1-1').getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByTestId('categorization-verify').hasAttribute('disabled')).toBe(true);

    fireEvent.click(screen.getByTestId('categorization-choice-2-2'));
    expect(screen.getByTestId('categorization-bucket-2').textContent).toContain('Facture d’achat');
    expect(screen.getByTestId('categorization-verify').hasAttribute('disabled')).toBe(false);

    fireEvent.click(screen.getByTestId('categorization-verify'));
    const response = onSubmit.mock.calls[0]?.[0] as ReviewCategorizationResponse;
    expect(response.assignments).toEqual([
      { itemId: 'i1', categoryId: 'c1' },
      { itemId: 'i2', categoryId: 'c2' },
    ]);
  });

  it('affiche « Attendu : {catégorie} » et verrouille (EF-5, CA-4)', () => {
    const result = gameResult({
      isCorrect: false,
      explanation:
        'Les données de base décrivent les objets ; les opérations les mettent en mouvement.',
      correction: {
        kind: 'categorization',
        rows: [
          {
            itemId: 'i1',
            categoryId: 'c1',
            ok: true,
            expectedCategoryId: 'c1',
            expectedCategoryLabel: 'Donnée de base',
          },
          {
            itemId: 'i2',
            categoryId: 'c1',
            ok: false,
            expectedCategoryId: 'c2',
            expectedCategoryLabel: 'Opération',
          },
        ],
      },
    });
    render(
      <CategorizationGame
        item={gameItem('categorization', PAYLOAD, { state: 'answered', result })}
        onSubmit={vi.fn()}
        result={result}
      />,
    );
    expect(screen.getByText('Attendu : Opération')).toBeTruthy();
    expect(screen.getByTestId('categorization-row-2').className).toContain('bg-orange-soft');
    expect(screen.getByTestId('categorization-row-1').className).toContain('bg-green-soft');
    expect(screen.getByTestId('categorization-choice-1-1').hasAttribute('disabled')).toBe(true);
    expect(screen.getByTestId('categorization-verify').hasAttribute('disabled')).toBe(true);
  });
});
