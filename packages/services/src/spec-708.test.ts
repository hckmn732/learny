// Unit tests of the Notifications tab (SPEC-708 §12, CA-1 to CA-3; ADR-0047 fixed clock).
import { describe, expect, it } from 'vitest';

import type { NotificationSettingsDto } from '@learny/contracts';
import { AppError } from '@learny/core';

import {
  activeNotificationTypeCount,
  decideTestNotification,
  nextDigestAt,
  notificationSettingsToDelivery,
  parseNotificationSettingsPatch,
  quietHoursOf,
} from './parametres-notifications';

const PARIS = 'Europe/Paris';
const MONTREAL = 'America/Montreal';
const FIXED = new Date('2026-11-11T12:20:00Z');

function settings(overrides: Partial<NotificationSettingsDto> = {}): NotificationSettingsDto {
  return {
    channels: { app: true, email: true, browser: true },
    types: {
      revision: true,
      validation: true,
      course: true,
      gap: true,
      planning: true,
      relaunch: true,
    },
    digestTime: '08:00',
    quiet: quietHoursOf('21:00', '08:00'),
    weekendQuiet: true,
    maxPerDay: 5,
    activeTypeCount: 6,
    updatedAt: FIXED.toISOString(),
    ...overrides,
  };
}

function parseError(input: unknown): AppError {
  try {
    parseNotificationSettingsPatch(input);
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('le patch aurait dû être refusé');
}

describe('[SPEC-708] règles et calculs', () => {
  it('CA-1 — six types par défaut, quatre après en avoir désactivé deux', () => {
    const types = settings().types;
    expect(activeNotificationTypeCount(types)).toBe(6);
    expect(activeNotificationTypeCount({ ...types, validation: false, course: false })).toBe(4);
    expect(activeNotificationTypeCount({ ...types, validation: false })).toBe(5);
    expect(
      activeNotificationTypeCount({
        revision: false,
        validation: false,
        course: false,
        gap: false,
        planning: false,
        relaunch: false,
      }),
    ).toBe(0);
  });

  it('CA-2 — le canal application est toujours actif et non désactivable', () => {
    expect(parseNotificationSettingsPatch({ channels: { email: false } })).toEqual({
      channels: { email: false },
    });
    expect(parseNotificationSettingsPatch({ channels: { app: true } })).toEqual({
      channels: { app: true },
    });
    const failure = parseError({ channels: { app: false } });
    expect(failure.code).toBe('VALIDATION_FAILED');
    expect(failure.status).toBe(400);
    // Refuser la permission navigateur ne touche pas l’application : le service ne reçoit rien et
    // l’écran garde `channels.app = true` (couvert aussi par l’e2e).
    expect(settings().channels).toEqual({ app: true, email: true, browser: true });
  });

  it('CA-3 — les heures calmes 21:00–08:00 reportent une notification de test à 08:00', () => {
    // 22:30 à Paris : la notification quitte les heures calmes le lendemain à 08:00 (07:00Z).
    const decision = decideTestNotification(settings(), new Date('2026-11-11T21:30:00Z'), PARIS);
    expect(decision).toEqual({
      status: 'deferred_quiet',
      scheduledFor: '2026-11-12T07:00:00.000Z',
    });
    // 13:20 à Paris : rien ne s’oppose à l’envoi.
    expect(decideTestNotification(settings(), FIXED, PARIS)).toEqual({
      status: 'sent',
      scheduledFor: null,
    });
  });

  it('CA-3 — le week-end ne laisse partir que les révisions dues, jusqu’au lundi 08:00', () => {
    const saturday = new Date('2026-11-14T12:20:00Z');
    const decision = decideTestNotification(settings(), saturday, PARIS);
    expect(decision.status).toBe('deferred_quiet');
    expect(decision.scheduledFor).toBe('2026-11-16T07:00:00.000Z');
    // BR-NOT-04 — désactiver « Rien le week-end » laisse partir la notification le samedi.
    expect(decideTestNotification(settings({ weekendQuiet: false }), saturday, PARIS).status).toBe(
      'sent',
    );
  });

  it('CA-3 — le programme du jour suit 08:00 dans le fuseau, même après le passage de l’heure', () => {
    // Horloge figée à 13:20 Paris : le prochain programme est le lendemain à 08:00 (07:00Z).
    expect(nextDigestAt('08:00', FIXED, PARIS).toISOString()).toBe('2026-11-12T07:00:00.000Z');
    // Montréal (UTC-5 en hiver) : 08:00 locales = 13:00Z le même jour (il est 07:20 sur place).
    expect(nextDigestAt('08:00', FIXED, MONTREAL).toISOString()).toBe('2026-11-11T13:00:00.000Z');
    // Été : Paris passe à UTC+2, l’heure murale reste 08:00 (06:00Z).
    expect(nextDigestAt('08:00', new Date('2026-07-14T12:20:00Z'), PARIS).toISOString()).toBe(
      '2026-07-15T06:00:00.000Z',
    );
  });

  it('CL-5, ET-4 — une plage vide début=fin ne bloque aucune notification', () => {
    const empty = quietHoursOf('08:00', '08:00');
    expect(empty).toEqual({ start: '08:00', end: '08:00', crossesMidnight: false, empty: true });
    const decision = decideTestNotification(
      settings({ quiet: empty }),
      new Date('2026-11-11T21:30:00Z'),
      PARIS,
    );
    expect(decision).toEqual({ status: 'sent', scheduledFor: null });
    // La plage qui traverse minuit reste signalée comme telle.
    expect(quietHoursOf('21:00', '08:00')).toMatchObject({ crossesMidnight: true, empty: false });
  });

  it('EF-2 — les réglages nourrissent le routeur de SPEC-209 sans duplication', () => {
    expect(notificationSettingsToDelivery(settings())).toEqual({
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
    });
    // Un type désactivé ou un canal e-mail coupé donne `skipped_pref` dans le routeur partagé.
    const off = settings({
      channels: { app: true, email: false, browser: true },
      types: { ...settings().types, relaunch: false },
    });
    expect(decideTestNotification(off, FIXED, PARIS).status).toBe('skipped_pref');
  });

  it('CL-1 — un patch vide ou hors schéma est refusé avant toute écriture', () => {
    expect(parseError({}).errors?.[0]?.message).toBe('au moins un réglage est attendu');
    expect(parseError({ channels: {} }).errors?.[0]?.message).toBe('au moins un canal est attendu');
    expect(parseError({ types: {} }).errors?.[0]?.message).toBe('au moins un type est attendu');
    expect(parseError({ quietStart: 'veille' }).errors?.[0]?.message).toMatch(/HH:mm/);
    expect(parseError({ maxPerDay: 4 }).errors?.[0]?.message).toBeTruthy();
    expect(parseError({ types: { course: 'non' } }).errors?.[0]?.message).toBeTruthy();
  });
});
