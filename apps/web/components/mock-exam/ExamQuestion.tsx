'use client';

import type { ReactNode } from 'react';

import type { ExamQuestionDto } from '@learny/contracts';
import { cn } from '@learny/ui';

import { fr } from '../../messages/fr';

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
interface ResponseRecord {
  optionIds?: string[];
  gaps?: Record<string, string>;
  pairs?: Record<string, string | null>;
  text?: string;
}

function asRecord(value: unknown): ResponseRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {};
}

function ClozeAnswer({
  payload,
  value,
  onChange,
}: {
  payload: ClozePayload;
  value: ResponseRecord;
  onChange: (next: ResponseRecord) => void;
}) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of payload.template.matchAll(GAP_TOKEN)) {
    const index = match.index;
    if (index > last) parts.push(payload.template.slice(last, index));
    const gapId = Number(match[1]);
    const gapIndex = payload.gaps.findIndex((gap) => gap.id === gapId);
    parts.push(
      <input
        aria-label={fr.quiz.gapLabels[gapIndex] ?? fr.quiz.gapLabels[0]}
        className="mx-4 w-150 rounded-10 border-0 bg-canvas px-12 text-center text-18 font-600 text-ink shadow-[inset_0_-2px_0_var(--color-ink)]"
        data-testid={`exam-gap-${String(gapId)}`}
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

export interface ExamQuestionProps {
  question: ExamQuestionDto;
  value: unknown;
  onChange: (value: unknown, timeMs: number) => void;
}

/** BR-PRA-03 — the exam answers never show a correction, only the selection. */
export function ExamQuestion({ question, value, onChange }: ExamQuestionProps) {
  const response = asRecord(value);
  const update = (next: ResponseRecord) => {
    onChange(next, 0);
  };

  if (question.type === 'choice_question') {
    const payload = question.payload as ChoicePayload;
    const selected = response.optionIds ?? [];
    const multiple = payload.mode === 'multiple';
    return (
      <div
        aria-labelledby="t-exam-question"
        className="flex flex-col gap-10"
        role={multiple ? 'group' : 'radiogroup'}
      >
        {payload.options.map((option, index) => {
          const isSelected = selected.includes(option.id);
          return (
            <button
              aria-checked={isSelected}
              className={cn(
                'flex min-h-56 w-full items-center gap-14 rounded-16 border px-16 py-10 text-left text-16 text-ink',
                isSelected
                  ? 'border-2 border-ink bg-canvas font-600'
                  : 'border-border-strong bg-surface font-500',
              )}
              data-testid={`exam-option-${option.id}`}
              key={option.id}
              onClick={() => {
                update({
                  optionIds: multiple
                    ? isSelected
                      ? selected.filter((id) => id !== option.id)
                      : [...selected, option.id]
                    : [option.id],
                });
              }}
              role={multiple ? 'checkbox' : 'radio'}
              type="button"
            >
              <span
                aria-hidden="true"
                className={cn(
                  'inline-flex size-30 shrink-0 items-center justify-center rounded-9 text-13 font-700',
                  isSelected ? 'bg-ink text-lime' : 'bg-canvas text-ink-secondary',
                )}
              >
                {LETTERS[index] ?? String(index + 1)}
              </span>
              <span>{option.text}</span>
            </button>
          );
        })}
      </div>
    );
  }

  if (question.type === 'cloze') {
    return (
      <ClozeAnswer onChange={update} payload={question.payload as ClozePayload} value={response} />
    );
  }

  if (question.type === 'matching') {
    const payload = question.payload as MatchingPayload;
    return (
      <div className="flex flex-col gap-10">
        {payload.lefts.map((left) => (
          <label className="flex flex-col gap-4 text-14 font-600 text-ink" key={left.id}>
            {left.text}
            <select
              className="min-h-44 rounded-12 border border-border-strong bg-surface px-12 text-15 font-400"
              data-testid={`exam-match-${left.id}`}
              onChange={(event) => {
                update({
                  pairs: {
                    ...(response.pairs ?? {}),
                    [left.id]: event.currentTarget.value || null,
                  },
                });
              }}
              value={response.pairs?.[left.id] ?? ''}
            >
              <option value="">{fr.quiz.choose}</option>
              {payload.rights.map((right) => (
                <option key={right.id} value={right.id}>
                  {right.text}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    );
  }

  return (
    <textarea
      className="min-h-120 w-full rounded-14 border border-border-strong bg-surface p-12 text-15"
      onChange={(event) => {
        update({ text: event.currentTarget.value });
      }}
      value={response.text ?? ''}
    />
  );
}
