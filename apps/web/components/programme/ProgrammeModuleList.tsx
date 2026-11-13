'use client';

import { useState } from 'react';

import type { ProgrammeModuleDto } from '@learny/contracts';

import { fr } from '../../messages/fr';

import { formatRange } from './dates';

const t = fr.programme;

function ModuleStatus({ status }: { status: ProgrammeModuleDto['status'] }) {
  if (status === null) return null;
  const style =
    status === 'validated'
      ? 'bg-indigo-soft text-indigo-ink-strong'
      : status === 'open'
        ? 'bg-lime text-ink'
        : 'bg-surface-muted text-ink-muted';
  return (
    <span className={`rounded-full px-12 py-6 text-12 font-700 ${style}`}>
      {t.moduleStatus[status]}
    </span>
  );
}

export interface ProgrammeModuleListProps {
  formationId: string;
  modules: readonly ProgrammeModuleDto[];
}

export function ProgrammeModuleList({ formationId, modules }: ProgrammeModuleListProps) {
  const active = modules.some((module) => module.status !== null);
  const [open, setOpen] = useState<number>(modules[0]?.position ?? 0);

  return (
    <section
      aria-labelledby="t-modules"
      className="flex flex-col gap-10"
      data-testid="programme-modules"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-8">
        <h2 className="m-0 font-display text-22 font-600 tracking-heading" id="t-modules">
          {t.modulesTitle}
        </h2>
        {active ? (
          <span className="text-13 text-ink-muted">
            Un module se débloque quand le quiz du précédent atteint son seuil.
          </span>
        ) : null}
      </div>
      <ol className="m-0 flex list-none flex-col gap-10 p-0">
        {modules.map((module) => {
          const expanded = open === module.position;
          const exam = module.position === modules.length;
          return (
            <li
              className={
                expanded
                  ? 'rounded-22 border-[1.5px] border-ink bg-surface'
                  : module.status === 'open'
                    ? 'rounded-22 border-[1.5px] border-lime-border bg-surface'
                    : 'rounded-22 border border-border bg-surface'
              }
              data-testid={`programme-module-${String(module.position)}`}
              key={module.position}
            >
              <div className="flex flex-wrap items-center gap-12 px-16 py-12">
                <button
                  aria-expanded={expanded}
                  className="flex min-h-56 flex-1 basis-320 cursor-pointer items-center gap-14 border-0 bg-transparent p-0 text-left text-ink"
                  onClick={() => {
                    setOpen(expanded ? 0 : module.position);
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
                        module.chapters.length,
                        exam,
                        formatRange(module.plannedStart, module.plannedEnd),
                      )}
                    </span>
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
                <span data-testid={`programme-module-${String(module.position)}-status`}>
                  <ModuleStatus status={module.status} />
                </span>
                {module.status === 'open' ? (
                  <a
                    className="inline-flex min-h-44 items-center rounded-12 bg-ink px-16 text-14 font-700 text-white"
                    href={`/formations/${formationId}/programme#module-${String(module.position)}`}
                  >
                    {t.openModule}
                  </a>
                ) : null}
              </div>
              {expanded ? (
                <div className="flex flex-col gap-12 px-16 pb-18 pl-[70px]">
                  <ol className="m-0 grid list-none grid-cols-1 gap-8 p-0 md:grid-cols-2">
                    {module.chapters.map((chapter) => (
                      <li
                        className="flex flex-col gap-2 rounded-14 bg-surface-subtle px-14 py-12 text-14 font-500"
                        key={chapter.position}
                      >
                        <span className="flex items-center gap-10">
                          <span className="inline-flex h-24 w-24 shrink-0 items-center justify-center rounded-7 border border-border bg-surface text-12 font-700">
                            {chapter.position}
                          </span>
                          {chapter.title}
                        </span>
                        <span className="pl-34 text-12 font-400 leading-1.45 text-ink-muted">
                          {t.chapterNotions(
                            chapter.notions.map((notion) => notion.label).join(' · '),
                          )}
                        </span>
                      </li>
                    ))}
                  </ol>
                  {module.status === 'locked' && module.position > 1 ? (
                    <p className="m-0 text-14 text-ink-muted">
                      {t.lockedHint(module.position - 1)}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
