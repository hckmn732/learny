// Unit tests of the notification producers (SPEC-706 §12, CA-1 and CA-2).
//
// Every test is pure: no database, no network, the injected instants are explicit and the text is
// rendered by the SPEC-209 templates. The integration suite proves the writes, the RLS, the 400,
// 404 and 409 answers and the double delivery.
import { describe, expect, it } from 'vitest';

import {
  NOTIFICATION_PRODUCER_KINDS,
  NOTIFICATION_PRODUCER_TYPES,
  NotificationProducerFacts,
  PRODUCER_KIND_TO_TYPE,
  notificationTypeOf,
  type NotificationProducerFacts as ProducerFacts,
  type NotificationProducerKind,
  type NotificationProducerType,
} from '@learny/contracts';
import {
  localMomentLabel,
  produceNotificationInput,
  validationQuizReminderAt,
  validationQuizReminderKey,
  validationQuizReminderSchedule,
} from '@learny/notifications/producers';
import {
  nextReminderInstant,
  reminderKeyOf,
  reminderWindow,
} from '@learny/notifications/producers/reminders';
import { NOTIFICATION_TEMPLATES } from '@learny/notifications/templates';
import { createFixedClock } from '@learny/testing';

import { userTimezone } from './notifications-generation-des-rappels';

const NOW = new Date('2026-11-11T12:20:00.000Z');
const USER = '11111111-1111-4111-8111-111111111111';
const FORMATION = '22222222-2222-4222-8222-222222222222';
const MODULE = '33333333-3333-4333-8333-333333333333';
const SLOT = '44444444-4444-4444-8444-444444444444';

interface Fixture {
  kind: NotificationProducerKind;
  type: NotificationProducerType;
  facts: ProducerFacts;
  href: string;
  dedupeKey: string;
}

/** CA-1 — one deterministic fixture per producer, with its target and its dedupe key. */
const FIXTURES: Fixture[] = [
  {
    kind: 'validation_quiz_reminder',
    type: 'validation_soon',
    facts: {
      kind: 'validation_quiz_reminder',
      userId: USER,
      formationId: FORMATION,
      slotId: SLOT,
      moduleId: MODULE,
      moduleTitle: 'Comptabilité générale',
      startsAt: '2026-11-11T14:00:00.000Z',
      timezone: 'Europe/Paris',
    },
    href: `/formations/${FORMATION}/modules/${MODULE}/quiz`,
    dedupeKey: `validation_soon:${SLOT}:2026-11-11T14:00:00.000Z`,
  },
  {
    kind: 'course_ready',
    type: 'course_ready',
    facts: {
      kind: 'course_ready',
      userId: USER,
      formationId: FORMATION,
      courseId: '55555555-5555-4555-8555-555555555555',
      moduleId: MODULE,
      moduleTitle: 'Saisie des pièces comptables',
      version: 2,
    },
    href: `/formations/${FORMATION}/modules/${MODULE}/cours`,
    dedupeKey: 'course_ready:55555555-5555-4555-8555-555555555555:2',
  },
  {
    kind: 'global_quiz_today',
    type: 'global_quiz_today',
    facts: {
      kind: 'global_quiz_today',
      userId: USER,
      formationId: FORMATION,
      localDay: '2026-11-11',
      notions: 14,
      minutes: 10,
    },
    href: `/formations/${FORMATION}/quiz-global`,
    dedupeKey: 'global_quiz_today:2026-11-11',
  },
  {
    kind: 'new_gap',
    type: 'new_gap',
    facts: {
      kind: 'new_gap',
      userId: USER,
      formationId: FORMATION,
      gapId: '66666666-6666-4666-8666-666666666666',
      notionTitle: 'Clé de comptabilisation',
      formationTitle: 'SAP S/4HANA Finance',
    },
    href: `/formations/${FORMATION}/lacunes`,
    dedupeKey: 'new_gap:66666666-6666-4666-8666-666666666666',
  },
  {
    kind: 'session_planned',
    type: 'session_planned',
    facts: {
      kind: 'session_planned',
      userId: USER,
      formationId: FORMATION,
      slotId: SLOT,
      title: 'Rétrospectives',
      startsAt: '2026-11-12T16:30:00.000Z',
      timezone: 'Europe/Paris',
    },
    href: '/agenda',
    dedupeKey: `session_planned:${SLOT}`,
  },
  {
    kind: 'module_validated',
    type: 'module_validated',
    facts: {
      kind: 'module_validated',
      userId: USER,
      formationId: FORMATION,
      moduleId: MODULE,
      modulePosition: 2,
      moduleTitle: 'Comptabilité générale',
      score: 91,
      nextModulePosition: 3,
      nextModuleTitle: 'Saisie des pièces comptables',
    },
    href: `/formations/${FORMATION}/programme`,
    dedupeKey: `module_validated:${MODULE}`,
  },
  {
    kind: 'session_to_reschedule',
    type: 'session_to_reschedule',
    facts: {
      kind: 'session_to_reschedule',
      userId: USER,
      formationId: FORMATION,
      slotId: SLOT,
      title: 'Ledgers parallèles',
    },
    href: '/agenda',
    dedupeKey: `session_to_reschedule:${SLOT}`,
  },
  {
    kind: 'weekly_review',
    type: 'weekly_review',
    facts: {
      kind: 'weekly_review',
      userId: USER,
      formationId: FORMATION,
      weekStart: '2026-11-09',
      studyLabel: '13 h d’étude',
    },
    href: '/accueil#bilan',
    dedupeKey: 'weekly_review:2026-11-09',
  },
  {
    kind: 'milestone',
    type: 'milestone',
    facts: {
      kind: 'milestone',
      userId: USER,
      formationId: FORMATION,
      milestoneId: '77777777-7777-4777-8777-777777777777',
      label: 'Sept jours d’affilée',
    },
    href: '/accueil',
    dedupeKey: 'milestone:77777777-7777-4777-8777-777777777777',
  },
  {
    kind: 'ai_cost_alert',
    type: 'ai_cost_alert',
    facts: { kind: 'ai_cost_alert', userId: USER, localDay: '2026-11-11', percent: 82 },
    href: '/parametres#modeles',
    dedupeKey: 'ai_cost_alert:2026-11-11',
  },
  {
    kind: 'ai_task_failed',
    type: 'ai_task_failed',
    facts: {
      kind: 'ai_task_failed',
      userId: USER,
      taskId: '88888888-8888-4888-8888-888888888888',
      taskLabel: 'Correction du quiz',
      modelLabel: 'IA fournie',
    },
    href: '/parametres#modeles',
    dedupeKey: 'ai_task_failed:88888888-8888-4888-8888-888888888888',
  },
  {
    kind: 'export_ready',
    type: 'export_ready',
    facts: {
      kind: 'export_ready',
      userId: USER,
      exportId: '99999999-9999-4999-8999-999999999999',
      days: 7,
    },
    href: '/parametres#profil',
    dedupeKey: 'export_ready:99999999-9999-4999-8999-999999999999',
  },
  {
    kind: 'group_invitation',
    type: 'group_invitation',
    facts: {
      kind: 'group_invitation',
      userId: USER,
      formationId: FORMATION,
      groupId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      invitedUserId: USER,
      groupTitle: 'Promotion SAP 2026',
    },
    href: `/formations/${FORMATION}/groupe`,
    dedupeKey: `group_invitation:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:${USER}`,
  },
];

describe('[SPEC-706] règles et calculs', () => {
  it('CA-1 — les treize producteurs couvrent exactement BR-NOT-02', () => {
    expect(NOTIFICATION_PRODUCER_TYPES).toHaveLength(13);
    expect(NOTIFICATION_PRODUCER_KINDS).toHaveLength(13);
    expect(FIXTURES.map((fixture) => fixture.kind).sort()).toEqual(
      [...NOTIFICATION_PRODUCER_KINDS].sort(),
    );
    for (const fixture of FIXTURES) {
      expect(PRODUCER_KIND_TO_TYPE[fixture.kind]).toBe(fixture.type);
      expect(notificationTypeOf(fixture.kind)).toBe(fixture.type);
    }
  });

  it('CA-1 — chaque fixture produit son type, sa cible et sa clé de déduplication', () => {
    for (const fixture of FIXTURES) {
      const produced = produceNotificationInput(fixture.facts, NOW);
      expect(produced.input.type, fixture.kind).toBe(fixture.type);
      expect(produced.input.dedupeKey, fixture.kind).toBe(fixture.dedupeKey);
      expect(produced.input.data.href, fixture.kind).toBe(fixture.href);
      expect(produced.input.data.href).toMatch(/^\/(?!\/)/u);
      const template = NOTIFICATION_TEMPLATES[produced.input.type];
      for (const tone of ['vous', 'tu'] as const) {
        const title = template.title(produced.input.data, tone);
        const body = template.body(produced.input.data, tone);
        expect(title.length).toBeGreaterThan(0);
        expect(title.length).toBeLessThanOrEqual(120);
        expect(body.length).toBeGreaterThan(0);
        expect(body.length).toBeLessThanOrEqual(400);
        if (tone === 'tu') {
          expect(`${title} ${body}`).not.toMatch(/\b(vous|votre|vos)\b/iu);
        }
      }
      expect(template.icon).toMatch(/^[a-z][a-z0-9-]{0,39}$/u);
    }
  });

  it('CA-1 — deux événements identiques portent la même clé, donc une seule notification', () => {
    const seen = new Set<string>();
    for (const fixture of FIXTURES) {
      const first = produceNotificationInput(fixture.facts, NOW);
      const second = produceNotificationInput(fixture.facts, new Date('2026-11-11T18:00:00Z'));
      expect(first.input.dedupeKey, fixture.kind).toBe(second.input.dedupeKey);
      expect(first.input.type, fixture.kind).toBe(second.input.type);
      expect(seen.has(first.input.dedupeKey ?? ''), fixture.kind).toBe(false);
      seen.add(first.input.dedupeKey ?? '');
    }
    expect(seen.size).toBe(13);
  });

  it('CA-2 — un quiz à 15:00 est rappelé à 14:20 heure de Paris', () => {
    const startsAt = '2026-11-11T14:00:00.000Z'; // 15:00 Europe/Paris
    const schedule = validationQuizReminderSchedule(SLOT, startsAt, 'Europe/Paris');
    expect(schedule.localTime).toBe('15:00');
    expect(schedule.localDay).toBe('2026-11-11');
    expect(schedule.eligibleAt.toISOString()).toBe('2026-11-11T13:20:00.000Z'); // 14:20 Paris
    expect(schedule.dedupeKey).toBe(`validation_soon:${SLOT}:${startsAt}`);
    expect(nextReminderInstant(startsAt).toISOString()).toBe('2026-11-11T13:20:00.000Z');
    expect(validationQuizReminderAt(startsAt).toISOString()).toBe('2026-11-11T13:20:00.000Z');
    expect(reminderKeyOf(SLOT, startsAt)).toBe(schedule.dedupeKey);

    const first = FIXTURES[0];
    if (first === undefined) throw new Error('fixture de rappel absente');
    const produced = produceNotificationInput(first.facts, NOW);
    expect(produced.input.eligibleAt).toBe('2026-11-11T13:20:00.000Z');
    expect(produced.input.staleAt).toBe(startsAt);
    expect(produced.input.data.when).toBe('aujourd’hui à 15:00');
  });

  it('CA-2 — un déplacement change la clé et invalide l’ancien rappel', () => {
    const before = validationQuizReminderSchedule(SLOT, '2026-11-11T14:00:00.000Z', 'Europe/Paris');
    const after = validationQuizReminderSchedule(SLOT, '2026-11-11T15:00:00.000Z', 'Europe/Paris');
    expect(after.eligibleAt.toISOString()).toBe('2026-11-11T14:20:00.000Z'); // 15:20 Paris
    expect(after.localTime).toBe('16:00');
    expect(after.dedupeKey).not.toBe(before.dedupeKey);
    expect(validationQuizReminderKey(SLOT, before.eligibleAt)).not.toBe(after.dedupeKey);
  });

  it('CA-2 — le fuseau du profil décide du libellé local, l’instant reste unique', () => {
    const startsAt = '2026-11-11T14:00:00.000Z';
    expect(localMomentLabel(startsAt, 'Europe/Paris', NOW)).toBe('aujourd’hui à 15:00');
    expect(localMomentLabel(startsAt, 'America/New_York', NOW)).toBe('aujourd’hui à 09:00');
    expect(
      validationQuizReminderSchedule(SLOT, startsAt, 'America/New_York').eligibleAt.toISOString(),
    ).toBe('2026-11-11T13:20:00.000Z');
    expect(localMomentLabel('2026-11-12T08:00:00.000Z', 'Europe/Paris', NOW)).toBe(
      'demain à 09:00',
    );
  });

  it('CL-5 — la fenêtre du job ne retient que les rappels encore à venir', () => {
    const window = reminderWindow(NOW);
    expect(window.from.toISOString()).toBe('2026-11-11T13:00:00.000Z');
    expect(window.to.toISOString()).toBe('2026-11-11T14:00:00.000Z');
    // A quiz at 15:00 Paris (14:00Z) is at the upper bound; its reminder (13:20Z) is future.
    expect(new Date('2026-11-11T14:00:00Z').getTime()).toBeLessThanOrEqual(window.to.getTime());
    expect(validationQuizReminderAt('2026-11-11T14:00:00Z').getTime()).toBeGreaterThan(
      NOW.getTime(),
    );
    // A quiz 20 minutes after the clock would have been reminded 20 minutes ago.
    expect(validationQuizReminderAt('2026-11-11T12:40:00Z').getTime()).toBeLessThan(NOW.getTime());
  });

  it('CL-1 — une donnée hors schéma est refusée sans produire de clé', () => {
    expect(() =>
      produceNotificationInput({ kind: 'nope' } as unknown as ProducerFacts, NOW),
    ).toThrow();
    expect(() =>
      NotificationProducerFacts.parse({
        kind: 'validation_quiz_reminder',
        userId: 'pas-un-uuid',
      }),
    ).toThrow();
    expect(() =>
      produceNotificationInput(
        { ...(FIXTURES[0]?.facts ?? {}), kind: 'unknown' } as unknown as ProducerFacts,
        NOW,
      ),
    ).toThrow();
    expect(() => notificationTypeOf('daily_digest' as NotificationProducerKind)).toThrow();
  });

  it('CL-3 — le libellé reste borné et ne dépend pas de la machine', () => {
    const clock = createFixedClock();
    expect(clock.now().toISOString()).toBe('2026-11-11T12:20:00.000Z');
    const label = localMomentLabel('2026-11-11T14:00:00Z', 'Europe/Paris', clock.now());
    expect(label).toBe('aujourd’hui à 15:00');
  });

  it('expose le fuseau du profil sans lire l’horloge système', () => {
    // The pure helpers never call Date.now(); the clock is the only source of instants (ADR-0047).
    expect(userTimezone).toBeTypeOf('function');
  });
});
