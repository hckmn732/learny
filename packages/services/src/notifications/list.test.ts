// Unit tests of the notification grouping (SPEC-306 EF-1, ET-1, ET-3; BR-NOT-01). The grouping
// works on civil days in the learner's IANA zone, never on a fixed number of hours: these tests
// pin the midnight and DST cases the panel must resolve server-side.
import { describe, expect, it } from 'vitest';

import { notificationGroup, previousCivilDay } from './list';

describe('[SPEC-306] panneau des notifications — groupement', () => {
  it('calcule le jour civil précédent sans passer par le fuseau du processus', () => {
    expect(previousCivilDay('2026-11-11')).toBe('2026-11-10');
    expect(previousCivilDay('2026-11-01')).toBe('2026-10-31');
    expect(previousCivilDay('2026-01-01')).toBe('2025-12-31');
    expect(previousCivilDay('2024-03-01')).toBe('2024-02-29');
  });

  it('groupe selon le jour local du profil, pas selon le jour UTC', () => {
    const now = new Date('2026-11-12T12:20:00Z');
    // 00:30 à Paris le 12 novembre : encore le 11 en UTC, donc « aujourd'hui » localement.
    expect(notificationGroup(new Date('2026-11-11T23:30:00Z'), now, 'Europe/Paris')).toBe('today');
    // 23:30 à Paris le 11 novembre : « hier » localement, deux jours civils UTC plus tôt.
    expect(notificationGroup(new Date('2026-11-11T22:30:00Z'), now, 'Europe/Paris')).toBe(
      'yesterday',
    );
    expect(notificationGroup(new Date('2026-11-10T22:30:00Z'), now, 'Europe/Paris')).toBe(
      'earlier',
    );
  });

  it('suit le changement d’heure sans décalage fixe', () => {
    const now = new Date('2026-10-26T12:20:00Z');
    expect(notificationGroup(new Date('2026-10-25T22:30:00Z'), now, 'Europe/Paris')).toBe(
      'yesterday',
    );
  });
});
