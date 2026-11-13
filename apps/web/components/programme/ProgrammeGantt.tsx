import type { ActiveProgrammeDto } from '@learny/contracts';
import { colors } from '@learny/ui/tokens';

import { fr } from '../../messages/fr';

import { barGeometry, dayDiff, formatRange, mondayOf, programmeWeeks } from './dates';

const t = fr.programme;

function legend(style: string, label: string) {
  return (
    <li className="flex items-center gap-6">
      <span aria-hidden="true" className={style} />
      {label}
    </li>
  );
}

export interface ProgrammeGanttProps {
  programme: ActiveProgrammeDto;
}

/** EF-2, CL-5 — Gantt of the active programme: civil dates, statuses, quiz markers and today. */
export function ProgrammeGantt({ programme }: ProgrammeGanttProps) {
  const first = programme.calendar[0];
  const last = programme.calendar.at(-1);
  if (first === undefined || last === undefined) return null;
  const from = mondayOf(first.start);
  const to = last.end;
  const weeks = programmeWeeks(from, to);
  const totalDays = Math.max(1, dayDiff(from, to) + 1);
  const todayOffset = dayDiff(from, programme.today);
  const showToday = todayOffset >= 0 && todayOffset < totalDays;
  const todayFraction = showToday ? todayOffset / totalDays : 0;
  const active = programme.formation.status === 'active';

  return (
    <section
      aria-labelledby="t-cal"
      className="flex flex-col gap-16 rounded-24 border border-border bg-surface p-24"
      data-testid="programme-calendar"
    >
      <div className="flex flex-wrap items-center justify-between gap-12">
        <h2 className="m-0 font-display text-22 font-600 tracking-heading" id="t-cal">
          {t.calendarTitle}
        </h2>
        <ul className="m-0 flex list-none flex-wrap gap-14 p-0 text-13 text-ink-muted">
          {legend('h-10 w-18 rounded-4 bg-indigo', t.moduleStatus.validated)}
          {legend('h-10 w-18 rounded-4 bg-ink ring-2 ring-lime', t.activeModuleStatus.open)}
          {legend('h-10 w-18 rounded-4 bg-canvas ring-1 ring-border-strong', t.moduleStatus.locked)}
          {legend('h-10 w-10 rotate-45 rounded-2 bg-orange', t.legendQuiz)}
        </ul>
      </div>
      <div aria-label={t.calendarTitle} className="overflow-x-auto" role="region" tabIndex={0}>
        <div
          aria-label={t.calendarLabel(
            programme.calendar.length,
            weeks.length,
            formatRange(first.start, last.end),
            formatRange(first.start, last.end),
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
            {showToday && active ? (
              <div
                aria-hidden="false"
                className="absolute top-0 bottom-0 z-2 w-2 bg-orange"
                data-date={programme.today}
                data-testid="programme-today"
                style={{ left: `calc(250px + (100% - 250px) * ${String(todayFraction)})` }}
              >
                <span className="absolute -top-18 -left-26 rounded-6 bg-orange px-6 py-1 text-11 font-700 whitespace-nowrap text-ink">
                  Aujourd’hui
                </span>
              </div>
            ) : null}
            {programme.calendar.map((entry) => {
              const geometry = barGeometry(from, to, entry.start, entry.end);
              const days = Math.max(1, dayDiff(entry.start, entry.end) + 1);
              const done = entry.status === 'validated';
              const open = entry.status === 'open';
              const bar = done
                ? 'bg-indigo text-white'
                : open
                  ? 'bg-ink text-white'
                  : 'bg-canvas text-ink-muted';
              const barShadow = done
                ? undefined
                : open
                  ? `inset 0 0 0 2px ${colors.lime}`
                  : `inset 0 0 0 1px ${colors['border-strong']}`;
              return (
                <div
                  className="flex min-h-44 items-center"
                  data-testid={`programme-gantt-module-${String(entry.position)}`}
                  key={entry.moduleId}
                >
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
                      {entry.position}
                    </span>
                    <span className="text-13 font-600 leading-1.3">{entry.title}</span>
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
                      <span>
                        {done
                          ? t.moduleStatus.validated
                          : open
                            ? t.activeModuleStatus.open
                            : `${String(days)} j`}
                      </span>
                      <span
                        aria-label={
                          entry.quizKind === 'exam'
                            ? `${t.legendExam} · ${formatRange(entry.quizOn, entry.quizOn)}`
                            : `${t.legendQuiz} · ${formatRange(entry.quizOn, entry.quizOn)}`
                        }
                        className="h-10 w-10 rotate-45 rounded-2"
                        data-date={entry.quizOn}
                        data-kind={entry.quizKind}
                        data-testid={`programme-quiz-${String(entry.position)}`}
                        role="img"
                        style={{
                          background: entry.quizKind === 'exam' ? colors.ink : colors.orange,
                        }}
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
