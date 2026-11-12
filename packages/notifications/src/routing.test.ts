import { describe, expect, it } from 'vitest';

import { decideDelivery, type DeliverySettings, type DecideDeliveryInput } from './routing';

const BASE: DeliverySettings = {
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

const WEDNESDAY = new Date('2026-11-11T12:20:00Z'); // 13:20 in Paris
const WEDNESDAY_EVENING = new Date('2026-11-11T21:30:00Z'); // 22:30 in Paris
const SATURDAY = new Date('2026-11-14T09:00:00Z'); // 10:00 in Paris
const QUIET_END = new Date('2026-11-12T07:00:00Z');
const MONDAY_QUIET_END = new Date('2026-11-16T07:00:00Z');

function decide(overrides: Partial<DecideDeliveryInput> = {}) {
  return decideDelivery({
    channel: 'email',
    type: 'course_ready',
    settings: BASE,
    now: WEDNESDAY,
    timeZone: 'Europe/Paris',
    sentToday: 0,
    ...overrides,
  });
}

describe('[SPEC-209] décision de livraison', () => {
  it('CA-1 — envoie quand le canal, le type, le jour et le plafond le permettent', () => {
    expect(decide()).toEqual({ status: 'sent', scheduledFor: null });
    expect(decide({ channel: 'push' })).toEqual({ status: 'sent', scheduledFor: null });
  });

  it('CA-1, BR-NOT-03 — un canal désactivé écarte la livraison sans toucher aux autres', () => {
    expect(decide({ settings: { ...BASE, channelEmail: false } })).toEqual({
      status: 'skipped_pref',
      scheduledFor: null,
    });
    expect(decide({ channel: 'push', settings: { ...BASE, channelPush: false } })).toEqual({
      status: 'skipped_pref',
      scheduledFor: null,
    });
  });

  it('CA-1, EF-3 — chaque type obéit à son interrupteur, les autres restent actifs', () => {
    const cases = [
      ['global_quiz_today', 'typeRevision'],
      ['validation_soon', 'typeValidation'],
      ['module_validated', 'typeValidation'],
      ['course_ready', 'typeCourse'],
      ['new_gap', 'typeGap'],
      ['session_planned', 'typePlanning'],
      ['session_to_reschedule', 'typePlanning'],
      ['planning_adjusted', 'typePlanning'],
      ['relaunch', 'typeRelaunch'],
    ] as const;
    for (const [type, key] of cases) {
      expect(decide({ type, settings: { ...BASE, [key]: false } }), type).toEqual({
        status: 'skipped_pref',
        scheduledFor: null,
      });
    }
    // weekly_review, milestone, ai_cost_alert, ai_task_failed, export_ready, group_invitation,
    // daily_digest: only the channel decides.
    for (const type of [
      'weekly_review',
      'milestone',
      'ai_cost_alert',
      'ai_task_failed',
      'export_ready',
      'group_invitation',
    ] as const) {
      expect(decide({ type }), type).toEqual({ status: 'sent', scheduledFor: null });
    }
  });

  it('CA-2, CL-1 — les heures calmes reportent à la fin de la plage', () => {
    expect(decide({ now: WEDNESDAY_EVENING })).toEqual({
      status: 'deferred_quiet',
      scheduledFor: QUIET_END,
    });
  });

  it('CA-2, CL-10 — début = fin : aucune heure calme, envoi immédiat', () => {
    expect(
      decide({
        now: WEDNESDAY_EVENING,
        settings: { ...BASE, quietStart: '08:00', quietEnd: '08:00' },
      }),
    ).toEqual({ status: 'sent', scheduledFor: null });
  });

  it('CA-2, CL-6 — un changement d’heure produit un instant réel unique', () => {
    const before = decide({
      now: new Date('2026-10-24T20:30:00Z'), // 22:30 in Paris, the night of the autumn change
      settings: { ...BASE, weekendQuiet: false },
    });
    expect(before.status).toBe('deferred_quiet');
    expect(before.scheduledFor?.toISOString()).toBe('2026-10-25T07:00:00.000Z');
    const after = decide({
      now: before.scheduledFor ?? WEDNESDAY,
      settings: { ...BASE, weekendQuiet: false },
    });
    expect(after.status).toBe('sent');
  });

  it('CA-2, EF-4, CL-9 — le week-end ne laisse sortir que les révisions dues', () => {
    expect(decide({ type: 'global_quiz_today', now: SATURDAY })).toEqual({
      status: 'sent',
      scheduledFor: null,
    });
    expect(decide({ type: 'course_ready', now: SATURDAY })).toEqual({
      status: 'deferred_quiet',
      scheduledFor: MONDAY_QUIET_END,
    });
    expect(
      decide({ type: 'course_ready', now: SATURDAY, settings: { ...BASE, weekendQuiet: false } }),
    ).toEqual({
      status: 'sent',
      scheduledFor: null,
    });
  });

  it('CA-3 — le plafond écarte la livraison, le programme du jour en est exempté', () => {
    expect(decide({ sentToday: 4 })).toEqual({ status: 'sent', scheduledFor: null });
    expect(decide({ sentToday: 5 })).toEqual({ status: 'capped', scheduledFor: null });
    expect(decide({ sentToday: 8, settings: { ...BASE, maxPerDay: 8 } })).toEqual({
      status: 'capped',
      scheduledFor: null,
    });
    expect(decide({ type: 'daily_digest', sentToday: 99 })).toEqual({
      status: 'sent',
      scheduledFor: null,
    });
  });

  it('CA-1, EF-2 — un eligibleAt futur planifie au lieu d’envoyer', () => {
    const eligibleAt = new Date('2026-11-11T13:10:00Z');
    expect(decide({ eligibleAt })).toEqual({ status: 'scheduled', scheduledFor: eligibleAt });
    const decision = decide({ eligibleAt });
    expect(decision.scheduledFor?.toISOString()).toBe('2026-11-11T13:10:00.000Z');
  });

  it('CA-4, CL-5 — une notification lue ou périmée n’est jamais envoyée', () => {
    expect(decide({ read: true })).toEqual({
      status: 'skipped_pref',
      scheduledFor: null,
      error: 'stale',
    });
    expect(decide({ staleAt: new Date('2026-11-11T12:00:00Z') })).toEqual({
      status: 'skipped_pref',
      scheduledFor: null,
      error: 'stale',
    });
    expect(decide({ staleAt: new Date('2026-11-11T13:00:00Z') })).toEqual({
      status: 'sent',
      scheduledFor: null,
    });
  });

  it('CA-1 — la préférence prime sur le report et le plafond', () => {
    expect(
      decide({
        now: WEDNESDAY_EVENING,
        sentToday: 99,
        settings: { ...BASE, channelEmail: false, channelPush: false },
      }),
    ).toEqual({ status: 'skipped_pref', scheduledFor: null });
  });
});
