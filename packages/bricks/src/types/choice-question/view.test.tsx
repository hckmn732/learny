// @vitest-environment jsdom
import axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BrickViewProps } from '@learny/bricks/view';
import { ChoiceQuestionView } from '@learny/bricks/view';

import { cleanup, renderComponent, screen } from '../../test-render';

afterEach(cleanup);

const BRICK: BrickViewProps<'choice_question'>['brick'] = {
  versionId: '00000000-0000-4000-8000-000000000503',
  type: 'choice_question',
  notionLabels: ['Type de pièce'],
  publicPayload: {
    stem: 'Quel élément classe l’ensemble d’une pièce comptable ?',
    mode: 'single',
    options: [
      { id: 'a', text: 'La clé de comptabilisation' },
      { id: 'b', text: 'Le type de pièce' },
    ],
    sources: [],
  },
};

const CORRECTION: BrickViewProps<'choice_question'>['correction'] = {
  kind: 'choice_question',
  isCorrect: false,
  feedbackTitle: 'Pas tout à fait.',
  explanation: 'Le type de pièce classe toute la pièce.',
  options: [
    { id: 'a', correct: false },
    { id: 'b', correct: true },
  ],
};

function render(overrides: Partial<BrickViewProps<'choice_question'>> = {}) {
  return renderComponent(
    <ChoiceQuestionView
      brick={BRICK}
      onChange={() => {}}
      status="idle"
      value={null}
      variant="quiz"
      {...overrides}
    />,
  );
}

describe('[SPEC-503] vue question à choix', () => {
  it('sélectionne une option à la souris et au clavier (CA-2)', async () => {
    const onChange = vi.fn();
    const { user } = render({ onChange });
    await user.click(screen.getByTestId('brick-option-a'));
    expect(onChange).toHaveBeenCalledWith({ optionIds: ['a'] });
    screen.getByTestId('brick-option-b').focus();
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith({ optionIds: ['b'] });
  });

  it('applique les couleurs juste et faux d’ADR-0152 avec un texte accessible (CA-3)', () => {
    render({ correction: CORRECTION, status: 'corrected', value: { optionIds: ['a'] } });
    const correct = screen.getByTestId('brick-option-b');
    const wrong = screen.getByTestId('brick-option-a');
    expect(correct.className).toContain('border-teal');
    expect(correct.className).toContain('bg-green-soft');
    expect(wrong.className).toContain('border-orange');
    expect(wrong.className).toContain('bg-orange-soft');
    expect(correct.textContent).toContain('réponse correcte');
    expect(wrong.textContent).toContain('réponse choisie incorrecte');
  });

  it('désactive la saisie quand la vue est verrouillée (CL-6)', () => {
    render({ status: 'locked', value: { optionIds: ['a'] } });
    expect(screen.getByTestId<HTMLButtonElement>('brick-option-a').disabled).toBe(true);
  });

  it('ne contient aucune violation axe serious/critical (CA-1)', async () => {
    render();
    const results = await axe.run(document.body, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(
      results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
    ).toEqual([]);
  });
});
