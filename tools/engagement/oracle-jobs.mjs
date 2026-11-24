// Oracle vectors of the engagement job use cases (SPEC-2205).
//
// Runs the TypeScript planning helpers on the inputs the pytest suite replays, so the Python port
// is compared to the source of truth instead of to a hand-written expectation.
//
//   corepack pnpm exec tsx tools/engagement/oracle-jobs.mjs
import { writeFileSync } from 'node:fs';

import { buildLocalTick, tickInstant } from '../../packages/jobs/src/tick.ts';
import { dueInWindow } from '../../packages/jobs/src/time-window.ts';
import {
  localMomentLabel,
  validationQuizReminderSchedule,
} from '../../packages/notifications/src/producers/index.ts';
import {
  nextReminderInstant,
  reminderKeyOf,
  reminderWindow,
} from '../../packages/notifications/src/producers/reminders.ts';

const USER = '00000000-0000-4000-8000-000000000001';
const SLOT = '00000000-0000-4000-8000-000000000002';
const NOW = '2026-11-11T12:20:00.000Z';

const TICKS = [
  { tick: '2026-11-11T07:00:00.000Z', timezone: 'Europe/Paris', hhmm: '08:00' },
  { tick: '2026-11-11T12:20:00.000Z', timezone: 'Europe/Paris', hhmm: '12:00' },
  { tick: '2026-11-11T12:20:00.000Z', timezone: 'Europe/Paris', hhmm: '13:30' },
  { tick: '2026-03-29T00:50:00.000Z', timezone: 'Europe/Paris', hhmm: '02:30' },
  { tick: '2026-10-25T00:20:00.000Z', timezone: 'Europe/Paris', hhmm: '02:30' },
  { tick: '2026-11-11T12:20:00.000Z', timezone: 'Asia/Kolkata', hhmm: '18:15' },
  { tick: '2026-11-11T12:20:00.000Z', timezone: 'America/New_York', hhmm: '07:30' },
  { tick: '2026-11-11T12:20:00.000Z', timezone: 'Europe/Paris', hhmm: '14:20' },
];

const windows = TICKS.map(({ tick, timezone, hhmm }) => {
  const at = new Date(tick);
  const local = buildLocalTick({ userId: USER, timezone }, at);
  const due = local === null ? null : dueInWindow(hhmm, local);
  return {
    tick,
    timezone,
    hhmm,
    truncated: tickInstant(at).toISOString(),
    local:
      local === null
        ? null
        : {
            windowStart: local.windowStart,
            windowEnd: local.windowEnd,
            localDate: local.localDate,
            localWeekday: local.localWeekday,
          },
    due: due === null ? null : due.toISOString(),
  };
});

const REMINDER_STARTS = [
  '2026-11-11T14:00:00.000Z',
  '2026-11-12T08:00:00.000Z',
  '2026-03-29T01:30:00.000Z',
  '2026-10-25T01:30:00.000Z',
];

const reminders = REMINDER_STARTS.map((startsAt) => {
  const schedule = validationQuizReminderSchedule(SLOT, startsAt, 'Europe/Paris');
  return {
    startsAt,
    timezone: 'Europe/Paris',
    eligibleAt: schedule.eligibleAt.toISOString(),
    localTime: schedule.localTime,
    localDay: schedule.localDay,
    dedupeKey: schedule.dedupeKey,
    reminderAt: nextReminderInstant(startsAt).toISOString(),
    keyOf: reminderKeyOf(SLOT, startsAt),
    when: localMomentLabel(startsAt, 'Europe/Paris', new Date(NOW)),
  };
});

const LABELS = [
  { instant: '2026-11-11T14:00:00.000Z', timezone: 'Europe/Paris' },
  { instant: '2026-11-11T14:00:00.000Z', timezone: 'America/New_York' },
  { instant: '2026-11-12T08:00:00.000Z', timezone: 'Europe/Paris' },
  { instant: '2026-11-13T09:00:00.000Z', timezone: 'Europe/Paris' },
  { instant: '2026-11-12T23:30:00.000Z', timezone: 'Asia/Kolkata' },
];

const labels = LABELS.map(({ instant, timezone }) => ({
  instant,
  timezone,
  label: localMomentLabel(instant, timezone, new Date(NOW)),
}));

const window = reminderWindow(new Date(NOW));

const DIGEST_DATES = [
  { instant: '2026-11-11T00:00:00.000Z', timezone: 'Europe/Paris' },
  { instant: '2026-01-01T00:00:00.000Z', timezone: 'Europe/Paris' },
  { instant: '2026-08-15T00:00:00.000Z', timezone: 'America/New_York' },
];

const digestDates = DIGEST_DATES.map(({ instant, timezone }) => {
  const at = new Date(instant);
  const dateLabel = new Intl.DateTimeFormat('fr-FR', {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(at);
  const time = new Intl.DateTimeFormat('fr-FR', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(at);
  return { instant, timezone, dateLabel, time };
});

const fixture = {
  now: NOW,
  window: { from: window.from.toISOString(), to: window.to.toISOString() },
  windows,
  reminders,
  labels,
  digestDates,
};

writeFileSync(
  'python/learny/tests/fixtures/engagement_jobs.json',
  `${JSON.stringify(fixture, null, 2)}\n`,
);
