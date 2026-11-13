'use client';

import { useState } from 'react';

import type { CourseSection } from '@learny/contracts';

import { fr } from '../../messages/fr';

const t = fr.course;

/** BR-COU-05 — flash question with its answer hidden behind the reveal button. */
export function QuickQuestion({ section }: { section: CourseSection }) {
  const [shown, setShown] = useState(false);
  const data = section.data ?? {};
  const question = typeof data.question === 'string' ? data.question : '';
  const answer = typeof data.answer === 'string' ? data.answer : '';
  return (
    <section
      aria-labelledby={`${section.anchor}-titre`}
      className="flex flex-col gap-12 rounded-22 bg-indigo-soft p-22"
      data-testid="course-quick-question"
      id={section.anchor}
    >
      <h2
        className="m-0 text-12 font-700 tracking-wide text-indigo-ink-strong uppercase"
        id={`${section.anchor}-titre`}
      >
        {t.quickQuestion}
      </h2>
      <p className="m-0 font-display text-20 font-600 text-ink">{question}</p>
      {shown ? (
        <p className="m-0 rounded-14 bg-surface p-12 text-15" data-testid="course-answer">
          {answer}
        </p>
      ) : null}
      <button
        aria-expanded={shown}
        className="inline-flex min-h-44 w-fit cursor-pointer items-center rounded-12 bg-ink px-18 text-14 font-700 text-white"
        data-testid="course-reveal"
        onClick={() => {
          setShown((value) => !value);
        }}
        type="button"
      >
        {shown ? t.hide : t.reveal}
      </button>
    </section>
  );
}
