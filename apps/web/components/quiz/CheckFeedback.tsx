'use client';

import type { QuizFeedback, QuizQuestionDto } from '@learny/contracts';
import { cn } from '@learny/ui';

export function CheckFeedback({
  feedback,
  captions,
}: {
  feedback: QuizFeedback;
  captions: { expected: (value: string) => string };
}) {
  const tone = feedback.pending
    ? 'info'
    : feedback.isCorrect === true
      ? 'success'
      : 'error';
  const title =
    feedback.title ??
    (feedback.isCorrect === true ? 'Exact.' : feedback.isCorrect === false ? 'Pas tout à fait.' : 'Réponse enregistrée.');
  const explanation =
    feedback.correction?.kind === 'open_question'
      ? feedback.correction.explanation
      : feedback.correction?.explanation ?? feedback.explanation;
  return (
    <div
      className={cn(
        'flex flex-col gap-6 rounded-18 px-18 py-16',
        tone === 'success' && 'bg-green-soft text-green-ink',
        tone === 'error' && 'bg-orange-soft text-orange-ink',
        tone === 'info' && 'bg-canvas text-ink-secondary',
      )}
      data-testid="quiz-feedback"
      role="status"
      tabIndex={-1}
    >
      <p className="m-0 text-15 font-700">{title}</p>
      {feedback.pending ? (
        <p className="m-0 text-15 leading-1.55">
          Réponse enregistrée. Le tuteur la corrigera à la fin de la tentative.
        </p>
      ) : explanation ? (
        <p className="m-0 text-15 leading-1.55">{explanation}</p>
      ) : null}
      {feedback.correction?.kind === 'cloze' && feedback.pending !== true ? (
        <p className="m-0 text-14">
          {captions.expected(
            feedback.correction.gaps.map((gap) => gap.expected).join(' · '),
          )}
        </p>
      ) : null}
    </div>
  );
}

export function hasAnswer(question: QuizQuestionDto, value: unknown): boolean {
  const record =
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  if (question.type === 'choice_question') {
    return Array.isArray(record?.optionIds) && record.optionIds.length > 0;
  }
  if (question.type === 'open_question') {
    return typeof record?.text === 'string' && record.text.trim() !== '';
  }
  if (question.type === 'cloze') {
    const gaps = record?.gaps;
    if (typeof gaps !== 'object' || gaps === null) return false;
    const payload = question.payload as { gaps?: { id: number }[] } | null;
    return (payload?.gaps ?? []).every(
      (gap) => typeof (gaps as Record<string, unknown>)[String(gap.id)] === 'string' && ((gaps as Record<string, string>)[String(gap.id)] ?? '').trim() !== '',
    );
  }
  const pairs = record?.pairs;
  if (typeof pairs !== 'object' || pairs === null) return false;
  const payload = question.payload as { lefts?: { id: string }[] } | null;
  return (payload?.lefts ?? []).every(
    (left) => typeof (pairs as Record<string, unknown>)[left.id] === 'string' && (pairs as Record<string, string>)[left.id] !== '',
  );
}
