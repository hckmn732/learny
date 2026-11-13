// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RecallCardView } from '@learny/bricks/view';

import { cleanup, renderComponent, screen } from '../../test-render';

afterEach(cleanup);

const BRICK = {
  versionId: '00000000-0000-4000-8000-000000000503',
  type: 'recall_card' as const,
  notionLabels: [],
  publicPayload: {
    front: 'Que définit une variante d’exercice ?',
    back: 'Les périodes comptables et leurs dates.',
    sourceLabel: 'Guide FI, p. 4',
    sources: [],
  },
};

describe('[SPEC-503] vue carte de rappel', () => {
  it('retourne la carte avec Espace puis choisit une note avec 3 (EF-8)', async () => {
    const onChange = vi.fn();
    const { user } = renderComponent(
      <RecallCardView
        brick={BRICK}
        onChange={onChange}
        status="idle"
        value={null}
        variant="game"
      />,
    );
    expect(screen.getByTestId('brick-recall-front')).toBeTruthy();
    await user.keyboard(' ');
    expect(screen.queryByTestId('brick-recall-front')).toBeNull();
    expect(screen.getByTestId('brick-recall-back')).toBeTruthy();
    await user.keyboard('3');
    expect(onChange).toHaveBeenCalledWith({ selfGrade: 'good' });
  });

  it('affiche les échéances fournies et désactive l’animation en mouvement réduit (EF-8)', () => {
    renderComponent(
      <RecallCardView
        brick={BRICK}
        dueLabels={{ good: 'Vendredi' }}
        status="idle"
        value={{ selfGrade: 'good' }}
        variant="game"
      />,
    );
    expect(screen.getByTestId('brick-grade-good').textContent).toContain('Vendredi');
    expect(screen.getByTestId('brick-recall-back').className).toContain('motion-reduce');
  });
});
