// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { QuizQuestionDto } from '@learny/contracts';

import { QuestionCard } from './QuestionCard';

const QUESTION: QuizQuestionDto = {
  position: 4,
  brickVersionId: '3f1c8a5e-5d0e-4a0b-9a6e-7b2c4d9e1f02',
  type: 'choice_question',
  typeLabel: 'Choix unique',
  notionId: '0b6f2a7e-9a3c-4c1c-8a55-3d1f6f1d2a01',
  notionLabel: 'Type de pièce',
  payload: {
    stem: 'Quel élément classe l’ensemble d’une pièce comptable ?',
    mode: 'single',
    options: [
      { id: 'cle', text: 'La clé de comptabilisation' },
      { id: 'type', text: 'Le type de pièce' },
      { id: 'ledger', text: 'Le ledger' },
      { id: 'plan', text: 'Le plan comptable' },
    ],
  },
  state: 'unanswered',
  maxScore: 8.33,
};

afterEach(cleanup);

describe('[SPEC-611] carte question', () => {
  it('CA-4 — affiche le type, la notion, l’énoncé et la note de correction', () => {
    render(
      <QuestionCard
        checking={false}
        isLast={false}
        onCheck={vi.fn()}
        onNext={vi.fn()}
        onValueChange={vi.fn()}
        question={QUESTION}
        value={{ optionIds: [] }}
      />,
    );
    expect(screen.getByTestId('quiz-question-type').textContent).toContain('Choix unique');
    expect(screen.getByTestId('quiz-question-notion').textContent).toContain('Notion : Type de pièce');
    expect(screen.getByRole('heading', { level: 2 }).textContent).toContain(
      'Quel élément classe l’ensemble d’une pièce comptable ?',
    );
    expect(screen.getByText(/Correction immédiate/)).toBeTruthy();
    expect((screen.getByTestId('quiz-check') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByRole('radio')).toHaveLength(4);
  });

  it('CA-3 — après vérification, la réponse est verrouillée et le retour est affiché', () => {
    const checked: QuizQuestionDto = {
      ...QUESTION,
      state: 'checked',
      response: { optionIds: ['cle'] },
      feedback: {
        isCorrect: false,
        score: 0,
        explanation:
          'Le type de pièce, par exemple SA, classe toute la pièce. La clé de comptabilisation agit poste par poste.',
        title: 'Pas tout à fait.',
        correction: {
          kind: 'choice_question',
          explanation:
            'Le type de pièce, par exemple SA, classe toute la pièce. La clé de comptabilisation agit poste par poste.',
          options: [
            { id: 'cle', text: 'La clé de comptabilisation', correct: false, chosen: true },
            { id: 'type', text: 'Le type de pièce', correct: true, chosen: false },
            { id: 'ledger', text: 'Le ledger', correct: false, chosen: false },
            { id: 'plan', text: 'Le plan comptable', correct: false, chosen: false },
          ],
        },
      },
    };
    render(
      <QuestionCard
        checking={false}
        isLast
        onCheck={vi.fn()}
        onNext={vi.fn()}
        onValueChange={vi.fn()}
        question={checked}
        value={{ optionIds: ['cle'] }}
      />,
    );
    expect(screen.getByTestId('quiz-feedback').textContent).toContain('Pas tout à fait.');
    expect(screen.getByTestId('quiz-feedback').textContent).toContain('Le type de pièce');
    expect(screen.getAllByRole('radio').every((button) => button.hasAttribute('disabled'))).toBe(
      true,
    );
    expect(screen.getByTestId('quiz-next').textContent).toContain('Terminer la tentative');
  });

  it('CA-4 — une question ouverte affiche le compteur et le retour neutre', () => {
    const open: QuizQuestionDto = {
      ...QUESTION,
      type: 'open_question',
      typeLabel: 'Question ouverte',
      payload: {
        stem: 'Expliquez la pièce comptable.',
        answerMaxChars: 2000,
        criteria: [],
      },
      state: 'checked',
      response: { text: 'Une pièce.' },
      feedback: {
        isCorrect: null,
        score: null,
        explanation: null,
        title: 'Réponse enregistrée.',
        pending: true,
      },
    };
    render(
      <QuestionCard
        checking={false}
        isLast={false}
        onCheck={vi.fn()}
        onNext={vi.fn()}
        onValueChange={vi.fn()}
        question={open}
        value={{ text: 'Une pièce.' }}
      />,
    );
    expect((screen.getByTestId('quiz-open-answer') as HTMLTextAreaElement).disabled).toBe(true);
    expect(screen.getByTestId('quiz-feedback').textContent).toContain(
      'Le tuteur la corrigera à la fin de la tentative.',
    );
  });

  it('CA-4 — le choix multiple utilise des cases à cocher', () => {
    const multiple: QuizQuestionDto = {
      ...QUESTION,
      payload: { ...(QUESTION.payload as object), mode: 'multiple' },
    };
    render(
      <QuestionCard
        checking={false}
        isLast={false}
        onCheck={vi.fn()}
        onNext={vi.fn()}
        onValueChange={vi.fn()}
        question={multiple}
        value={{ optionIds: [] }}
      />,
    );
    expect(screen.getAllByRole('checkbox')).toHaveLength(4);
    fireEvent.click(screen.getAllByRole('checkbox')[0] as HTMLElement);
  });
});
