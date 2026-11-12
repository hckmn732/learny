import { describe, expect, it } from 'vitest';

import { ENGINE } from '@learny/config/product';

import { EngineError } from './errors';
import { withParams } from './params';

function invalidParam(run: () => unknown): EngineError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(EngineError);
    const engine = error as EngineError;
    expect(engine.code).toBe('INVALID_PARAM');
    return engine;
  }
  throw new Error('aucune EngineError levée');
}

describe('[SPEC-401] paramètres du moteur', () => {
  it('retourne les défauts ENGINE sans partager leurs références', () => {
    const params = withParams('mastery');
    expect(params).toEqual(ENGINE.mastery);
    expect(params).not.toBe(ENGINE.mastery);

    const draw = withParams('draw');
    expect(draw).toEqual(ENGINE.draw);

    const globalQuiz = withParams('globalQuiz');
    expect(globalQuiz).toEqual(ENGINE.globalQuiz);
    expect(globalQuiz.formatSeconds).not.toBe(ENGINE.globalQuiz.formatSeconds);
  });

  it('fusionne profondément une surcharge partielle (CL-7)', () => {
    const params = withParams('globalQuiz', { maxMinutesDefault: 30 });
    expect(params.maxMinutesDefault).toBe(30);
    expect(params.allowedMaxMinutes).toEqual(ENGINE.globalQuiz.allowedMaxMinutes);
    expect(params.microMinutesDefault).toBe(ENGINE.globalQuiz.microMinutesDefault);
    expect(params.formatSeconds).toEqual(ENGINE.globalQuiz.formatSeconds);
    expect(ENGINE.globalQuiz.maxMinutesDefault).toBe(15);
  });

  it('remplace les tableaux au lieu de les fusionner', () => {
    const params = withParams('globalQuiz', { allowedMaxMinutes: [10, 30] });
    expect(params.allowedMaxMinutes).toEqual([10, 30]);
    expect(ENGINE.globalQuiz.allowedMaxMinutes).toEqual([10, 15, 20, 30]);

    const warmup = withParams('warmup', { allowedCounts: [5] });
    expect(warmup.allowedCounts).toEqual([5]);
    expect(warmup.defaultScope).toBe(ENGINE.warmup.defaultScope);
  });

  it('refuse une valeur hors liste autorisée (CL-7)', () => {
    const retention = invalidParam(() => withParams('fsrs', { requestRetention: 0.8 }));
    expect(retention.details?.path).toBe('fsrs.requestRetention');

    invalidParam(() => withParams('globalQuiz', { maxMinutesDefault: 25 }));
    invalidParam(() => withParams('planner', { sprintDaysBeforeDefault: 4 }));
    invalidParam(() => withParams('warmup', { defaultCount: 4 }));
    invalidParam(() => withParams('fsrs', { allowedRetentions: [0.8] }));
    invalidParam(() => withParams('globalQuiz', { allowedMaxMinutes: [15, 25] }));
  });

  it('refuse un paramètre inconnu et protège ENGINE des mutations', () => {
    invalidParam(() => withParams('fsrs', { unknown: true } as never));
    invalidParam(() => withParams('fsrs', { allowedRetentions: 0.9 } as never));
    invalidParam(() => withParams('mastery', { halfLifeDays: { nested: 1 } } as never));
    const params = withParams('fsrs', { hardFactor: 3 });
    const mutable = params as unknown as { hardFactor: number; allowedRetentions: number[] };
    mutable.allowedRetentions.push(0.8);
    mutable.hardFactor = 4;
    expect(ENGINE.fsrs.hardFactor).toBe(2);
    expect(ENGINE.fsrs.allowedRetentions).toEqual([0.85, 0.9, 0.95]);
    expect(withParams('fsrs', { requestRetention: 0.95 }).requestRetention).toBe(0.95);
  });
});
