// Vitest [SPEC-3203] — puces de statut d'un créneau (BR-AGE-04, EF-3, CA-1).
//
// Les quatre statuts de la maquette du mercredi 11 novembre à 13:20 : « Fait » pour la relecture de
// 09:00, « Faire » pour l'échauffement de 13:50 (moins d'une demi-heure), « Dans 40 min » pour le
// quiz de validation de 14:00, « À venir » pour le quiz global de 17:00.
import { describe, expect, it } from 'vitest';

import {
  slotBadgeOf,
  slotEmphasis,
  SOON_WINDOW_MINUTES,
  TODO_WINDOW_MINUTES,
  type SlotClock,
} from './slot-status';

const CLOCK: SlotClock = { today: '2026-11-11', nowMinutes: 13 * 60 + 20 };

function slot(
  overrides: Partial<{
    date: string;
    startMinutes: number;
    endMinutes: number;
    status: 'planned' | 'done' | 'missed';
  }> = {},
) {
  return {
    date: '2026-11-11',
    startMinutes: 14 * 60,
    endMinutes: 14 * 60 + 40,
    status: 'planned' as const,
    ...overrides,
  };
}

describe('[SPEC-3203] statuts des créneaux', () => {
  it('garde les statuts du serveur : fait et manqué (BR-AGE-04)', () => {
    expect(slotBadgeOf(slot({ status: 'done' }), CLOCK)).toEqual({ kind: 'done', minutes: null });
    expect(slotBadgeOf(slot({ status: 'missed' }), CLOCK)).toEqual({
      kind: 'missed',
      minutes: null,
    });
  });

  it('reproduit les quatre puces de la maquette à 13:20 (CA-1)', () => {
    expect(
      slotBadgeOf(slot({ startMinutes: 540, endMinutes: 600, status: 'done' }), CLOCK).kind,
    ).toBe('done');
    // Échauffement de 13:50 : trente minutes plus tard, « Faire ».
    expect(slotBadgeOf(slot({ startMinutes: 830, endMinutes: 840 }), CLOCK)).toEqual({
      kind: 'todo',
      minutes: 30,
    });
    // Quiz de validation de 14:00 : « Dans 40 min ».
    expect(slotBadgeOf(slot({ startMinutes: 840, endMinutes: 880 }), CLOCK)).toEqual({
      kind: 'soon',
      minutes: 40,
    });
    // Quiz global de 17:00 : « À venir ».
    expect(slotBadgeOf(slot({ startMinutes: 1020, endMinutes: 1030 }), CLOCK)).toEqual({
      kind: 'upcoming',
      minutes: null,
    });
  });

  it('marque « Faire » une activité en cours et « Manqué » une activité passée', () => {
    expect(slotBadgeOf(slot({ startMinutes: 780, endMinutes: 810 }), CLOCK).kind).toBe('todo');
    expect(slotBadgeOf(slot({ startMinutes: 700, endMinutes: 790 }), CLOCK).kind).toBe('missed');
  });

  it('place une activité d’un autre jour dans « À venir » ou « Manqué »', () => {
    expect(slotBadgeOf(slot({ date: '2026-11-12' }), CLOCK)).toEqual({
      kind: 'upcoming',
      minutes: null,
    });
    expect(slotBadgeOf(slot({ date: '2026-11-10' }), CLOCK)).toEqual({
      kind: 'missed',
      minutes: null,
    });
  });

  it('garde les fenêtres de la demi-heure et de l’heure', () => {
    const atStart = slot({ startMinutes: 800 });
    expect(slotBadgeOf(atStart, CLOCK).kind).toBe('todo');
    const exactlyTodo = slot({ startMinutes: 800 + TODO_WINDOW_MINUTES });
    expect(slotBadgeOf(exactlyTodo, CLOCK)).toEqual({ kind: 'todo', minutes: 30 });
    const justAfter = slot({ startMinutes: 800 + TODO_WINDOW_MINUTES + 1 });
    expect(slotBadgeOf(justAfter, CLOCK).kind).toBe('soon');
    const exactlySoon = slot({ startMinutes: 800 + SOON_WINDOW_MINUTES });
    expect(slotBadgeOf(exactlySoon, CLOCK)).toEqual({ kind: 'soon', minutes: 60 });
    const justAfterSoon = slot({ startMinutes: 800 + SOON_WINDOW_MINUTES + 1 });
    expect(slotBadgeOf(justAfterSoon, CLOCK).kind).toBe('upcoming');
  });

  it('met en avant la carte encre et le point citron de la maquette (EF-3)', () => {
    expect(slotEmphasis({ kind: 'soon', minutes: 40 })).toBe('now');
    expect(slotEmphasis({ kind: 'todo', minutes: 5 })).toBe('next');
    expect(slotEmphasis({ kind: 'upcoming', minutes: null })).toBe('plain');
    expect(slotEmphasis({ kind: 'done', minutes: null })).toBe('plain');
    expect(slotEmphasis({ kind: 'missed', minutes: null })).toBe('plain');
  });
});
