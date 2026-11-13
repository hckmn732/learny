'use client';

import { useEffect, useRef, type ReactNode } from 'react';

import type { QuizFeedback, QuizQuestionDto } from '@learny/contracts';
import { cn } from '@learny/ui';

import { fr } from '../../messages/fr';

import { CheckFeedback, hasAnswer } from './CheckFeedback';

const t = fr.quiz;
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
const GAP_TOKEN = /\{\{(\d+)\}\}/g;

interface ChoicePayload {
  stem: string;
  mode: 'single' | 'multiple';
  options: { id: string; text: string }[];
}
interface ClozePayload {
  template: string;
  gaps: { id: number; hint?: string }[];
}
interface MatchingPayload {
  instruction: string;
  lefts: { id: string; text: string }[];
  rights: { id: string; text: string }[];
}
interface OpenPayload {
  stem: string;
  answerMaxChars: number;
  criteria: { label: string; points: number }[];
}

interface ResponseRecord {
  optionIds?: string[];
  gaps?: Record<string, string>;
  pairs?: Record<string, string | null>;
  text?: string;
}

function asRecord(value: unknown): ResponseRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {};
}

function correctionOption(
  feedback: QuizFeedback | undefined,
  id: string,
): { correct: boolean; chosen: boolean } | null {
  if (feedback?.correction?.kind !== 'choice_question') return null;
  return feedback.correction.options.find((option) => option.id === id) ?? null;
}

function gapState(feedback: QuizFeedback | undefined, id: number) {
  if (feedback?.correction?.kind !== 'cloze') return null;
  return feedback.correction.gaps.find((gap) => gap.id === id) ?? null;
}

function pairState(feedback: QuizFeedback | undefined, pairId: string) {
  if (feedback?.correction?.kind !== 'matching') return null;
  return feedback.correction.pairs.find((pair) => pair.pairId === pairId) ?? null;
}

function ClozeInputs({
  payload,
  value,
  disabled,
  feedback,
  onChange,
}: {
  payload: ClozePayload;
  value: ResponseRecord;
  disabled: boolean;
  feedback: QuizFeedback | undefined;
  onChange: (next: ResponseRecord) => void;
}) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of payload.template.matchAll(GAP_TOKEN)) {
    const index = match.index;
    if (index > last) parts.push(payload.template.slice(last, index));
    const gapId = Number(match[1]);
    const gapIndex = payload.gaps.findIndex((gap) => gap.id === gapId);
    const state = gapState(feedback, gapId);
    parts.push(
      <input
        aria-label={t.gapLabels[gapIndex] ?? t.gapLabels[0]}
        className={cn(
          'mx-4 w-150 rounded-10 border-0 px-12 text-center text-18 font-600 text-ink shadow-[inset_0_-2px_0_var(--color-ink)]',
          state?.correct === true && 'bg-green-soft shadow-[inset_0_-2px_0_var(--color-teal)]',
          state !== null &&
            !state.correct &&
            'bg-orange-soft shadow-[inset_0_-2px_0_var(--color-orange)]',
          !state && 'bg-canvas',
        )}
        data-testid={`quiz-gap-${String(gapId)}`}
        disabled={disabled}
        key={`gap-${String(gapId)}`}
        onChange={(event) => {
          onChange({ gaps: { ...(value.gaps ?? {}), [String(gapId)]: event.currentTarget.value } });
        }}
        value={value.gaps?.[String(gapId)] ?? ''}
      />,
    );
    last = index + match[0].length;
  }
  if (last < payload.template.length) parts.push(payload.template.slice(last));
  return <p className="m-0 text-20 leading-2.2 text-ink">{parts}</p>;
}

function AnswerZone({
  question,
  value,
  disabled,
  onChange,
}: {
  question: QuizQuestionDto;
  value: ResponseRecord;
  disabled: boolean;
  onChange: (next: ResponseRecord) => void;
}) {
  const payload = question.payload;
  if (question.type === 'choice_question') {
    const data = payload as ChoicePayload;
    const selected = value.optionIds ?? [];
    const multiple = data.mode === 'multiple';
    return (
      <div
        aria-labelledby="t-question"
        className="grid grid-cols-1 gap-12 min-[640px]:grid-cols-2"
        role={multiple ? 'group' : 'radiogroup'}
      >
        {data.options.map((option, index) => {
          const isSelected = selected.includes(option.id);
          const state = correctionOption(question.feedback, option.id);
          const correct = state?.correct === true;
          const wrong = state !== null && !state.correct && state.chosen;
          return (
            <button
              aria-checked={isSelected}
              className={cn(
                'flex min-h-72 w-full cursor-pointer items-center gap-14 rounded-18 border border-solid px-16 py-14 text-left text-16 font-600 text-ink transition-colors disabled:cursor-not-allowed',
                correct
                  ? 'border-2 border-teal bg-green-soft'
                  : wrong
                    ? 'border-2 border-orange bg-orange-soft'
                    : isSelected
                      ? 'border-2 border-ink bg-canvas'
                      : 'border-border-strong bg-surface hover:border-ink',
              )}
              data-option-index={index}
              data-testid={`quiz-option-${option.id}`}
              disabled={disabled}
              key={option.id}
              onClick={() => {
                if (disabled) return;
                if (multiple) {
                  onChange({
                    optionIds: isSelected
                      ? selected.filter((id) => id !== option.id)
                      : [...selected, option.id],
                  });
                } else {
                  onChange({ optionIds: [option.id] });
                }
              }}
              onKeyDown={(event) => {
                if (!['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(event.key))
                  return;
                event.preventDefault();
                const group = event.currentTarget.closest('[role="radiogroup"]');
                const buttons = [...(group?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
                const current = buttons.indexOf(event.currentTarget);
                const delta = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1;
                buttons[(current + delta + buttons.length) % buttons.length]?.focus();
              }}
              role={multiple ? 'checkbox' : 'radio'}
              type="button"
            >
              <span
                aria-hidden="true"
                className={cn(
                  'inline-flex size-32 shrink-0 items-center justify-center rounded-10 text-14 font-700',
                  correct
                    ? 'bg-teal text-white'
                    : wrong
                      ? 'bg-orange text-ink'
                      : isSelected
                        ? 'bg-ink text-white'
                        : 'bg-canvas text-ink',
                )}
              >
                {LETTERS[index] ?? String(index + 1)}
              </span>
              <span className="break-words">{option.text}</span>
              {correct ? <span className="sr-only"> — réponse correcte</span> : null}
              {wrong ? <span className="sr-only"> — réponse choisie incorrecte</span> : null}
            </button>
          );
        })}
      </div>
    );
  }
  if (question.type === 'cloze') {
    return (
      <ClozeInputs
        disabled={disabled}
        feedback={question.feedback}
        onChange={onChange}
        payload={payload as ClozePayload}
        value={value}
      />
    );
  }
  if (question.type === 'matching') {
    const data = payload as MatchingPayload;
    return (
      <div className="flex flex-col gap-10">
        {data.lefts.map((left) => {
          const state = pairState(question.feedback, left.id);
          return (
            <div
              className={cn(
                'flex flex-wrap items-center gap-12 rounded-18 px-14 py-12',
                state?.correct === true
                  ? 'border-2 border-teal bg-green-soft'
                  : state?.correct === false
                    ? 'border-2 border-orange bg-orange-soft'
                    : 'border border-solid border-border bg-surface-subtle',
              )}
              data-testid={`quiz-match-row-${left.id}`}
              key={left.id}
            >
              <label
                className="flex-1 basis-170 font-display text-18 font-600 text-ink"
                htmlFor={`quiz-match-${left.id}`}
              >
                {left.text}
              </label>
              <select
                className="min-h-48 flex-1 basis-260 rounded-12 border border-border-strong bg-surface px-14 text-15 text-ink disabled:opacity-80"
                data-testid={`quiz-match-${left.id}`}
                disabled={disabled}
                id={`quiz-match-${left.id}`}
                onChange={(event) => {
                  onChange({
                    pairs: { ...(value.pairs ?? {}), [left.id]: event.currentTarget.value || null },
                  });
                }}
                value={value.pairs?.[left.id] ?? ''}
              >
                <option value="">{t.choose}</option>
                {data.rights.map((right) => (
                  <option key={right.id} value={right.id}>
                    {right.text}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    );
  }
  const data = payload as OpenPayload;
  const text = value.text ?? '';
  return (
    <div className="flex flex-col gap-6">
      <label className="text-13 font-600 text-ink-secondary" htmlFor="quiz-open-answer">
        {t.openAnswer}
      </label>
      <textarea
        className="min-h-140 rounded-14 border border-border-strong bg-surface p-14 text-15 text-ink disabled:opacity-80"
        data-testid="quiz-open-answer"
        disabled={disabled}
        id="quiz-open-answer"
        maxLength={data.answerMaxChars}
        onChange={(event) => {
          onChange({ text: event.currentTarget.value });
        }}
        rows={5}
        value={text}
      />
      <span className="self-end text-12 text-ink-muted">
        {t.characters(text.length, data.answerMaxChars)}
      </span>
    </div>
  );
}

export interface QuestionCardProps {
  question: QuizQuestionDto;
  value: unknown;
  checking: boolean;
  isLast: boolean;
  onValueChange: (value: ResponseRecord) => void;
  onCheck: () => void;
  onNext: () => void;
  /** SPEC-612 — a remediation checks every question in place and hides the quiz navigation. */
  showNext?: boolean;
  testId?: string;
  headingId?: string;
}

export function QuestionCard({
  question,
  value,
  checking,
  isLast,
  onValueChange,
  onCheck,
  onNext,
  showNext = true,
  testId = 'quiz-question',
  headingId = 't-question',
}: QuestionCardProps) {
  const feedbackRef = useRef<HTMLDivElement>(null);
  const checked = question.state === 'checked';
  const response = asRecord(value);
  const payload = question.payload;
  const stem =
    question.type === 'choice_question' || question.type === 'open_question'
      ? (payload as ChoicePayload | OpenPayload).stem
      : question.type === 'matching'
        ? (payload as MatchingPayload).instruction
        : t.clozeStem;
  const ready = hasAnswer(question, response);

  useEffect(() => {
    if (!checked) return;
    const target = document.querySelector<HTMLElement>('[data-testid="quiz-feedback"]');
    target?.focus();
  }, [checked, question.position]);

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-22 rounded-28 border border-border bg-surface p-32"
      data-testid={testId}
      ref={feedbackRef}
    >
      <div className="flex flex-wrap gap-8">
        <span
          className="rounded-full bg-canvas px-12 py-6 text-12 font-700"
          data-testid="quiz-question-type"
        >
          {question.typeLabel}
        </span>
        <span
          className="rounded-full bg-indigo-soft px-12 py-6 text-12 font-700 text-indigo-ink-strong"
          data-testid="quiz-question-notion"
        >
          {`Notion : ${question.notionLabel}`}
        </span>
      </div>
      <h2
        className="m-0 font-display text-26 font-600 leading-1.3 tracking-heading text-ink"
        id={headingId}
      >
        {stem}
      </h2>
      <AnswerZone
        disabled={checked || checking}
        onChange={onValueChange}
        question={question}
        value={response}
      />
      {checked && question.feedback ? (
        <CheckFeedback
          captions={{ expected: (values) => `Réponses attendues : ${values}` }}
          feedback={question.feedback}
        />
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-12 pt-6">
        <span className="text-13 text-ink-muted">{t.note}</span>
        {checked ? (
          showNext ? (
            <button
              className="inline-flex min-h-48 items-center rounded-14 bg-lime px-24 text-15 font-700 text-ink disabled:opacity-60"
              data-testid="quiz-next"
              onClick={onNext}
              type="button"
            >
              {isLast ? t.finish : t.next}
            </button>
          ) : null
        ) : (
          <button
            className="inline-flex min-h-48 items-center rounded-14 bg-ink px-24 text-15 font-700 text-white disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="quiz-check"
            disabled={!ready || checking}
            onClick={onCheck}
            type="button"
          >
            {checking ? t.checking : t.check}
          </button>
        )}
      </div>
    </section>
  );
}
