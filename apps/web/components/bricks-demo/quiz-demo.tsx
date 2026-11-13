'use client';

import { useState } from 'react';

import type {
  BrickViewBrick,
  BrickViewStatus,
  ChoiceQuestionResponse,
  CorrectionView,
} from '@learny/bricks/view';
import { ChoiceQuestionView } from '@learny/bricks/view';
import { Button } from '@learny/ui';

const BRICK: BrickViewBrick<'choice_question'> = {
  versionId: '00000000-0000-4000-8000-000000000503',
  type: 'choice_question',
  notionLabels: ['Type de pièce'],
  publicPayload: {
    stem: 'Quel élément classe l’ensemble d’une pièce comptable ?',
    mode: 'single',
    options: [
      { id: 'cle', text: 'La clé de comptabilisation' },
      { id: 'type', text: 'Le type de pièce' },
      { id: 'ledger', text: 'Le ledger' },
      { id: 'plan', text: 'Le plan comptable' },
    ],
    sources: [],
  },
};

const CORRECTION: CorrectionView<'choice_question'> = {
  kind: 'choice_question',
  isCorrect: true,
  feedbackTitle: 'Exact.',
  explanation:
    'Le type de pièce, par exemple SA, classe toute la pièce. La clé de comptabilisation agit poste par poste : c’est la confusion la plus fréquente.',
  options: [
    { id: 'cle', correct: false },
    { id: 'type', correct: true },
    { id: 'ledger', correct: false },
    { id: 'plan', correct: false },
  ],
};

const SEGMENTS = Array.from({ length: 12 }, (_, index) => index + 1);

export function QuizDemo() {
  const [value, setValue] = useState<ChoiceQuestionResponse | null>(null);
  const [status, setStatus] = useState<BrickViewStatus>('idle');
  const [correction, setCorrection] = useState<CorrectionView<'choice_question'>>();

  const correct = value?.optionIds[0] === 'type';
  return (
    <div className="mx-auto flex w-full max-w-[57.5rem] flex-col gap-18">
      <div className="flex items-center gap-14">
        <div aria-hidden="true" className="flex flex-1 gap-4">
          {SEGMENTS.map((segment) => (
            <span
              className={
                segment < 4
                  ? 'h-8 flex-1 rounded-4 bg-ink'
                  : segment === 4
                    ? 'h-8 flex-1 rounded-4 bg-lime'
                    : 'h-8 flex-1 rounded-4 bg-border'
              }
              key={segment}
            />
          ))}
        </div>
        <span className="text-14 font-600 tabular-nums">Question 4 sur 12</span>
      </div>
      <section
        aria-labelledby="quiz-question"
        className="flex flex-col gap-22 rounded-28 border border-solid border-border bg-surface p-32"
        data-testid="reproduction-quiz"
      >
        <ChoiceQuestionView
          brick={BRICK}
          correction={correction}
          labelledBy="quiz-question"
          onChange={(next) => {
            setValue(next);
            setStatus('answered');
          }}
          status={status}
          value={value}
          variant="quiz"
        />
        <div className="flex flex-wrap items-center justify-between gap-12 border-t border-solid border-divider pt-6">
          <span className="text-13 text-ink-muted">
            Correction immédiate · nouvelles questions à chaque tentative
          </span>
          <Button
            data-testid="brick-check"
            onClick={() => {
              setStatus('corrected');
              setCorrection({
                ...CORRECTION,
                isCorrect: correct,
                feedbackTitle: correct ? 'Exact.' : 'Pas tout à fait.',
              });
            }}
            size="lg"
            variant={status === 'corrected' ? 'lime' : 'dark'}
          >
            {status === 'corrected' ? 'Question suivante' : 'Vérifier'}
          </Button>
        </div>
      </section>
    </div>
  );
}
