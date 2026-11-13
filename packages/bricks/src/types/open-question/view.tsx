'use client';

import { useId } from 'react';

import { Badge, Textarea, cn } from '@learny/ui';

import { resolveLabels } from '../../view/labels';
import { QuestionHeader } from '../../view/question-header';
import type { BrickViewProps } from '../../view-types';

/** Open answer with its counter and the tutor review (SPEC-503 EF-9). */
export function OpenQuestionView(props: BrickViewProps<'open_question'>) {
  const { brick, variant, value, onChange, status, correction, labelledBy, labels } = props;
  const t = resolveLabels(labels);
  const generatedId = useId();
  const titleId = labelledBy ?? generatedId;
  const payload = brick.publicPayload;
  const locked = status === 'locked' || status === 'corrected' || variant === 'review';
  const corrected = status === 'corrected' || variant === 'review';
  const review = correction?.kind === 'open_question' ? correction : null;

  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-16"
      data-testid="brick-open_question"
    >
      <QuestionHeader
        labels={labels}
        labelledBy={titleId}
        notionLabels={brick.notionLabels}
        stem={payload.stem}
        typeLabel={t.type('open_question')}
        variant={variant}
      />
      <Textarea
        counterLabel={t.characters}
        data-testid="brick-open-answer"
        disabled={locked}
        label={t.openAnswer}
        maxLength={payload.answerMaxChars}
        onChange={(event) => {
          if (!locked && onChange) onChange({ text: event.currentTarget.value });
        }}
        rows={5}
        value={value?.text ?? ''}
      />
      {payload.criteria.length > 0 && !review ? (
        <ul className="m-0 flex list-none flex-col gap-6 p-0 text-14 text-ink-secondary">
          {payload.criteria.map((criterion) => (
            <li className="flex items-baseline justify-between gap-12" key={criterion.label}>
              <span>{criterion.label}</span>
              <span className="font-600 text-ink">{`${String(criterion.points)} pts`}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {corrected && review ? (
        <div className="flex flex-col gap-12 rounded-18 bg-canvas p-18">
          <div className="flex flex-wrap items-center justify-between gap-8">
            <h3 className="m-0 text-15 font-700 text-ink">{t.tutorNote}</h3>
            <Badge tone={review.isCorrect ? 'green' : 'orange'}>{review.feedbackTitle}</Badge>
          </div>
          <p className="m-0 text-15 leading-1.55 text-ink-secondary">{review.tutorNote}</p>
          <ul className="m-0 flex list-none flex-col gap-6 p-0">
            {review.criteria.map((criterion) => (
              <li className="flex items-start gap-10 text-14" key={criterion.key}>
                <span
                  aria-hidden="true"
                  className={cn(
                    'inline-flex size-26 shrink-0 items-center justify-center rounded-full text-13 font-700',
                    criterion.ok
                      ? 'bg-green-soft text-green-ink'
                      : 'bg-orange-soft text-orange-ink',
                  )}
                >
                  {criterion.ok ? '✓' : '✗'}
                </span>
                <span className="text-ink">
                  {criterion.label}
                  <span className="sr-only">{criterion.ok ? ' : réussi' : ' : à revoir'}</span>
                  {criterion.detail ? (
                    <span className="block text-13 text-ink-secondary">{criterion.detail}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          {review.missingElements.length > 0 ? (
            <div>
              <h4 className="m-0 text-13 font-700 text-ink">{t.missingElements}</h4>
              <ul className="m-0 mt-4 flex list-none flex-col gap-4 p-0 text-14 text-orange-ink">
                {review.missingElements.map((element) => (
                  <li key={element}>{element}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
