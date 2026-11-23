// Oracle vectors of the automation engine (SPEC-2205).
//
// Runs the TypeScript implementation on the inputs the pytest suite replays, so the Python port of
// the pure rules is compared to the source of truth instead of to a hand-written expectation.
//
//   corepack pnpm exec tsx tools/engagement/oracle-automations.mjs
import { writeFileSync } from 'node:fs';

import { startOfUserWeek } from '../../packages/automations/src/moteur-d-automatismes.ts';
import {
  sortAutomationActions,
  weekAutomationJournal,
} from '../../packages/automations/src/parametres-automatismes.ts';
import {
  formatWeeklyStudy,
  isAtRiskNotion,
  isoWeekKey,
  sortAtRiskNotions,
  sumPlanMinutes,
  weeklyPeriodLabel,
  weeklyReceivedLabel,
  weeklyRetentionLabel,
  weeklyReviewWeek,
} from '../../packages/contracts/src/automatisme-9-bilan-de-la-semaine.ts';
import { decodeCursor, encodeCursor } from '../../packages/contracts/src/cursor.ts';
import {
  AutomationActionKind,
  AutomationSummary,
} from '../../packages/contracts/src/moteur-d-automatismes.ts';
import { automationParamsSchema } from '../../packages/contracts/src/parametres-automatismes.ts';
import {
  pauseEndDateInZone,
  pauseSummary,
  validatePauseEndDate,
} from '../../packages/services/src/pause/index.ts';

const AT = '2026-11-11T12:20:00.000Z';
const NIGHT = '2026-11-11T22:30:00.000Z';
const SUNDAY = '2026-11-15T10:00:00.000Z';
const MONDAY = '2026-11-16T00:30:00.000Z';

function issueOf(result) {
  if (result.success) return { ok: true, data: result.data };
  const issue = result.error.issues[0];
  return {
    ok: false,
    path: (issue?.path ?? []).map(String).join('.'),
    message: issue?.message ?? '',
  };
}

const PARAMS_CASES = [
  { key: 'reprise', input: {} },
  { key: 'reprise', input: { inactiveDays: 3, lightenDays: 7, mode: 'auto' } },
  { key: 'reprise', input: { inactiveDays: 9 } },
  { key: 'reprise', input: { inactiveDays: 3, lightenDays: 2 } },
  { key: 'reprise', input: { mode: 'x' } },
  { key: 'reprise', input: { unknownKey: true } },
  { key: 'micro_seance', input: {} },
  { key: 'micro_seance', input: { hour: 19, durationMin: 10 } },
  { key: 'micro_seance', input: { hour: 18 } },
  { key: 'micro_seance', input: { durationMin: 7 } },
  { key: 'echauffement', input: {} },
  { key: 'echauffement', input: { count: 5, scope: 'yesterday' } },
  { key: 'echauffement', input: { count: 4 } },
  { key: 'echauffement', input: { scope: 'yesterday_and_prerequisites' } },
  { key: 'echauffement', input: { questionCount: 5 } },
  { key: 'echauffement', input: { questionCount: 2, count: 5 } },
  { key: 'remediation', input: {} },
  { key: 'remediation', input: { delayHours: 48, mode: 'mandatory' } },
  { key: 'remediation', input: { retryDelayHours: 48 } },
  { key: 'remediation', input: { mode: 'required' } },
  { key: 'remediation', input: { delayHours: 5 } },
  { key: 'remediation', input: { mode: 'x' } },
  { key: 'jeu_lacune', input: {} },
  { key: 'jeu_lacune', input: { preference: 'matching' } },
  { key: 'jeu_lacune', input: { preference: 'x' } },
  { key: 'questions_cartes', input: {} },
  { key: 'questions_cartes', input: { mode: 'auto' } },
  { key: 'questions_cartes', input: { mode: 'x' } },
  { key: 'plafond_quiz', input: {} },
  { key: 'plafond_quiz', input: { maxMinutes: 30, targetRetention: 0.95 } },
  { key: 'plafond_quiz', input: { maxMinutes: 12 } },
  { key: 'plafond_quiz', input: { targetRetention: 0.8 } },
  { key: 'sprint', input: {} },
  { key: 'sprint', input: { daysBefore: 2, durationMin: 5 } },
  { key: 'sprint', input: { durationMin: 120 } },
  { key: 'sprint', input: { daysBefore: 4 } },
  { key: 'sprint', input: { durationMin: 4 } },
  { key: 'sprint', input: { durationMin: 121 } },
  { key: 'bilan', input: {} },
  { key: 'bilan', input: { weekday: 5, hour: 18, channel: 'app_email' } },
  { key: 'bilan', input: { weekday: 4 } },
  { key: 'bilan', input: { hour: 17 } },
  { key: 'bilan', input: { channel: 'email' } },
  { key: 'pause', input: {} },
  { key: 'pause', input: { pauseUntil: '2026-11-20', diagnosticOnReturn: false } },
  { key: 'pause', input: { pauseUntil: '2026-11-1' } },
  { key: 'pause', input: { diagnosticMinutes: 4 } },
  { key: 'pause', input: { diagnosticMinutes: 31 } },
  { key: 'pause', input: { diagnosticOnReturn: 'yes' } },
  { key: 'pause', input: { unexpected: 1 } },
];

const SUMMARY_CASES = [
  'Pause déclarée jusqu’au 2026-11-20.',
  'Annulé : Sprint placé avant le jalon.',
  '  espaces autour  ',
  '',
  '   ',
  'ligne\nsuivante',
  'x'.repeat(160),
  'x'.repeat(161),
];

const KIND_CASES = [
  'warmup_added',
  'pause_ended',
  'Micro_Session',
  'micro_session',
  '_leading',
  'a'.repeat(80),
  'a'.repeat(81),
  'with-dash',
  '',
];

const SELECTION_ACTIONS = [
  { id: '00000000-0000-4000-8000-00000000000b', automation: 'sprint', createdAt: AT },
  { id: '00000000-0000-4000-8000-00000000000a', automation: 'bilan', createdAt: AT },
  { id: '00000000-0000-4000-8000-00000000000c', automation: 'reprise', createdAt: NIGHT },
  { id: '00000000-0000-4000-8000-00000000000d', automation: 'pause', createdAt: SUNDAY },
  {
    id: '00000000-0000-4000-8000-00000000000e',
    automation: 'bilan',
    createdAt: '2026-11-09T08:00:00.000Z',
  },
];

const CURSOR_VALUES = [
  { k: '2026-11-11T12:20:00.000Z', id: '00000000-0000-4000-8000-00000000000a' },
  { k: 20261111, id: 'abc' },
  { k: '', id: 'x' },
];

const EXPIRY_CASES = [
  { status: 'pending_consent', payload: { dedupeKey: 'x', expiresAt: '2026-11-11T12:00:00.000Z' } },
  { status: 'pending_consent', payload: { dedupeKey: 'x', expiresAt: AT } },
  { status: 'pending_consent', payload: { dedupeKey: 'x', expiresAt: '2026-11-11T13:00:00.000Z' } },
  { status: 'pending_consent', payload: { dedupeKey: 'x' } },
  { status: 'applied', payload: { dedupeKey: 'x', expiresAt: '2026-11-11T12:00:00.000Z' } },
  { status: 'pending_consent', payload: { dedupeKey: 'x', expiresAt: 'not-an-instant' } },
];

const WEEK_CASES = [
  { instant: AT, timeZone: 'Europe/Paris' },
  { instant: NIGHT, timeZone: 'Europe/Paris' },
  { instant: SUNDAY, timeZone: 'Europe/Paris' },
  { instant: MONDAY, timeZone: 'Europe/Paris' },
  { instant: AT, timeZone: 'America/New_York' },
  { instant: '2026-01-01T00:30:00.000Z', timeZone: 'Europe/Paris' },
  { instant: '2026-12-31T23:30:00.000Z', timeZone: 'UTC' },
];

const DAYS = ['2026-11-09', '2026-11-15', '2026-01-01', '2026-12-31', '2026-03-02', 'not-a-day'];

const AT_RISK_CASES = [
  {
    now: AT,
    notions: [
      {
        notionId: 'b',
        label: 'Beta',
        mastery: 42,
        dueAt: '2026-11-11T10:00:00.000Z',
        gapNature: null,
        gapClearedAt: null,
      },
      {
        notionId: 'a',
        label: 'Alpha',
        mastery: 42,
        dueAt: null,
        gapNature: 'confusion',
        gapClearedAt: null,
      },
      {
        notionId: 'c',
        label: 'Gamma',
        mastery: 59.5,
        dueAt: AT,
        gapNature: null,
        gapClearedAt: '2026-11-01T00:00:00.000Z',
      },
      {
        notionId: 'd',
        label: 'Delta',
        mastery: 60,
        dueAt: AT,
        gapNature: 'confusion',
        gapClearedAt: null,
      },
      {
        notionId: 'e',
        label: 'Epsilon',
        mastery: 10,
        dueAt: '2026-11-11T12:20:01.000Z',
        gapNature: null,
        gapClearedAt: null,
      },
      {
        notionId: 'f',
        label: 'Zêta',
        mastery: 10,
        dueAt: '2026-11-11T12:20:00.000Z',
        gapNature: null,
        gapClearedAt: null,
      },
      {
        notionId: 'g',
        label: 'Êta',
        mastery: 42,
        dueAt: null,
        gapNature: 'confusion',
        gapClearedAt: null,
      },
    ],
  },
];

const STUDY_MINUTES = [0, 59, 60, 61, 90, 125, 600, -5, 59.6];

const RETENTION_RATES = [null, 0, 85.4, 85.5, 100, 12.2];

const PERIODS = [
  ['2026-11-02', '2026-11-08'],
  ['2026-11-02', '2026-11-30'],
  ['2026-12-28', '2027-01-03'],
];

const PLAN_CASES = [
  [],
  [{ date: '2026-11-17', minutes: 30, slots: 1 }],
  [
    { date: '2026-11-17', minutes: 30, slots: 1 },
    { date: '2026-11-18', minutes: 45, slots: 2 },
  ],
];

writeFileSync(
  'packages-py/learny/tests/fixtures/engagement_automations.json',
  `${JSON.stringify(
    {
      params: PARAMS_CASES.map((entry) => ({
        key: entry.key,
        input: entry.input,
        ...issueOf(automationParamsSchema(entry.key).safeParse(entry.input)),
      })),
      summaries: SUMMARY_CASES.map((value) => ({
        value,
        ...issueOf(AutomationSummary.safeParse(value)),
      })),
      kinds: KIND_CASES.map((value) => ({
        value,
        ok: AutomationActionKind.safeParse(value).success,
      })),
      selection: {
        actions: SELECTION_ACTIONS,
        sorted: sortAutomationActions(SELECTION_ACTIONS).map((action) => action.id),
        weeks: [0, 3, 5, 9].map((count) => ({
          count,
          ids: weekAutomationJournal(SELECTION_ACTIONS, count).map((action) => action.id),
        })),
      },
      cursors: CURSOR_VALUES.map((value) => ({
        value,
        encoded: encodeCursor(value),
        decoded: decodeCursor(encodeCursor(value)),
      })),
      cursorGarbage: ['', 'not-base64!', 'eyJhIjoxfQ', 'W10', encodeCursor({ k: AT, id: 'x' })].map(
        (value) => ({ value, decoded: decodeCursor(value) }),
      ),
      expiry: EXPIRY_CASES.map((entry) => ({
        ...entry,
        due:
          entry.status === 'pending_consent' &&
          typeof entry.payload.expiresAt === 'string' &&
          !Number.isNaN(Date.parse(entry.payload.expiresAt)) &&
          Date.parse(entry.payload.expiresAt) <= Date.parse(AT),
      })),
      weeks: WEEK_CASES.map((entry) => ({
        ...entry,
        week: weeklyReviewWeek(new Date(entry.instant), entry.timeZone),
        startOfUserWeek: startOfUserWeek(new Date(entry.instant), entry.timeZone).toISOString(),
      })),
      weekKeys: DAYS.map((day) => ({ day, weekKey: isoWeekKey(day) })),
      studyLabels: STUDY_MINUTES.map((minutes) => ({ minutes, label: formatWeeklyStudy(minutes) })),
      retentionLabels: RETENTION_RATES.map((rate) => ({ rate, label: weeklyRetentionLabel(rate) })),
      periodLabels: PERIODS.map(([start, end]) => ({
        start,
        end,
        label: weeklyPeriodLabel(start, end),
      })),
      receivedLabels: [
        { instant: AT, timeZone: 'Europe/Paris' },
        { instant: NIGHT, timeZone: 'Europe/Paris' },
        { instant: SUNDAY, timeZone: 'Europe/Paris' },
        { instant: AT, timeZone: 'America/New_York' },
      ].map((entry) => ({
        ...entry,
        label: weeklyReceivedLabel(new Date(entry.instant), entry.timeZone),
      })),
      atRisk: AT_RISK_CASES.map((entry) => ({
        now: entry.now,
        notions: entry.notions,
        atRisk: entry.notions.map((notion) => isAtRiskNotion(notion, new Date(entry.now))),
        sorted: sortAtRiskNotions(
          entry.notions
            .filter((notion) => isAtRiskNotion(notion, new Date(entry.now)))
            .map((notion) => ({
              notionId: notion.notionId,
              label: notion.label,
              mastery: notion.mastery,
            })),
        ),
      })),
      planMinutes: PLAN_CASES.map((plan) => ({ plan, minutes: sumPlanMinutes(plan) })),
      pause: {
        summaries: ['pause_started', 'pause_ended'].flatMap((kind) =>
          ['tu', 'vous'].flatMap((tone) =>
            [true, false].map((enabled) => ({
              kind,
              tone,
              enabled,
              text: pauseSummary(kind, '2026-11-20', enabled, tone),
            })),
          ),
        ),
        endDates: ['2026-11-20', '2026-11-11', '2026-11-10', '2026-11-1', '2026-1-1'].map(
          (endDate) => ({
            endDate,
            localDay: '2026-11-11',
            result: validatePauseEndDate(endDate, '2026-11-11'),
          }),
        ),
        endDateInZone: [
          { instant: AT, timeZone: 'Europe/Paris', days: 3 },
          { instant: AT, timeZone: 'America/New_York', days: 7 },
          { instant: '2026-12-31T23:30:00.000Z', timeZone: 'UTC', days: 1 },
        ].map((entry) => ({
          ...entry,
          endDate: pauseEndDateInZone(new Date(entry.instant), entry.timeZone, entry.days),
        })),
      },
    },
    null,
    2,
  )}\n`,
  'utf8',
);
console.log('automations oracle written');
