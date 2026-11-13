'use client';

import { useState } from 'react';

import type { CourseSummaryView } from '@learny/contracts';

import { api } from '../../lib/api-client';
import { fr } from '../../messages/fr';

const t = fr.course;

/**
 * BR-COU-07, CL-4 — the learner writes a summary, the tutor corrects it and names what is missing.
 * A tutor outage keeps the text as a draft and says so; it never invents a feedback.
 */
export function SummaryEditor({
  chapterId,
  courseId,
  initial,
  onSaved,
}: {
  chapterId: string;
  courseId: string;
  initial: CourseSummaryView | null;
  onSaved: (summary: CourseSummaryView) => void;
}) {
  const [text, setText] = useState(initial?.text ?? '');
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const [notice, setNotice] = useState<string | null>(null);
  const summary = initial;

  return (
    <section className="flex flex-col gap-10" data-testid="chapter-summary">
      <h2 className="m-0 font-display text-22 font-600">{t.summaryTitle}</h2>
      <label className="text-15 text-ink-muted" htmlFor="resume">
        {t.summaryIntro}
      </label>
      <textarea
        className="min-h-96 rounded-16 border border-border-strong bg-surface p-14 text-15"
        data-testid="chapter-summary-input"
        id="resume"
        onChange={(event) => {
          setText(event.target.value);
        }}
        placeholder={t.summaryPlaceholder}
        rows={3}
        value={text}
      />
      <button
        className="inline-flex min-h-44 w-fit cursor-pointer items-center rounded-12 bg-ink px-18 text-14 font-700 text-white disabled:opacity-60"
        data-testid="chapter-summary-submit"
        disabled={status === 'saving'}
        onClick={() => {
          if (text.trim() === '') {
            setNotice(t.summaryEmpty);
            return;
          }
          setStatus('saving');
          setNotice(null);
          void api
            .chapterSummary(
              { params: { cid: chapterId }, body: { courseId, text: text.trim() } },
              { idempotencyKey: crypto.randomUUID() },
            )
            .then((saved) => {
              setStatus('idle');
              onSaved(saved);
            })
            .catch(() => {
              setStatus('error');
              setNotice(t.summaryError);
            });
        }}
        type="button"
      >
        {status === 'saving' ? t.summaryAction : t.summaryAction}
      </button>
      {notice === null ? null : (
        <p className="m-0 text-13 text-orange-ink-strong" role="alert">
          {notice}
        </p>
      )}
      {summary === null ? null : summary.feedback === null ? (
        <p className="m-0 rounded-16 bg-orange-soft p-14 text-14 text-orange-ink-strong" role="status">
          {t.summaryDeferred}
        </p>
      ) : (
        <div
          className="flex flex-col gap-8 rounded-16 bg-teal-soft p-14 text-14 text-teal-ink"
          data-testid="chapter-summary-feedback"
          role="status"
        >
          <strong>{t.summaryFeedbackTitle}</strong>
          <p className="m-0">{summary.feedback.message}</p>
          {summary.feedback.missing.length === 0 ? null : (
            <>
              <span className="font-700">{t.summaryMissing}</span>
              <ul className="m-0 flex list-disc flex-col gap-4 pl-18">
                {summary.feedback.missing.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}
