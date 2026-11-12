'use client';

import { useState } from 'react';

import { ENGINE } from '@learny/config/product';
import {
  calculateStreak,
  detectMilestones,
  isoWeekday,
  type DailyActivityEntry,
  type Milestone,
  type MilestoneKind,
  type StreakCalendarDay,
  type StreakDayStatus,
  type StreakResult,
} from '@learny/learning-engine';
import { Badge, Button, StatCard, StatRow } from '@learny/ui';

import { BaseCard, BaseTokenStyle } from '../sdd/base-tokens';

const AT = '2026-11-11T12:20:00.000Z';
const PARIS = 'Europe/Paris';
const STREAK_PARAMS = { ...ENGINE.streak };
const MILESTONE_PARAMS = {
  notionsRetained: ENGINE.milestones.notionsRetained,
  streakDays: ENGINE.milestones.streakDays,
};

const MAIN_ACTIVITY: DailyActivityEntry[] = [
  { at: '2026-11-06T18:00:00.000Z', kind: 'quiz' },
  { at: '2026-11-09T18:00:00.000Z', kind: 'exercise' },
  { at: '2026-11-10T18:00:00.000Z', kind: 'reading', durationSeconds: 300 },
];
const MAIN_PAUSES = [{ startsOn: '2026-11-05', endsOn: '2026-11-05' }];
const MAIN_STUDY_DAYS = [1, 2, 3, 4, 5] as const;
const NEUTRALITY_ACTIVITY: DailyActivityEntry[] = [
  { at: '2026-11-06T18:00:00.000Z', kind: 'quiz' },
  { at: '2026-11-09T18:00:00.000Z', kind: 'exercise' },
];
const ALL_WEEK = [1, 2, 3, 4, 5] as const;
const WITHOUT_TUESDAY = [1, 3, 4, 5] as const;

const KIND_LABELS: Record<DailyActivityEntry['kind'], string> = {
  global_quiz: 'Quiz global',
  micro_session: 'Micro-séance',
  quiz: 'Quiz',
  exercise: 'Exercice',
  exam: 'Examen',
  reading: 'Lecture',
  contribution: 'Dépôt d’apport',
};

const STATUS_LABELS: Record<StreakDayStatus, string> = {
  studied: 'étudié',
  neutral: 'neutre',
  missed: 'manqué',
};
const STATUS_TONES: Record<StreakDayStatus, 'green' | 'neutral' | 'orange'> = {
  studied: 'green',
  neutral: 'neutral',
  missed: 'orange',
};

const MILESTONE_LABELS: Record<MilestoneKind, string> = {
  module_validated: 'Module validé',
  notions_100: '100 notions retenues',
  streak_30: '30 jours de série',
};

const WEEKDAY_LABELS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'] as const;

const MAIN_RESULT = calculateStreak({
  dailyActivity: MAIN_ACTIVITY,
  studyDays: MAIN_STUDY_DAYS,
  pauses: MAIN_PAUSES,
  at: AT,
  timeZone: PARIS,
  params: STREAK_PARAMS,
});

const MILESTONE_INPUT = {
  validatedModules: ['sap-m1', 'sap-m2'],
  masteredNotions: ENGINE.milestones.notionsRetained,
  streakDays: ENGINE.milestones.streakDays,
} as const;
const NEW_MILESTONES = detectMilestones({
  previousKeys: [],
  ...MILESTONE_INPUT,
  params: MILESTONE_PARAMS,
});
const RECALCULATED_MILESTONES = detectMilestones({
  previousKeys: NEW_MILESTONES.map((milestone) => milestone.key),
  ...MILESTONE_INPUT,
  params: MILESTONE_PARAMS,
});

function weekdayLabel(date: string): string {
  return WEEKDAY_LABELS[isoWeekday(date) - 1] ?? '';
}

function dayLabel(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

function instantLabel(instant: string): string {
  return `${instant.slice(0, 10)} ${instant.slice(11, 16)} UTC`;
}

function isPlanned(date: string, studyDays: readonly number[]): boolean {
  return studyDays.includes(isoWeekday(date));
}

interface StepRow {
  day: StreakCalendarDay;
  effect: string;
}

/** Display-only replay of the documented walk: studied adds one, neutral skips, missed stops. */
function stepRows(result: StreakResult, reference: string): StepRow[] {
  let broken = false;
  return [...result.calendar].reverse().map((day) => {
    if (broken) return { day, effect: 'hors parcours' };
    if (day.status === 'studied') return { day, effect: '+1 jour' };
    if (day.date === reference) return { day, effect: 'en cours, conservé' };
    if (day.status === 'neutral') return { day, effect: 'neutre, ignoré' };
    broken = true;
    return { day, effect: 'rupture de série' };
  });
}

function milestoneLabel(milestone: Milestone): string {
  const base = MILESTONE_LABELS[milestone.kind];
  return milestone.moduleId === null ? base : `${base} · ${milestone.moduleId}`;
}

function CalendarStrip({ result }: Readonly<{ result: StreakResult }>) {
  return (
    <ol
      aria-label="Régularité sur les 14 derniers jours"
      className="m-0 grid list-none grid-cols-7 gap-2 p-0 max-[479px]:grid-cols-4"
    >
      {result.calendar.map((day) => (
        <li
          key={day.date}
          data-testid={`streak-day-${day.date}`}
          data-date={day.date}
          data-status={day.status}
          className="rounded-12 border border-solid border-border bg-canvas p-2 text-center"
        >
          <span className="block text-11 text-ink-muted">{weekdayLabel(day.date)}</span>
          <span className="block font-display text-14 font-600 text-ink">{dayLabel(day.date)}</span>
          <Badge tone={STATUS_TONES[day.status]} size="sm" className="mt-1">
            {STATUS_LABELS[day.status]}
          </Badge>
        </li>
      ))}
    </ol>
  );
}

function CalendarLegend() {
  return (
    <ul
      aria-label="Légende de la régularité"
      className="m-0 mt-4 flex list-none flex-wrap gap-3 p-0"
    >
      {(['studied', 'neutral', 'missed'] as const).map((status) => (
        <li key={status} className="flex items-center gap-2 text-12 text-ink-secondary">
          <Badge tone={STATUS_TONES[status]} size="sm">
            {STATUS_LABELS[status]}
          </Badge>
          {status === 'studied'
            ? 'une activité qualifiante a été terminée'
            : status === 'neutral'
              ? 'jour non prévu, pause ou jour en cours'
              : 'jour prévu sans activité terminée'}
        </li>
      ))}
    </ul>
  );
}

export default function Spec409Demo() {
  const [unplannedTuesday, setUnplannedTuesday] = useState(false);
  const interactive = calculateStreak({
    dailyActivity: NEUTRALITY_ACTIVITY,
    studyDays: unplannedTuesday ? WITHOUT_TUESDAY : ALL_WEEK,
    pauses: [],
    at: AT,
    timeZone: PARIS,
    params: STREAK_PARAMS,
  });
  const rows = stepRows(interactive, '2026-11-11');

  return (
    <>
      <BaseTokenStyle />
      <BaseCard testId="streak-summary" title="Série courante">
        <StatRow>
          <StatCard
            tone="dark"
            value={String(MAIN_RESULT.days)}
            label="jours d’étude consécutifs"
            data-testid="streak-days"
          />
          <StatCard
            value={MAIN_RESULT.lastQualifyingDay ?? '—'}
            label="dernier jour qualifiant"
            data-testid="streak-last-qualifying"
          />
          <StatCard
            value={MAIN_RESULT.calendar.at(-1)?.date ?? '—'}
            label="jour local de référence"
            data-testid="streak-reference-day"
          />
          <StatCard
            value={String(MAIN_RESULT.calendar.length)}
            label="cases de régularité"
            data-testid="streak-calendar-size"
          />
        </StatRow>

        <div className="mt-5 grid gap-4 text-13 text-ink-secondary md:grid-cols-2">
          <div data-testid="streak-input-activity">
            <h3 className="m-0 font-display text-15 font-600 text-ink">Activités terminées</h3>
            <ul className="m-0 mt-2 list-none p-0">
              {MAIN_ACTIVITY.map((activity) => (
                <li
                  key={`${activity.at}-${activity.kind}`}
                  className="border-b border-divider py-1"
                >
                  {KIND_LABELS[activity.kind]} · {instantLabel(activity.at)}
                  {activity.kind === 'reading'
                    ? ` · ${String(activity.durationSeconds ?? 0)} s`
                    : null}
                </li>
              ))}
            </ul>
          </div>
          <div data-testid="streak-input-rules">
            <h3 className="m-0 font-display text-15 font-600 text-ink">Rythme et paramètres</h3>
            <p className="m-0 mt-2">
              Fuseau : <code>{PARIS}</code> · instant : <code>{AT}</code>
            </p>
            <p className="m-0 mt-1">Jours prévus : lundi à vendredi.</p>
            <p className="m-0 mt-1">Pause : jeudi 5 novembre (jour neutre).</p>
            <p className="m-0 mt-1">
              Lecture qualifiante : {String(STREAK_PARAMS.readingMinSeconds)} s · régularité :{' '}
              {String(STREAK_PARAMS.regularityDays)} jours · borne :{' '}
              {String(STREAK_PARAMS.maxLookbackDays)} jours.
            </p>
          </div>
        </div>
      </BaseCard>

      <BaseCard testId="streak-calendar" title="Régularité sur 14 jours">
        <CalendarStrip result={MAIN_RESULT} />
        <CalendarLegend />
      </BaseCard>

      <BaseCard testId="streak-steps" title="Détail du calcul">
        <p className="m-0 text-13 text-ink-secondary">
          Scénario interactif : vendredi et lundi étudiés, mardi sans activité. Le jour de référence
          est encore en cours.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={() => {
              setUnplannedTuesday((value) => !value);
            }}
            data-testid="toggle-unplanned-day"
          >
            {unplannedTuesday ? 'Revenir au mardi prévu' : 'Simuler un jour non prévu (mardi)'}
          </Button>
          <Badge tone={unplannedTuesday ? 'lime' : 'neutral'} size="md">
            {unplannedTuesday ? 'Mardi non prévu' : 'Mardi prévu'}
          </Badge>
          <span data-testid="neutrality-result" className="font-display text-18 font-600 text-ink">
            Série : {String(interactive.days)} jour{interactive.days === 1 ? '' : 's'}
          </span>
        </div>
        <p data-testid="neutrality-explanation" className="m-0 mt-3 text-13 text-ink-secondary">
          {unplannedTuesday
            ? 'Mardi devient neutre : vendredi et lundi forment une série de deux jours.'
            : 'Mardi prévu sans activité casse la série : le résultat est zéro.'}
        </p>

        <table className="mt-5 w-full border-collapse text-left text-13">
          <caption className="sr-only">
            Parcours jour par jour du scénario interactif, du jour de référence vers le passé
          </caption>
          <thead>
            <tr>
              <th scope="col" className="border-b border-border py-2 pr-3">
                Jour local
              </th>
              <th scope="col" className="border-b border-border py-2 pr-3">
                Prévu
              </th>
              <th scope="col" className="border-b border-border py-2 pr-3">
                Activité
              </th>
              <th scope="col" className="border-b border-border py-2 pr-3">
                État
              </th>
              <th scope="col" className="border-b border-border py-2">
                Effet
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.day.date} data-testid={`step-${row.day.date}`}>
                <td className="border-b border-divider py-2 pr-3 font-mono text-12">
                  {row.day.date}
                </td>
                <td className="border-b border-divider py-2 pr-3">
                  {isPlanned(row.day.date, unplannedTuesday ? WITHOUT_TUESDAY : ALL_WEEK)
                    ? 'oui'
                    : 'non'}
                </td>
                <td className="border-b border-divider py-2 pr-3">
                  {row.day.status === 'studied' ? 'terminée' : 'aucune'}
                </td>
                <td className="border-b border-divider py-2 pr-3">
                  <Badge tone={STATUS_TONES[row.day.status]} size="sm">
                    {STATUS_LABELS[row.day.status]}
                  </Badge>
                </td>
                <td className="border-b border-divider py-2">{row.effect}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </BaseCard>

      <BaseCard testId="streak-milestones" title="Jalons">
        <p className="m-0 text-13 text-ink-secondary">
          Un module validé, {String(MILESTONE_PARAMS.notionsRetained)} notions à maîtrise ≥{' '}
          {String(ENGINE.milestones.masteryThreshold)} % et {String(MILESTONE_PARAMS.streakDays)}{' '}
          jours de série déclenchent chacun un jalon unique.
        </p>
        <p
          data-testid="milestone-count"
          className="m-0 mt-3 font-display text-18 font-600 text-ink"
        >
          {String(NEW_MILESTONES.length)} nouveau{NEW_MILESTONES.length === 1 ? '' : 'x'} jalon
          {NEW_MILESTONES.length === 1 ? '' : 's'}
        </p>
        <ul
          aria-label="Jalons détectés"
          className="m-0 mt-3 grid list-none gap-2 p-0 md:grid-cols-2"
        >
          {NEW_MILESTONES.map((milestone, index) => (
            <li
              key={milestone.key}
              data-testid={`milestone-award-${String(index)}`}
              data-milestone-key={milestone.key}
              className="flex items-center gap-3 rounded-12 border border-solid border-border bg-canvas p-3"
            >
              <Badge tone="lime" size="sm">
                Nouveau
              </Badge>
              <span className="text-13 font-600 text-ink">{milestoneLabel(milestone)}</span>
            </li>
          ))}
        </ul>
        <p data-testid="milestone-recalc" className="m-0 mt-4 text-13 text-ink-secondary">
          Recalcul avec les clés déjà attribuées : {String(RECALCULATED_MILESTONES.length)} nouveau
          jalon, aucun doublon.
        </p>
      </BaseCard>
    </>
  );
}
