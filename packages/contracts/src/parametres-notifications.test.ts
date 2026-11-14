import { describe, expect, it } from 'vitest';

import {
  NOTIFICATION_CHANNEL_IDS,
  NOTIFICATION_TYPE_COUNT,
  NOTIFICATION_TYPE_IDS,
  NotificationSettingsDto,
  NotificationSettingsPatch,
} from './parametres-notifications';

function dto() {
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
    quiet: { start: '21:00', end: '08:00', crossesMidnight: true, empty: false },
    weekendQuiet: true,
    maxPerDay: 5,
    activeTypeCount: 6,
    updatedAt: '2026-11-11T12:20:00.000Z',
  };
}

describe('[SPEC-708] contrats des notifications', () => {
  it('CA-1 — six types ordonnés comme la maquette, trois canaux', () => {
    expect(NOTIFICATION_TYPE_IDS).toEqual([
      'revision',
      'validation',
      'course',
      'gap',
      'planning',
      'relaunch',
    ]);
    expect(NOTIFICATION_TYPE_COUNT).toBe(6);
    expect(NOTIFICATION_CHANNEL_IDS).toEqual(['app', 'email', 'browser']);
  });

  it('EF-1 — le canal application ne peut jamais être désactivé', () => {
    expect(NotificationSettingsPatch.safeParse({ channels: { app: true } }).success).toBe(true);
    expect(NotificationSettingsPatch.safeParse({ channels: { app: false } }).success).toBe(false);
    // Un canal vide ne constitue pas un patch.
    expect(NotificationSettingsPatch.safeParse({ channels: {} }).success).toBe(false);
    // Un DTO dont le canal application serait faux est refusé aussi.
    expect(
      NotificationSettingsDto.safeParse({
        ...dto(),
        channels: { app: false, email: true, browser: true },
      }).success,
    ).toBe(false);
  });

  it('CL-1 — un patch vide, une heure invalide ou un plafond hors barème sont refusés', () => {
    expect(NotificationSettingsPatch.safeParse({}).success).toBe(false);
    expect(NotificationSettingsPatch.safeParse({ digestTime: '25:00' }).success).toBe(false);
    expect(NotificationSettingsPatch.safeParse({ quietStart: '8:00' }).success).toBe(false);
    expect(NotificationSettingsPatch.safeParse({ maxPerDay: 4 }).success).toBe(false);
    expect(NotificationSettingsPatch.safeParse({ maxPerDay: 8 }).success).toBe(true);
    expect(NotificationSettingsPatch.safeParse({ types: {} }).success).toBe(false);
    expect(NotificationSettingsPatch.safeParse({ types: { course: false } }).success).toBe(true);
  });

  it('ET-3 — le DTO normalisé porte le compteur, les heures calmes et la version', () => {
    const parsed = NotificationSettingsDto.safeParse(dto());
    expect(parsed.success).toBe(true);
    expect(NotificationSettingsDto.safeParse({ ...dto(), activeTypeCount: 7 }).success).toBe(false);
    expect(
      NotificationSettingsDto.safeParse({
        ...dto(),
        quiet: { start: '08:00', end: '08:00', crossesMidnight: false, empty: true },
      }).success,
    ).toBe(true);
  });
});
