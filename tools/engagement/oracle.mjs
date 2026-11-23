// Oracle vectors of the engagement domain (SPEC-2205).
//
// Runs the TypeScript implementation on the inputs the pytest suite replays, so the Python port is
// compared to the source of truth instead of to a hand-written expectation.
//
//   corepack pnpm exec tsx tools/engagement/oracle.mjs
import { writeFileSync } from 'node:fs';

import { isQuietHours, nextOutsideQuietHours, userWeekday } from '../../packages/core/src/time.ts';
import { decideDelivery } from '../../packages/notifications/src/routing.ts';
import {
  NOTIFICATION_TEMPLATES,
  channelsOf,
  clampTitle,
  clampBody,
} from '../../packages/notifications/src/templates/index.ts';

const TYPES = Object.keys(NOTIFICATION_TEMPLATES);

const DATA_SETS = {
  empty: {},
  full: {
    moduleTitle: 'Le module Photosynthèse',
    modulePosition: 3,
    score: 87.6,
    nextModulePosition: 4,
    nextModuleTitle: 'Respiration cellulaire',
    formationId: '0b6b6f0e-3f0c-4a1f-9f0e-1f2a3b4c5d6e',
    formationTitle: 'La biologie végétale',
    notionTitle: 'La chlorophylle',
    title: 'Séance de révision',
    when: 'demain à 09:00',
    minutes: 25,
    notions: 12,
    percent: 82,
    days: 5,
    taskLabel: 'La génération du cours',
    groupTitle: 'Les botanistes',
    label: '100 notions retenues',
    studyLabel: '3 h 15',
    href: '/formations/0b6b6f0e-3f0c-4a1f-9f0e-1f2a3b4c5d6e/programme',
    activityCount: 4,
    plannedLabel: '1 h 30',
  },
  overrides: {
    titleOverride: 'Titre imposé',
    bodyOverride: 'Corps imposé par le producteur.',
    summary: 'Résumé imposé de la séance replacée.',
    isLastModule: true,
  },
  hostile: {
    href: '//evil.example/path',
    formationId: 'not-a-uuid',
    moduleTitle: '   ',
    score: 0,
    minutes: 'vingt',
    activityCount: -3,
    plannedLabel: '',
  },
};

function templates() {
  const out = [];
  for (const type of TYPES) {
    for (const tone of ['vous', 'tu']) {
      for (const [name, data] of Object.entries(DATA_SETS)) {
        const template = NOTIFICATION_TEMPLATES[type];
        out.push({
          type,
          tone,
          dataSet: name,
          icon: template.icon,
          title: template.title(data, tone),
          body: template.body(data, tone),
          href: template.href(data),
          emailTemplate: template.emailTemplate,
          channels: channelsOf(type),
        });
      }
    }
  }
  return out;
}

function clamps() {
  return [
    { input: '  a   b\tc\n', kind: 'title' },
    { input: 'x'.repeat(119), kind: 'title' },
    { input: 'x'.repeat(120), kind: 'title' },
    { input: 'x'.repeat(121), kind: 'title' },
    { input: `${'y'.repeat(118)}  z`, kind: 'title' },
    { input: '  a   b\tc\n', kind: 'body' },
    { input: 'x'.repeat(400), kind: 'body' },
    { input: 'x'.repeat(401), kind: 'body' },
  ].map((entry) => ({
    ...entry,
    out: entry.kind === 'title' ? clampTitle(entry.input) : clampBody(entry.input),
  }));
}

const AT = '2026-11-11T12:20:00.000Z';
const NIGHT = '2026-11-11T22:30:00.000Z';
const SATURDAY = '2026-11-14T10:00:00.000Z';
const SUNDAY = '2026-11-15T09:00:00.000Z';
const EARLY = '2026-11-11T05:30:00.000Z';

const BASE_SETTINGS = {
  channelEmail: true,
  channelPush: true,
  typeRevision: true,
  typeValidation: true,
  typeCourse: true,
  typeGap: true,
  typePlanning: true,
  typeRelaunch: true,
  quietStart: '21:00',
  quietEnd: '08:00',
  weekendQuiet: true,
  maxPerDay: 5,
};

function routing() {
  const cases = [];
  const nows = { AT, NIGHT, SATURDAY };
  const channels = ['email', 'push'];
  const types = ['validation_soon', 'global_quiz_today', 'daily_digest', 'relaunch', 'milestone'];
  const variants = {
    base: {},
    noEmail: { channelEmail: false },
    noPush: { channelPush: false },
    noRelaunch: { typeRelaunch: false },
    cap3: { maxPerDay: 3 },
    cap8: { maxPerDay: 8 },
    noWeekendQuiet: { weekendQuiet: false },
    emptyQuiet: { quietStart: '08:00', quietEnd: '08:00' },
    narrowQuiet: { quietStart: '12:00', quietEnd: '13:00' },
  };
  for (const [nowName, now] of Object.entries(nows)) {
    for (const channel of channels) {
      for (const type of types) {
        for (const [variantName, overrides] of Object.entries(variants)) {
          const extras = [
            { name: 'plain', input: {} },
            { name: 'sentCapped', input: { sentToday: 5 } },
            { name: 'eligibleLater', input: { eligibleAt: '2026-11-12T09:00:00.000Z' } },
            { name: 'eligiblePast', input: { eligibleAt: '2026-11-11T08:00:00.000Z' } },
            { name: 'stalePast', input: { staleAt: '2026-11-11T11:00:00.000Z' } },
            { name: 'read', input: { read: true } },
          ];
          for (const extra of extras) {
            const decision = decideDelivery({
              channel,
              type,
              settings: { ...BASE_SETTINGS, ...overrides },
              now: new Date(now),
              timeZone: 'Europe/Paris',
              sentToday: 0,
              eligibleAt:
                extra.input.eligibleAt === undefined ? null : new Date(extra.input.eligibleAt),
              staleAt: extra.input.staleAt === undefined ? null : new Date(extra.input.staleAt),
              read: extra.input.read,
              ...(extra.input.sentToday === undefined ? {} : { sentToday: extra.input.sentToday }),
            });
            cases.push({
              nowName,
              channel,
              type,
              variant: variantName,
              extra: extra.name,
              eligibleAt: extra.input.eligibleAt ?? null,
              staleAt: extra.input.staleAt ?? null,
              read: extra.input.read === true,
              sentToday: extra.input.sentToday ?? 0,
              status: decision.status,
              scheduledFor:
                decision.scheduledFor === null ? null : decision.scheduledFor.toISOString(),
              error: decision.error ?? null,
            });
          }
        }
      }
    }
  }
  return cases;
}

function quiet() {
  const cases = [];
  const windows = [
    { start: '21:00', end: '08:00' },
    { start: '08:00', end: '08:00' },
    { start: '22:00', end: '06:00' },
    { start: '12:00', end: '13:00' },
  ];
  const instants = [
    AT,
    NIGHT,
    SATURDAY,
    SUNDAY,
    EARLY,
    '2026-11-11T20:59:00.000Z',
    '2026-11-11T21:00:00.000Z',
    '2026-11-12T08:00:00.000Z',
    '2026-03-29T00:30:00.000Z',
    '2026-10-25T00:30:00.000Z',
  ];
  for (const window of windows) {
    for (const instant of instants) {
      const quietWindow = { ...window, timeZone: 'Europe/Paris' };
      const next = nextOutsideQuietHours(new Date(instant), quietWindow);
      cases.push({
        window,
        instant,
        weekday: userWeekday(new Date(instant), 'Europe/Paris'),
        quiet: isQuietHours(new Date(instant), quietWindow),
        next: next.toISOString(),
      });
    }
  }
  return cases;
}

const VARIANTS = {
  base: {},
  noEmail: { channelEmail: false },
  noPush: { channelPush: false },
  noRelaunch: { typeRelaunch: false },
  cap3: { maxPerDay: 3 },
  cap8: { maxPerDay: 8 },
  noWeekendQuiet: { weekendQuiet: false },
  emptyQuiet: { quietStart: '08:00', quietEnd: '08:00' },
  narrowQuiet: { quietStart: '12:00', quietEnd: '13:00' },
};

writeFileSync(
  'packages-py/learny/tests/fixtures/engagement_domain.json',
  `${JSON.stringify(
    {
      types: TYPES,
      baseSettings: BASE_SETTINGS,
      variants: VARIANTS,
      templates: templates(),
      clamps: clamps(),
      routing: routing(),
      quiet: quiet(),
    },
    null,
    2,
  )}\n`,
  'utf8',
);
console.log('engagement oracle written');
