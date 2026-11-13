// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MatchingView } from '@learny/bricks/view';

import { cleanup, renderComponent, screen } from '../../test-render';

afterEach(cleanup);

const BRICK = {
  versionId: '00000000-0000-4000-8000-000000000503',
  type: 'matching' as const,
  notionLabels: ['Notions de base SAP'],
  publicPayload: {
    instruction: 'Associez chaque notion à sa définition.',
    lefts: [
      { id: 'po', text: 'Société' },
      { id: 'sm', text: 'Plan comptable' },
    ],
    rights: [
      { id: 'r1', text: 'Entité juridique' },
      { id: 'r2', text: 'Liste des comptes' },
    ],
    sources: [],
  },
};

const CORRECTION = {
  kind: 'matching' as const,
  isCorrect: true,
  feedbackTitle: 'Exact.' as const,
  pairs: [
    { pairId: 'po', expectedRightId: 'r1', givenRightId: 'r1', correct: true },
    { pairId: 'sm', expectedRightId: 'r2', givenRightId: 'r2', correct: true },
  ],
};

describe('[SPEC-503] vue association', () => {
  it('relie deux tuiles au clavier et Échap annule la sélection (CL-5)', async () => {
    const onChange = vi.fn();
    const { user } = renderComponent(
      <MatchingView brick={BRICK} onChange={onChange} status="idle" value={null} variant="game" />,
    );
    const left = screen.getByTestId('brick-match-left-po');
    left.focus();
    await user.keyboard('{Enter}');
    expect(left.getAttribute('aria-pressed')).toBe('true');
    const right = screen.getByTestId('brick-match-right-r1');
    right.focus();
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith({ pairs: { po: 'r1' } });

    left.focus();
    await user.keyboard('{Enter}');
    await user.keyboard('{Escape}');
    expect(left.getAttribute('aria-pressed')).toBe('false');
  });

  it('désactive Vérifier pendant la correction (CL-4)', () => {
    renderComponent(
      <MatchingView
        brick={BRICK}
        correction={CORRECTION}
        status="checking"
        value={{ pairs: { po: 'r1', sm: 'r2' } }}
        variant="game"
      />,
    );
    expect(screen.getByTestId<HTMLButtonElement>('brick-check').disabled).toBe(true);
  });

  it('propose des menus en variante quiz (EF-5)', () => {
    renderComponent(
      <MatchingView brick={BRICK} status="idle" value={null} variant="quiz" onChange={() => {}} />,
    );
    expect(screen.getByTestId('brick-match-po').tagName).toBe('SELECT');
    expect(screen.getByTestId('brick-match-sm').tagName).toBe('SELECT');
  });
});
