'use client';

import { Breadcrumb, buildFormationBreadcrumb } from '@learny/ui';

import { fr } from '../../messages/fr/quiz';

const t = fr.quiz;

export function QuizHeader({
  formationId,
  moduleId,
  modulePosition,
  moduleTitle,
  attemptNo,
  threshold,
}: {
  formationId: string;
  moduleId: string;
  modulePosition: number;
  moduleTitle: string;
  /** Null while no attempt is loaded: the pill stays hidden instead of showing a wrong number. */
  attemptNo: number | null;
  threshold: number;
}) {
  const moduleHref = `/formations/${encodeURIComponent(formationId)}/modules/${encodeURIComponent(moduleId)}`;
  return (
    <div className="flex flex-wrap items-center justify-between gap-12">
      <div className="flex flex-col gap-4">
        <Breadcrumb
          data-testid="quiz-breadcrumb"
          items={buildFormationBreadcrumb({
            formationId,
            module: { id: moduleId, position: modulePosition, title: moduleTitle },
            page: t.breadcrumb,
          })}
        />
        <h1 className="m-0 font-display text-30 font-600 tracking-title">{t.title}</h1>
      </div>
      <div className="flex flex-wrap items-center gap-8">
        {attemptNo === null ? null : (
          <span
            className="rounded-full bg-ink px-12 py-8 text-13 font-600 text-white"
            data-testid="quiz-attempt-badge"
          >
            {t.attempt(attemptNo)}
          </span>
        )}
        <span
          className="rounded-full border border-border bg-surface px-12 py-8 text-13 font-600"
          data-testid="quiz-threshold-badge"
        >
          {t.threshold(threshold)}
        </span>
        <a
          aria-label={t.quit}
          className="touch-target inline-flex size-44 items-center justify-center rounded-12 border border-border bg-surface text-ink"
          data-testid="quiz-quit"
          href={moduleHref}
        >
          <svg
            aria-hidden="true"
            fill="none"
            height="16"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="2.2"
            viewBox="0 0 24 24"
            width="16"
          >
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </a>
      </div>
    </div>
  );
}
