'use client';

import { useState } from 'react';

import type { ActiveProgrammeChapterDto, ActiveProgrammeModuleDto } from '@learny/contracts';

import { fr } from '../../messages/fr';

import { formatRange } from './dates';

const t = fr.programme;

function formatScore(score: number): string {
  return Number.isInteger(score)
    ? String(score)
    : score.toFixed(1).replace('.', ',').replace(',0', '');
}

export interface ProgrammeModuleCardProps {
  module: ActiveProgrammeModuleDto;
  chapters: readonly ActiveProgrammeChapterDto[];
  defaultExpanded?: boolean;
}

/**
 * EF-3, BR-FOR-07/08 — one module card. The action follows the persisted status: a validated
 * module offers its course, the open module offers its page and actions, and a locked module has
 * no active link at all: only its unlock condition.
 */
export function ProgrammeModuleCard({
  module,
  chapters,
  defaultExpanded = false,
}: ProgrammeModuleCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const exam = module.quizKind === 'exam';
  const locked = module.status === 'locked';
  const statusLabel =
    module.status === 'validated' && module.score !== null
      ? `${t.activeModuleStatus.validated} · ${formatScore(module.score)} %`
      : t.activeModuleStatus[module.status];
  const statusStyle =
    module.status === 'validated'
      ? 'bg-indigo-soft text-indigo-ink-strong'
      : module.status === 'open'
        ? 'bg-lime text-ink'
        : 'bg-surface-muted text-ink-muted';
  const cardStyle = expanded
    ? 'rounded-22 border-[1.5px] border-ink bg-surface'
    : module.status === 'open'
      ? 'rounded-22 border-[1.5px] border-lime-border bg-surface'
      : 'rounded-22 border border-border bg-surface';
  const href = module.href;

  return (
    <li
      className={cardStyle}
      data-module-status={module.status}
      data-testid={`programme-module-${String(module.position)}`}
    >
      <div className="flex flex-wrap items-center gap-12 px-16 py-12">
        <button
          aria-expanded={expanded}
          className="flex min-h-56 flex-1 basis-320 cursor-pointer items-center gap-14 border-0 bg-transparent p-0 text-left text-ink"
          onClick={() => {
            setExpanded(!expanded);
          }}
          type="button"
        >
          <span
            className={
              module.status === 'validated'
                ? 'inline-flex h-40 w-40 shrink-0 items-center justify-center rounded-12 bg-indigo font-display text-16 font-600 text-white'
                : module.status === 'open'
                  ? 'inline-flex h-40 w-40 shrink-0 items-center justify-center rounded-12 bg-lime font-display text-16 font-600 text-ink'
                  : 'inline-flex h-40 w-40 shrink-0 items-center justify-center rounded-12 bg-canvas font-display text-16 font-600 text-ink'
            }
          >
            {module.position}
          </span>
          <span className="flex flex-1 flex-col gap-2">
            <span className="text-16 font-700">{module.title}</span>
            <span className="text-13 text-ink-muted">
              {t.moduleMeta(
                chapters.length,
                exam,
                formatRange(module.plannedStart, module.plannedEnd),
              )}
            </span>
            {locked ? (
              <span className="text-13 text-ink-muted" data-testid="module-unlock-reason">
                {t.lockedHint(module.unlockAfterPosition ?? Math.max(1, module.position - 1))}
              </span>
            ) : null}
          </span>
          <span
            aria-hidden="true"
            className={`inline-flex h-36 w-36 shrink-0 items-center justify-center rounded-10 bg-canvas ${expanded ? 'rotate-180' : ''}`}
          >
            <svg
              fill="none"
              height="16"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.2"
              viewBox="0 0 24 24"
              width="16"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
        </button>
        <span
          className={`rounded-full px-12 py-6 text-12 font-700 whitespace-nowrap ${statusStyle}`}
          data-status={module.status}
          data-testid={`programme-module-${String(module.position)}-status`}
        >
          {statusLabel}
        </span>
        {module.status === 'validated' && href !== null ? (
          <a
            className="inline-flex min-h-44 items-center rounded-12 border border-border-strong bg-surface px-16 text-14 font-600 text-ink"
            data-testid={`programme-module-${String(module.position)}-action`}
            href={`${href}/cours`}
          >
            {t.reviewCourse}
          </a>
        ) : null}
        {module.status === 'open' && href !== null ? (
          <a
            className="inline-flex min-h-44 items-center rounded-12 bg-ink px-16 text-14 font-700 text-white"
            data-testid={`programme-module-${String(module.position)}-action`}
            href={href}
          >
            {t.openModule}
          </a>
        ) : null}
      </div>
      {expanded ? (
        <div className="flex flex-col gap-12 px-16 pb-18 pl-[70px]">
          <ol className="m-0 grid list-none grid-cols-1 gap-8 p-0 md:grid-cols-2">
            {chapters.map((chapter) => (
              <li
                className="flex items-center gap-10 rounded-14 bg-surface-subtle px-14 py-12 text-14 font-500"
                data-testid={`programme-chapter-${String(chapter.position)}`}
                key={chapter.id}
              >
                <span
                  aria-hidden="true"
                  className={
                    module.status === 'validated'
                      ? 'inline-flex h-24 w-24 shrink-0 items-center justify-center rounded-7 bg-indigo text-12 font-700 text-white'
                      : 'inline-flex h-24 w-24 shrink-0 items-center justify-center rounded-7 border border-border bg-surface text-12 font-700 text-ink'
                  }
                >
                  {module.status === 'validated' ? '✓' : chapter.position}
                </span>
                <span className="flex flex-col gap-2">
                  <span>{chapter.title}</span>
                  <span className="text-12 text-ink-muted">
                    {t.chapterStatus[chapter.contributionsStatus]}
                  </span>
                </span>
              </li>
            ))}
          </ol>
          {module.status === 'open' && href !== null ? (
            <div className="flex flex-wrap gap-8">
              <a
                className="inline-flex min-h-44 items-center rounded-12 border border-border-strong bg-surface px-16 text-14 font-600 text-ink"
                href={href}
              >
                {t.apports}
              </a>
              <a
                className="inline-flex min-h-44 items-center rounded-12 border border-border-strong bg-surface px-16 text-14 font-600 text-ink"
                href={`${href}/cours`}
              >
                {t.readCourse}
              </a>
              <a
                className="inline-flex min-h-44 items-center rounded-12 border border-border-strong bg-surface px-16 text-14 font-600 text-ink"
                href={`${href}/exercices`}
              >
                {t.practice}
              </a>
              <a
                className="inline-flex min-h-44 items-center rounded-12 bg-lime px-16 text-14 font-700 text-ink"
                href={`${href}/quiz`}
              >
                {t.passQuiz}
              </a>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
