// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { resultFixture } from './fixture';
import { ScoreCard } from './ScoreCard';

afterEach(cleanup);

describe('[SPEC-612] carte score', () => {
  it('CA-1 — un échec affiche 72 %, le seuil, le statut et les 8 points manquants', () => {
    render(<ScoreCard currentModulePosition={3} result={resultFixture()} />);
    expect(screen.getByTestId('result-score')).toBeTruthy();
    expect(screen.getByTestId('result-status').textContent).toBe('Pas encore validé');
    expect(screen.getByTestId('result-headline').textContent).toBe('Encore 8 points pour valider.');
    expect(screen.getByTestId('result-threshold-caption').textContent).toBe('trait : seuil 80 %');
    expect(screen.getAllByText('72 %').length).toBeGreaterThan(0);
  });

  it('CA-2 — une réussite affiche le module suivant et le texte des notions fragiles', () => {
    render(
      <ScoreCard
        currentModulePosition={3}
        result={resultFixture({
          attemptNo: 3,
          score: 84,
          passed: true,
          pointsMissing: null,
          gaps: [],
        })}
      />,
    );
    expect(screen.getByTestId('result-status').textContent).toBe('Module validé');
    expect(screen.getByTestId('result-headline').textContent).toBe('Le module 4 est débloqué.');
    expect(screen.getByText(/aucune ne reste fragile/)).toBeTruthy();
  });
});
