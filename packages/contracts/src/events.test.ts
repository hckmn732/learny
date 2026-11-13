import { describe, expect, it } from 'vitest';

import {
  EVENTS,
  EVENT_NAMES_LIST,
  isEventName,
  parseEventData,
  type EventData,
  type EventName,
} from './events';

const U1 = '0b6f2a7e-9a3c-4c1c-8a55-3d1f6f1d2a01';
const U2 = '3f1c8a5e-5d0e-4a0b-9a6e-7b2c4d9e1f02';
const U3 = '6a9d2c4b-1e7f-4b3a-8c5d-9e0f1a2b3c03';
const AT = '2026-11-11T12:20:00.000Z';
const DAY = '2026-11-11';

// A valid example per event: the table is the contract of the catalogue (SPEC-203 ET-1).
const VALID: Record<EventName, Record<string, unknown>> = {
  'user/signed-up': { userId: U1, method: 'magic_link', signedUpAt: AT },
  'user/onboarding-completed': { userId: U1, completedAt: AT },
  'formation/cadrage-completed': { userId: U1, formationId: U2 },
  'formation/programme-requested': { userId: U1, formationId: U2, changeRequestId: null },
  'formation/programme-imported': { userId: U1, formationId: U2, importId: U3 },
  'formation/programme-validated': { userId: U1, formationId: U2, validatedAt: AT },
  'formation/paused': { userId: U1, formationId: U2, pausedAt: AT },
  'formation/resumed': { userId: U1, formationId: U2, resumedOn: DAY },
  'formation/completed': { userId: U1, formationId: U2, completedAt: AT },
  'resource/uploaded': {
    userId: U1,
    resourceId: U2,
    formationId: U3,
    chapterId: null,
    kind: 'pdf',
  },
  'resource/ready': { userId: U1, resourceId: U2, chunkCount: 0 },
  'resource/failed': { userId: U1, resourceId: U2, errorCode: 'EXTRACTION_FAILED' },
  'chapter/contributions-completed': { userId: U1, moduleId: U2, chapterId: null, force: false },
  'course/generated': { userId: U1, courseId: U2, moduleId: U3, version: 1 },
  'course/progress-updated': { userId: U1, courseId: U2, chapterId: U3, percent: 60 },
  'course/summary-submitted': {
    userId: U1,
    courseId: U2,
    chapterId: U3,
    summaryId: U1,
    corrected: true,
  },
  'course/section-edited': { userId: U1, courseId: U2, sectionId: U3, version: 2 },
  'course/section-reported': { userId: U1, courseId: U2, sectionId: U3, reportId: U2 },
  'quiz/submitted': { userId: U1, attemptId: U2, activityId: U3, moduleId: U1 },
  'quiz/graded': { userId: U1, attemptId: U2, moduleId: U3, score: 82.5, passed: true },
  'module/validated': { userId: U1, formationId: U2, moduleId: U3, score: 100 },
  'gap/detected': { userId: U1, formationId: U2, notionId: U3, nature: 'forgetting' },
  'gap/nature-changed': {
    userId: U1,
    formationId: U2,
    notionId: U3,
    nature: 'confusion',
    previousNature: 'forgetting',
  },
  'gap/cleared': { userId: U1, formationId: U2, notionId: U3 },
  'review/answered': {
    userId: U1,
    notionId: U2,
    source: 'global_quiz',
    correct: true,
    reviewedAt: AT,
  },
  'exam/submitted': { userId: U1, formationId: U2, attemptId: U3 },
  'exercise/submitted': { userId: U1, moduleId: U2, attemptId: U3 },
  'tutor/question-asked': { userId: U1, courseId: U2, conversationId: U3, messageId: U1 },
  'automation/action-proposed': { userId: U1, actionId: U2, automation: 'reprise' },
  'automation/action-applied': { userId: U1, actionId: U2, automation: 'micro_seance' },
  'automation/action-undone': { userId: U1, actionId: U2, automation: 'pause' },
  'notification/requested': {
    userId: U1,
    type: 'course_ready',
    data: { moduleTitle: 'Bases' },
    formationId: null,
    dedupeKey: null,
  },
  'notification/delivery-due': {
    userId: U1,
    notificationId: U2,
    deliveryId: U3,
    channel: 'email',
  },
  'billing/subscription-changed': { userId: U1, status: 'active', previousStatus: 'none' },
  'billing/payment-failed': { userId: U1 },
  'account/export-requested': { userId: U1, exportId: U2 },
  'account/deletion-requested': { userId: U1, scheduledFor: AT },
  'group/member-joined': { groupId: U1, formationId: U2, userId: U3 },
  'group/member-left': { groupId: U1, formationId: U2, userId: U3 },
  'cron/hourly-tick': { tickAt: AT },
  'cron/nightly': { runDate: DAY },
  'user/local-tick': {
    userId: U1,
    timezone: 'Europe/Paris',
    windowStart: '2026-11-11T07:00:00.000Z',
    windowEnd: '2026-11-11T08:00:00.000Z',
    localDate: DAY,
    localWeekday: 3,
  },
  'sdd/demo-requested': { runId: U1, failOnceAt: 'step-2' },
};

describe('[SPEC-203] catalogue des événements', () => {
  it('décrit un exemple valide pour chacun des événements du catalogue', () => {
    expect(Object.keys(VALID).sort()).toEqual([...EVENT_NAMES_LIST].sort());
    expect(EVENT_NAMES_LIST).toHaveLength(39);
  });

  it.each(EVENT_NAMES_LIST)('%s accepte son exemple valide', (name) => {
    expect(EVENTS[name].safeParse(VALID[name]).success).toBe(true);
  });

  it.each(EVENT_NAMES_LIST)('%s refuse un champ obligatoire manquant', (name) => {
    const [first] = Object.keys(VALID[name]);
    const rest = Object.fromEntries(Object.entries(VALID[name]).filter(([key]) => key !== first));
    expect(EVENTS[name].safeParse(rest).success).toBe(false);
  });

  it('refuse un identifiant qui n’est pas un UUID, pour chaque champ identifiant', () => {
    let checked = 0;
    for (const name of EVENT_NAMES_LIST) {
      for (const [key, value] of Object.entries(VALID[name])) {
        if (value !== U1 && value !== U2 && value !== U3) continue;
        const broken = { ...VALID[name], [key]: 'not-a-uuid' };
        expect(EVENTS[name].safeParse(broken).success, `${name}.${key}`).toBe(false);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(60);
  });

  it('refuse un instant sans fuseau et une date civile mal formée', () => {
    expect(
      EVENTS['user/signed-up'].safeParse({
        ...VALID['user/signed-up'],
        signedUpAt: '2026-11-11T12:20:00',
      }).success,
    ).toBe(false);
    expect(EVENTS['cron/nightly'].safeParse({ runDate: '11/11/2026' }).success).toBe(false);
    expect(
      EVENTS['user/signed-up'].safeParse({
        ...VALID['user/signed-up'],
        signedUpAt: '2026-11-11T14:20:00+02:00',
      }).success,
    ).toBe(true);
  });

  it('borne les nombres et les énumérations', () => {
    expect(EVENTS['quiz/graded'].safeParse({ ...VALID['quiz/graded'], score: 101 }).success).toBe(
      false,
    );
    expect(EVENTS['quiz/graded'].safeParse({ ...VALID['quiz/graded'], score: -1 }).success).toBe(
      false,
    );
    expect(
      EVENTS['resource/ready'].safeParse({ ...VALID['resource/ready'], chunkCount: -1 }).success,
    ).toBe(false);
    expect(
      EVENTS['course/generated'].safeParse({ ...VALID['course/generated'], version: 0 }).success,
    ).toBe(false);
    expect(
      EVENTS['user/signed-up'].safeParse({ ...VALID['user/signed-up'], method: 'sso' }).success,
    ).toBe(false);
    expect(
      EVENTS['user/local-tick'].safeParse({ ...VALID['user/local-tick'], localWeekday: 8 }).success,
    ).toBe(false);
    expect(
      EVENTS['user/local-tick'].safeParse({ ...VALID['user/local-tick'], localWeekday: 0 }).success,
    ).toBe(false);
    expect(
      EVENTS['sdd/demo-requested'].safeParse({ runId: U1, failOnceAt: 'step-3' }).success,
    ).toBe(false);
    expect(
      EVENTS['notification/requested'].safeParse({
        ...VALID['notification/requested'],
        dedupeKey: '',
      }).success,
    ).toBe(false);
    expect(
      EVENTS['notification/requested'].safeParse({
        ...VALID['notification/requested'],
        dedupeKey: 'k'.repeat(201),
      }).success,
    ).toBe(false);
  });

  it('applique le défaut externalChannels = true de notification/requested', () => {
    const data: EventData<'notification/requested'> = parseEventData(
      'notification/requested',
      VALID['notification/requested'],
    );
    expect(data.externalChannels).toBe(true);
    expect(
      parseEventData('notification/requested', {
        ...VALID['notification/requested'],
        externalChannels: false,
      }).externalChannels,
    ).toBe(false);
  });

  it('reconnaît les noms du catalogue et lève une erreur de schéma sur une donnée invalide', () => {
    expect(isEventName('cron/nightly')).toBe(true);
    expect(isEventName('cron/unknown')).toBe(false);
    expect(isEventName('toString')).toBe(false);
    expect(() => parseEventData('gap/cleared', { userId: 'x' })).toThrow();
  });
});
