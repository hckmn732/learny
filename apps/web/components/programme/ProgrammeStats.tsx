import type { ActiveProgrammeDto } from '@learny/contracts';

import { fr } from '../../messages/fr';

import { formatDay, formatLongDate } from './dates';

const t = fr.programme;

function StatCard({
  big,
  small,
  dark = false,
  testId,
}: {
  big: string;
  small: string;
  dark?: boolean;
  testId?: string;
}) {
  return (
    <div
      className={
        dark
          ? 'flex flex-1 basis-200 flex-col gap-4 rounded-22 bg-ink p-20 text-white'
          : 'flex flex-1 basis-200 flex-col gap-4 rounded-22 border border-border bg-surface p-20'
      }
    >
      <span
        className={
          dark
            ? 'font-display text-34 font-600 text-lime'
            : 'font-display text-34 font-600 text-ink'
        }
        data-testid={testId}
      >
        {big}
      </span>
      <span className={dark ? 'text-13 text-on-dark-secondary' : 'text-13 text-ink-muted'}>
        {small}
      </span>
    </div>
  );
}

export interface ProgrammeStatsProps {
  programme: ActiveProgrammeDto;
}

/** BR-FOR-09, BR-PRO-01 — the four indicators of the active programme. */
export function ProgrammeStats({ programme }: ProgrammeStatsProps) {
  const { formation, indicators } = programme;
  const from = formation.startDate;
  const to = formation.endDate;
  const dates =
    from === null || to === null ? '' : t.statsDates(formatDay(from), formatLongDate(to));

  return (
    <div className="flex flex-wrap gap-12" data-testid="programme-stats">
      <StatCard
        dark
        big={`${String(indicators.progress.percent)} %`}
        small={t.statsValidated(indicators.progress.validated, indicators.progress.total)}
        testId="programme-progress"
      />
      <StatCard big={t.statsWeeks(indicators.weeks)} small={dates} />
      <StatCard
        big={indicators.volumeHours === null ? '—' : `${String(indicators.volumeHours)} h`}
        small={t.statsRhythm(indicators.hoursPerDay, indicators.studyDaysPerWeek)}
      />
      <StatCard big={`${String(indicators.threshold)} %`} small={t.statsThreshold} />
    </div>
  );
}
