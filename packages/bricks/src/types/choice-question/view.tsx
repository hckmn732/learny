'use client';

import { useEffect, useId } from 'react';

import { cn } from '@learny/ui';

import type { CorrectionView } from '../../correction-view';
import { FeedbackBox } from '../../view/feedback-box';
import { resolveLabels } from '../../view/labels';
import { QuestionHeader } from '../../view/question-header';
import type { BrickViewProps } from '../../view-types';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

function correctionOptions(
  correction: CorrectionView<'choice_question'> | undefined,
): Map<string, { correct: boolean; rationale?: string | null }> | null {
  if (!correction) return null;
  return new Map(correction.options.map((option) => [option.id, option]));
}

/** Single or multiple choice (SPEC-503 EF-3), quiz grid or exam column. */
export function ChoiceQuestionView(props: BrickViewProps<'choice_question'>) {
  const { brick, variant, value, onChange, status, correction, labelledBy, labels } = props;
  const t = resolveLabels(labels);
  const generatedId = useId();
  const titleId = labelledBy ?? generatedId;
  const payload = brick.publicPayload;
  const selected = value?.optionIds ?? [];
  const locked = status === 'locked' || status === 'corrected' || variant === 'review';
  const exam = variant === 'exam';
  const multiple = payload.mode === 'multiple';
  const corrected = status === 'corrected' || variant === 'review';
  const options = corrected ? correctionOptions(correction) : null;

  useEffect(() => {
    if (status === 'corrected' && !correction && process.env.NODE_ENV !== 'production') {
      console.warn(`[SPEC-503] corrected state without correction for ${brick.versionId}`);
    }
  }, [status, correction, brick.versionId]);

  function toggle(optionId: string) {
    if (locked || !onChange) return;
    if (multiple) {
      const next = selected.includes(optionId)
        ? selected.filter((id) => id !== optionId)
        : [...selected, optionId];
      onChange({ optionIds: next });
    } else {
      onChange({ optionIds: [optionId] });
    }
  }

  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-18"
      data-testid="brick-choice_question"
    >
      <QuestionHeader
        labels={labels}
        labelledBy={titleId}
        notionLabels={brick.notionLabels}
        stem={payload.stem}
        typeLabel={t.type('choice_question', payload.mode)}
        variant={variant}
      />
      {multiple ? <p className="m-0 text-13 text-ink-muted">{t.multipleAnswers}</p> : null}
      <div
        aria-labelledby={titleId}
        className={cn(
          exam ? 'flex flex-col gap-10' : 'grid grid-cols-1 gap-12 min-[640px]:grid-cols-2',
        )}
        role={multiple ? 'group' : 'radiogroup'}
      >
        {payload.options.map((option, index) => {
          const isSelected = selected.includes(option.id);
          const state = options?.get(option.id);
          const correct = state?.correct === true;
          const wrong = corrected && isSelected && state !== undefined && !state.correct;
          const letter = LETTERS[index] ?? String(index + 1);
          const stateText = correct
            ? 'réponse correcte'
            : wrong
              ? 'réponse choisie incorrecte'
              : '';
          return (
            <button
              aria-checked={isSelected}
              className={cn(
                'flex w-full cursor-pointer items-center gap-14 border border-solid text-left font-600 text-ink transition-colors disabled:cursor-not-allowed disabled:opacity-70',
                exam
                  ? 'min-h-56 rounded-16 px-16 py-10 text-16'
                  : 'min-h-72 rounded-18 px-16 py-14 text-16',
                correct
                  ? 'border-2 border-teal bg-green-soft'
                  : wrong
                    ? 'border-2 border-orange bg-orange-soft'
                    : isSelected
                      ? 'border-2 border-ink bg-canvas'
                      : 'border-border-strong bg-surface hover:border-ink',
                locked && !corrected ? 'opacity-70' : '',
              )}
              data-testid={`brick-option-${option.id}`}
              disabled={locked}
              key={option.id}
              onClick={() => {
                toggle(option.id);
              }}
              role={multiple ? 'checkbox' : 'radio'}
              type="button"
            >
              <span
                aria-hidden="true"
                className={cn(
                  'inline-flex shrink-0 items-center justify-center font-700',
                  exam ? 'size-30 rounded-9 text-13' : 'size-32 rounded-10 text-14',
                  correct
                    ? 'bg-teal text-ink'
                    : wrong
                      ? 'bg-orange text-ink'
                      : isSelected
                        ? exam
                          ? 'bg-lime text-ink'
                          : 'bg-ink text-white'
                        : 'bg-canvas text-ink',
                )}
              >
                {letter}
              </span>
              <span className="break-words">{option.text}</span>
              {stateText ? <span className="sr-only">{` — ${stateText}`}</span> : null}
              {correct && state.rationale ? (
                <span className="sr-only">{` — ${state.rationale}`}</span>
              ) : null}
            </button>
          );
        })}
      </div>
      {corrected && correction ? (
        <FeedbackBox
          tone={correction.isCorrect ? 'success' : 'error'}
          title={correction.isCorrect ? t.exact : t.almost}
        >
          {correction.explanation ? <p className="m-0">{correction.explanation}</p> : null}
        </FeedbackBox>
      ) : null}
    </section>
  );
}
