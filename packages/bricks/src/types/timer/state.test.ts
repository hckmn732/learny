import { describe, expect, it } from 'vitest';

import { formatRemaining, timerState } from './state';

const START = new Date('2026-11-11T12:00:00Z');
const at = (iso: string) => new Date(iso);

describe('[SPEC-502] minuteur d’examen', () => {
  it('affiche 20:00 restantes à mi-parcours (EF-7)', () => {
    const state = timerState({
      startedAt: START,
      durationSec: 2400,
      warnAtSec: 300,
      now: at('2026-11-11T12:20:00Z'),
    });
    expect(state).toEqual({
      remainingMs: 1_200_000,
      display: '20:00',
      warning: false,
      expired: false,
    });
  });

  it('passe warning à 4:59 restantes (CA-6)', () => {
    const state = timerState({
      startedAt: START,
      durationSec: 2400,
      warnAtSec: 300,
      now: at('2026-11-11T12:35:01Z'),
    });
    expect(state.remainingMs).toBe(299_000);
    expect(state.display).toBe('04:59');
    expect(state.warning).toBe(true);
    expect(state.expired).toBe(false);
  });

  it('reste calme à exactement 5:00 restantes', () => {
    const state = timerState({
      startedAt: START,
      durationSec: 2400,
      warnAtSec: 300,
      now: at('2026-11-11T12:35:00Z'),
    });
    expect(state.display).toBe('05:00');
    expect(state.warning).toBe(false);
  });

  it('passe expired à zéro, avec l’heure serveur qui fait foi (CA-6)', () => {
    const state = timerState({
      startedAt: START,
      durationSec: 2400,
      warnAtSec: 300,
      now: at('2026-11-11T12:40:00Z'),
    });
    expect(state).toEqual({
      remainingMs: 0,
      display: '00:00',
      warning: false,
      expired: true,
    });
  });

  it('reste expiré après la fin (BR-PRA-03)', () => {
    const state = timerState({
      startedAt: START,
      durationSec: 2400,
      warnAtSec: 300,
      now: at('2026-11-11T13:00:00Z'),
    });
    expect(state.remainingMs).toBe(0);
    expect(state.expired).toBe(true);
  });

  it('rend la durée initiale si l’horloge recule (CL-8)', () => {
    const state = timerState({
      startedAt: START,
      durationSec: 2400,
      warnAtSec: 300,
      now: at('2026-11-11T11:59:00Z'),
    });
    expect(state.remainingMs).toBe(2_400_000);
    expect(state.display).toBe('40:00');
    expect(state.expired).toBe(false);
  });

  it('affiche h:mm:ss au-delà de 59:59', () => {
    const state = timerState({
      startedAt: START,
      durationSec: 3 * 3600 + 2 * 60 + 5,
      warnAtSec: 300,
      now: START,
    });
    expect(state.display).toBe('3:02:05');
  });

  it('arrondit la seconde affichée vers le haut', () => {
    expect(formatRemaining(999)).toBe('00:01');
    expect(formatRemaining(1000)).toBe('00:01');
    expect(formatRemaining(0)).toBe('00:00');
    expect(formatRemaining(3_599_000)).toBe('59:59');
    expect(formatRemaining(3_600_000)).toBe('1:00:00');
  });
});
