// @vitest-environment jsdom
// Texte à trous interactions, Enter and expected answers (SPEC-702 EF-4, EF-6, CA-5).
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ReviewClozeResponse } from '@learny/contracts';

import { ClozeGame } from './ClozeGame';
import { gameItem, gameResult } from './test-fixtures';

const PAYLOAD = {
  template:
    'Dans SAP Fiori, chaque application s’ouvre depuis une {{1}} du launchpad, et une société tient sa comptabilité dans sa devise {{2}}.',
  gaps: [
    { id: 1, hint: 'Élément du launchpad' },
    { id: 2, hint: 'Devise de tenue des comptes' },
  ],
  sources: [],
};

afterEach(() => {
  cleanup();
});

describe('[SPEC-702] ClozeGame', () => {
  it('accepte la saisie, active Vérifier seulement quand tout est rempli et Entrée vérifie (EF-4, EF-6)', () => {
    const onSubmit = vi.fn();
    render(<ClozeGame item={gameItem('cloze', PAYLOAD)} onSubmit={onSubmit} result={null} />);
    expect(screen.getByTestId('game-cloze').textContent).toContain(
      'Complétez de tête, sans liste de choix.',
    );
    expect(screen.getByRole('textbox', { name: 'Premier mot manquant' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Second mot manquant' })).toBeTruthy();
    expect(screen.getByTestId('cloze-verify').hasAttribute('disabled')).toBe(true);

    fireEvent.change(screen.getByTestId('cloze-gap-1'), { target: { value: 'Tuile' } });
    expect(screen.getByTestId('cloze-verify').hasAttribute('disabled')).toBe(true);
    fireEvent.change(screen.getByTestId('cloze-gap-2'), { target: { value: 'INTERNE' } });
    expect(screen.getByTestId('cloze-verify').hasAttribute('disabled')).toBe(false);
    expect(screen.queryByTestId('cloze-expected')).toBeNull();

    // Entrée dans le dernier trou déclenche Vérifier.
    fireEvent.keyDown(screen.getByTestId('cloze-gap-2'), { key: 'Enter' });
    const response = onSubmit.mock.calls[0]?.[0] as ReviewClozeResponse;
    expect(response.gaps).toEqual([
      { gapId: '1', value: 'Tuile' },
      { gapId: '2', value: 'INTERNE' },
    ]);
  });

  it('affiche « Réponses attendues : tuile et interne. » et verrouille (EF-4, EF-5, CA-5)', () => {
    const result = gameResult({
      isCorrect: false,
      explanation: 'La tuile ouvre l’application ; la devise interne porte la comptabilité.',
      correction: {
        kind: 'cloze',
        gaps: [
          { gapId: '1', ok: true, expected: 'tuile', given: 'Tuile' },
          { gapId: '2', ok: false, expected: 'interne', given: 'tuille' },
        ],
      },
    });
    render(
      <ClozeGame
        item={gameItem('cloze', PAYLOAD, { state: 'answered', result })}
        onSubmit={vi.fn()}
        result={result}
      />,
    );
    const expected = screen.getByTestId('cloze-expected');
    expect(expected.textContent).toBe('Réponses attendues : tuile et interne.');
    expect(expected.querySelectorAll('strong')).toHaveLength(2);
    expect(screen.getByTestId('cloze-gap-1').className).toContain('bg-green-soft');
    expect(screen.getByTestId('cloze-gap-2').className).toContain('bg-orange-soft');
    expect(screen.getByTestId<HTMLInputElement>('cloze-gap-1').disabled).toBe(true);
    expect(screen.getByTestId('cloze-verify').hasAttribute('disabled')).toBe(true);
    expect(screen.getByTestId('game-explanation').textContent).toContain('La tuile ouvre');
  });
});
