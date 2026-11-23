// Vitest [SPEC-3102] — groups of the notification centre (BR-NOT-01, ET-5, CA-2).
//
// The boundaries are read in the learner's zone, never in UTC: two rows created at 00:30 and
// 23:00 in Paris belong to two different days even though both instants are on the same UTC day.
import { describe, expect, it } from 'vitest';

import {
  dayKey,
  groupLabel,
  groupNotifications,
  groupOfDay,
  NOTIFICATION_GROUP_ORDER,
  shiftDay,
  unreadCountOf,
} from './group-by-day';

interface Row {
  readonly id: string;
  readonly createdAt: string;
  readonly readAt: string | null;
  readonly group?: 'today' | 'yesterday' | 'earlier';
}

const ROWS: readonly Row[] = [
  { id: 'aujourdhui-matin', createdAt: '2026-11-11T08:00:00.000Z', readAt: null },
  { id: 'aujourdhui-veille-tard', createdAt: '2026-11-10T23:30:00.000Z', readAt: null },
  { id: 'hier-soir', createdAt: '2026-11-10T22:00:00.000Z', readAt: '2026-11-11T08:00:00.000Z' },
  { id: 'plus-tot', createdAt: '2026-11-09T12:00:00.000Z', readAt: '2026-11-09T13:00:00.000Z' },
];

const NOW = new Date('2026-11-11T12:20:00.000Z');

describe('[SPEC-3102] groupes « Aujourd’hui », « Hier », « Plus tôt »', () => {
  it('lit la journée dans le fuseau de l’apprenant (ET-5)', () => {
    expect(dayKey('2026-11-10T23:30:00.000Z', 'Europe/Paris')).toBe('2026-11-11');
    expect(dayKey('2026-11-10T22:59:00.000Z', 'Europe/Paris')).toBe('2026-11-10');
    expect(dayKey('2026-11-10T23:30:00.000Z', 'UTC')).toBe('2026-11-10');
  });

  it('place chaque ligne dans son groupe, dans l’ordre de la maquette (BR-NOT-01)', () => {
    expect(groupOfDay('2026-11-11', '2026-11-11', '2026-11-10')).toBe('today');
    expect(groupOfDay('2026-11-10', '2026-11-11', '2026-11-10')).toBe('yesterday');
    expect(groupOfDay('2026-11-09', '2026-11-11', '2026-11-10')).toBe('earlier');
  });

  it('groupe les lignes réelles et omet les groupes vides (BR-NOT-01)', () => {
    const sections = groupNotifications(ROWS, 'Europe/Paris', NOW);
    expect(sections.map((section) => section.group)).toEqual([...NOTIFICATION_GROUP_ORDER]);
    expect(sections[0]?.items.map((item) => item.id)).toEqual([
      'aujourdhui-matin',
      'aujourdhui-veille-tard',
    ]);
    expect(sections[1]?.items.map((item) => item.id)).toEqual(['hier-soir']);
    expect(sections[2]?.items.map((item) => item.id)).toEqual(['plus-tot']);
  });

  it('respecte le groupe calculé par le serveur quand il est présent', () => {
    const rows: readonly Row[] = [
      { id: 'force', createdAt: '2026-11-11T08:00:00.000Z', readAt: null, group: 'earlier' },
    ];
    const sections = groupNotifications(rows, 'Europe/Paris', NOW);
    expect(sections.map((section) => section.group)).toEqual(['earlier']);
  });

  it('n’affiche aucun groupe pour une page vide', () => {
    expect(groupNotifications([], 'Europe/Paris', NOW)).toEqual([]);
  });

  it('donne les en-têtes du catalogue partagé, identiques au web (ADR-3002 § 4)', () => {
    expect(groupLabel('today')).toBe('Aujourd’hui');
    expect(groupLabel('yesterday')).toBe('Hier');
    expect(groupLabel('earlier')).toBe('Plus tôt');
  });

  it('décale une journée sans lire le fuseau de l’appareil', () => {
    expect(shiftDay('2026-11-01', -1)).toBe('2026-10-31');
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('compte les non lues d’une page (BR-NOT-01, CA-2)', () => {
    expect(unreadCountOf(ROWS)).toBe(2);
    expect(unreadCountOf([])).toBe(0);
  });
});
