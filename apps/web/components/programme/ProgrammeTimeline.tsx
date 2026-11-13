'use client';

import type { ProgrammeModuleDto } from '@learny/contracts';
import { colors } from '@learny/ui/tokens';

import { fr } from '../../messages/fr';

import { barGeometry, dayDiff, formatRange, mondayOf, programmeWeeks } from './dates';

const t = fr.programme;

export interface ProgrammeTimelineProps {
  modules: readonly ProgrammeModuleDto[];
}

export function ProgrammeTimeline({ modules }: ProgrammeTimelineProps) {
  const first = modules[0];
  const last = modules.at(-1);
  if (first === undefined || last === undefined) return null;
  const from = mondayOf(first.plannedStart);
  const to = last.plannedEnd;
  const weeks = programmeWeeks(from, to);
  const active = modules.some((module) => module.status !== null);

  return (
    <section
      aria-labelledby="t-cal"
      className="flex flex-col gap-16 rounded-24 border border-border bg-surface p-24"
      data-testid="programme-timeline"
    >
      <div className="flex flex-wrap items-center justify-between gap-12">
        <h2 className="m-0 font-display text-22 font-600 tracking-heading" id="t-cal">
          {t.calendarTitle}
        </h2>
        <ul className="m-0 flex list-none flex-wrap gap-14 p-0 text-13 text-ink-muted">
          <li className="flex items-center gap-6">
            <span
              aria-hidden="true"
              className="h-10 w-18 rounded-4 bg-indigo-soft"
              style={{ boxShadow: `inset 0 0 0 1.5px ${colors.indigo}` }}
            />
            {t.legendModule}
          </li>
          <li className="flex items-center gap-6">
            <span aria-hidden="true" className="h-10 w-10 rotate-45 rounded-2 bg-orange" />
            {t.legendQuiz}
          </li>
          <li className="flex items-center gap-6">
            <span aria-hidden="true" className="h-10 w-10 rotate-45 rounded-2 bg-ink" />
            {t.legendExam}
          </li>
        </ul>
      </div>
      <div aria-label={t.calendarTitle} className="overflow-x-auto" role="region" tabIndex={0}>
        <div
          aria-label={t.calendarLabel(
            modules.length,
            weeks.length,
            formatRange(first.plannedStart, last.plannedEnd),
            formatRange(first.plannedStart, last.plannedEnd),
          )}
          className="flex min-w-[900px] flex-col gap-8"
          role="img"
        >
          <div className="flex">
            <span className="w-[250px] shrink-0" />
            <div
              className="grid flex-1"
              style={{ gridTemplateColumns: `repeat(${String(weeks.length)}, minmax(0, 1fr))` }}
            >
              {weeks.map((week) => (
                <span
                  className="flex flex-col gap-2 border-l border-divider px-8 pb-8"
                  key={week.from}
                >
                  <span className="text-12 font-700">{week.label}</span>
                  <span className="text-12 text-ink-muted">{week.dates}</span>
                </span>
              ))}
            </div>
          </div>
          <div className="relative flex flex-col gap-8">
            {active ? (
              <div
                aria-hidden="true"
                className="absolute top-0 bottom-0 z-2 w-2 bg-orange"
                style={{ left: 'calc(250px + (100% - 250px) * 0.5)' }}
              />
            ) : null}
            {modules.map((module, index) => {
              const geometry = barGeometry(from, to, module.plannedStart, module.plannedEnd);
              const days = Math.max(1, dayDiff(module.plannedStart, module.plannedEnd) + 1);
              const exam = index === modules.length - 1;
              const done = module.status === 'validated';
              const open = module.status === 'open';
              const bar = done
                ? 'bg-indigo text-white'
                : open
                  ? 'bg-ink text-white'
                  : 'bg-indigo-soft text-indigo-ink-strong';
              const barShadow = done
                ? undefined
                : open
                  ? `inset 0 0 0 2px ${colors.lime}`
                  : `inset 0 0 0 1.5px ${colors.indigo}`;
              return (
                <div className="flex min-h-44 items-center" key={module.position}>
                  <span className="flex w-[250px] shrink-0 items-center gap-10 pr-12">
                    <span
                      className={
                        done
                          ? 'inline-flex h-28 w-28 items-center justify-center rounded-8 bg-indigo text-12 font-700 text-white'
                          : open
                            ? 'inline-flex h-28 w-28 items-center justify-center rounded-8 bg-lime text-12 font-700 text-ink'
                            : 'inline-flex h-28 w-28 items-center justify-center rounded-8 bg-canvas text-12 font-700 text-ink'
                      }
                    >
                      {module.position}
                    </span>
                    <span className="text-13 font-600 leading-1.3">{module.title}</span>
                  </span>
                  <span className="relative flex-1 self-stretch">
                    <span
                      aria-hidden="true"
                      className="absolute inset-0"
                      style={{
                        backgroundImage: `repeating-linear-gradient(to right, ${colors.divider} 0, ${colors.divider} 1px, transparent 1px, transparent calc(100% / 6))`,
                      }}
                    />
                    <span
                      className={`absolute top-1/2 flex h-34 -translate-y-1/2 items-center justify-between rounded-10 px-10 text-12 font-700 ${bar}`}
                      style={{
                        left: `${String(geometry.left)}%`,
                        width: `${String(geometry.width)}%`,
                        ...(barShadow === undefined ? {} : { boxShadow: barShadow }),
                      }}
                    >
                      <span>{done ? 'Validé' : open ? 'En cours' : `${String(days)} j`}</span>
                      <span
                        aria-hidden="true"
                        className="h-10 w-10 rotate-45 rounded-2"
                        style={{ background: exam ? colors.ink : colors.orange }}
                      />
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
