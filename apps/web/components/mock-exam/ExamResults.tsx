'use client';

import { useState } from 'react';

import type { ExamResultDto, ExamReviewFilter } from '@learny/contracts';
import { cn } from '@learny/ui';

import { fr } from '../../messages/fr';

const t = fr.mockExam;

function rangeLabel(modules: ExamResultDto['modules'], studied: boolean): string | null {
  const positions = modules
    .filter((module) => module.studied === studied)
    .map((module) => module.position)
    .sort((left, right) => left - right);
  if (positions.length === 0) return null;
  return positions.length === 1
    ? String(positions[0])
    : `${String(positions[0])} à ${String(positions.at(-1))}`;
}

export interface ExamResultsProps {
  result: ExamResultDto;
  programmeHref: string;
  onRestart: () => void;
}

/** BR-PRA-04 — global, studied and diagnostic scores are separated; gaps only for studied modules. */
export function ExamResults({ result, programmeHref, onRestart }: ExamResultsProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<ExamReviewFilter>('all');
  const studiedRange = rangeLabel(result.modules, true);
  const diagnosticRange = rangeLabel(result.modules, false);
  const reviewed = filter === 'all' ? result.review : result.review.filter((row) => !row.isCorrect);

  return (
    <main className="mx-auto w-full px-16 pb-40 shell:px-40">
      <div className="mx-auto flex w-full max-w-[1160px] flex-col gap-22" data-testid="exam-result">
        <header className="flex flex-col gap-8">
          <nav aria-label="Fil d'Ariane" className="text-14 text-ink-muted">
            <a className="underline" href={programmeHref}>
              Programme
            </a>{' '}
            / {t.breadcrumb} / Résultats
          </nav>
          <h1 className="m-0 font-display text-34 font-600 tracking-title">{t.resultsTitle}</h1>
          <p className="m-0 text-14 text-ink-muted">
            {t.timeUsed(
              result.timeUsedMin,
              result.durationMin,
              result.answeredCount,
              result.total,
              result.timedOut,
            )}
          </p>
        </header>

        <div className="flex flex-wrap gap-12">
          <section className="flex flex-1 basis-240 flex-col gap-6 rounded-22 bg-ink p-22 text-white">
            <span className="text-12 font-700 tracking-label text-lime uppercase">
              {t.scoreGlobal}
            </span>
            <span className="font-display text-44 font-600" data-testid="exam-result-score">
              {result.score} %
            </span>
            <span
              className={cn(
                'self-start rounded-full px-10 py-4 text-12 font-700',
                result.passed ? 'bg-lime text-ink' : 'bg-dark-700 text-on-dark-secondary',
              )}
            >
              {result.passed ? t.passed(result.threshold) : t.failed(result.threshold)}
            </span>
          </section>
          <section className="flex flex-1 basis-240 flex-col gap-6 rounded-22 border border-border bg-surface p-22">
            <span className="text-12 font-700 tracking-label text-ink-muted uppercase">
              {studiedRange === null
                ? 'Modules étudiés'
                : t.studiedLabel(
                    Number(studiedRange.split(' ')[0]),
                    Number(studiedRange.split(' ').at(-1)),
                  )}
            </span>
            <span className="font-display text-44 font-600" data-testid="exam-result-studied">
              {result.studied.score} %
            </span>
            <span className="text-13 text-ink-muted">
              {t.studiedNote(result.studied.score >= 80)}
            </span>
          </section>
          <section className="flex flex-1 basis-240 flex-col gap-6 rounded-22 border border-border bg-surface p-22">
            <span className="text-12 font-700 tracking-label text-ink-muted uppercase">
              {diagnosticRange === null
                ? 'Diagnostic'
                : t.diagnosticLabel(
                    Number(diagnosticRange.split(' ')[0]),
                    Number(diagnosticRange.split(' ').at(-1)),
                  )}
            </span>
            <span className="font-display text-44 font-600" data-testid="exam-result-diagnostic">
              {result.diagnostic.score} %
            </span>
            <span className="text-13 text-ink-muted">{t.diagnosticNote}</span>
          </section>
        </div>

        <div className="flex flex-wrap items-start gap-20">
          <section
            aria-labelledby="t-exam-modules"
            className="flex flex-3 basis-460 flex-col gap-12 rounded-24 border border-border bg-surface p-22"
          >
            <h2 className="m-0 text-18 font-600" id="t-exam-modules">
              {t.byModule}
            </h2>
            {result.modules.map((module) => (
              <div className="flex flex-col gap-6" key={module.moduleId}>
                <div className="flex justify-between gap-10 text-14">
                  <span>
                    <strong>{`Module ${String(module.position)}`}</strong>{' '}
                    <span className="text-ink-muted">
                      {module.label}
                      {module.studied ? '' : t.moduleTag}
                    </span>
                  </span>
                  <span className="font-700 tabular-nums">
                    {module.correct} / {module.total}
                  </span>
                </div>
                <div aria-hidden="true" className="h-8 rounded-4 bg-surface-muted">
                  <div
                    className={cn(
                      'h-8 rounded-4',
                      !module.studied
                        ? 'bg-on-dark-muted'
                        : module.score >= 80
                          ? 'bg-teal'
                          : 'bg-orange',
                    )}
                    style={{ width: `${String(Math.max(module.score, 2))}%` }}
                  />
                </div>
              </div>
            ))}
          </section>

          <div className="flex flex-2 basis-340 flex-col gap-20">
            <section
              aria-labelledby="t-exam-gaps"
              className="flex flex-col gap-10 rounded-24 border border-border bg-surface p-22"
            >
              <h2 className="m-0 text-18 font-600" id="t-exam-gaps">
                {t.gapsTitle(result.gaps.length)}
              </h2>
              {result.gaps.map((gap) => (
                <div className="flex items-baseline gap-10 text-14 leading-1.45" key={gap.notionId}>
                  <span aria-hidden="true" className="size-8 shrink-0 rounded-full bg-orange" />
                  <span>
                    <strong>{gap.notionLabel}</strong> · {gap.moduleLabel}
                  </span>
                </div>
              ))}
              {result.gaps.length === 0 ? (
                <p className="m-0 text-14 font-600 text-green-ink">{t.noGaps}</p>
              ) : null}
              <a
                className="text-14 font-600 underline"
                href={`${programmeHref.replace(/\/programme$/, '')}/lacunes`}
              >
                {t.seeGaps}
              </a>
            </section>
            <section className="flex flex-col gap-10 rounded-24 bg-ink p-22 text-white">
              <h2 className="m-0 text-12 font-700 tracking-widest text-lime uppercase">
                {t.planTitle}
              </h2>
              <ul className="m-0 flex list-disc flex-col gap-8 pl-18 text-14 leading-1.5 text-on-dark-secondary">
                {result.plan.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
          </div>
        </div>

        <div className="flex flex-wrap gap-10">
          <button
            className="min-h-48 rounded-14 bg-ink px-20 text-15 font-700 text-white"
            data-testid="exam-review-toggle"
            onClick={() => {
              setOpen(!open);
            }}
            type="button"
          >
            {t.review}
          </button>
          <a
            className="inline-flex min-h-48 items-center rounded-14 border border-border-strong bg-surface px-20 text-15 font-600 text-ink"
            href={programmeHref}
          >
            {t.back}
          </a>
          <button
            className="min-h-48 rounded-14 px-20 text-15 font-600 text-ink-muted"
            onClick={onRestart}
            type="button"
          >
            {t.restart}
          </button>
        </div>

        {open ? (
          <section
            aria-labelledby="t-exam-review"
            className="flex flex-col gap-12 rounded-24 border border-border bg-surface p-22"
            data-testid="exam-review"
            id="revue"
          >
            <div className="flex flex-wrap items-center justify-between gap-10">
              <h2 className="m-0 text-18 font-600" id="t-exam-review">
                {t.reviewTitle}
              </h2>
              <div
                aria-label="Filtrer les réponses"
                className="inline-flex gap-4 rounded-12 bg-canvas p-4"
                role="group"
              >
                <button
                  aria-pressed={filter === 'all'}
                  className={cn(
                    'min-h-34 rounded-9 px-12 text-13',
                    filter === 'all' ? 'bg-surface font-600 text-ink' : 'text-ink-muted',
                  )}
                  onClick={() => {
                    setFilter('all');
                  }}
                  type="button"
                >
                  {t.filterAll}
                </button>
                <button
                  aria-pressed={filter === 'errors'}
                  className={cn(
                    'min-h-34 rounded-9 px-12 text-13',
                    filter === 'errors' ? 'bg-surface font-600 text-ink' : 'text-ink-muted',
                  )}
                  data-testid="exam-review-filter-errors"
                  onClick={() => {
                    setFilter('errors');
                  }}
                  type="button"
                >
                  {t.filterErrors}
                </button>
              </div>
            </div>
            <ol className="m-0 flex list-none flex-col gap-10 p-0">
              {reviewed.map((row) => (
                <li
                  className="flex flex-col gap-6 rounded-16 bg-surface-subtle p-14"
                  data-testid={`exam-review-${String(row.position)}`}
                  key={row.position}
                >
                  <div className="flex items-baseline gap-10">
                    <span
                      className={cn(
                        'inline-flex size-24 shrink-0 items-center justify-center rounded-full text-12 font-700',
                        row.isCorrect
                          ? 'bg-green-soft text-green-ink'
                          : 'bg-orange-soft text-orange-ink',
                      )}
                    >
                      {row.isCorrect ? '✓' : row.given === t.noAnswer ? '—' : '✗'}
                    </span>
                    <strong className="text-15 leading-1.4">
                      {row.position}. {row.question}
                    </strong>
                  </div>
                  <p className="m-0 text-14 leading-1.5 text-ink-secondary">
                    {t.yourAnswer}
                    <strong>{row.given}</strong>
                    {row.isCorrect || row.expected === null
                      ? ''
                      : `${t.correctAnswer}${row.expected}`}
                  </p>
                  <p className="m-0 text-13 leading-1.5 text-ink-muted">
                    {t.moduleLine(row.modulePosition, row.moduleLabel)} · {row.notionLabel}
                    {row.explanation === null ? '' : `. ${row.explanation}`}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
      </div>
    </main>
  );
}
