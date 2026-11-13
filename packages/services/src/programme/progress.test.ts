import { describe, expect, it } from 'vitest';

import { AppError } from '@learny/core';

import {
  assertModuleAccess,
  calendarWeeks,
  formationProgress,
  lockedModuleMessage,
  programmeIndicators,
} from './progress';

describe('[SPEC-606] progression du programme', () => {
  it('CA-1 — garde la fraction exacte et arrondit seulement l’affichage', () => {
    expect(formationProgress(2, 7)).toEqual({ validated: 2, total: 7, percent: 29 });
    expect(formationProgress(7, 7)).toEqual({ validated: 7, total: 7, percent: 100 });
    expect(formationProgress(0, 7)).toEqual({ validated: 0, total: 7, percent: 0 });
    expect(formationProgress(0, 7).percent).toBe(0);
  });

  it('ET-5 — zéro module ne produit ni division par zéro ni pourcentage invalide', () => {
    expect(formationProgress(0, 0)).toEqual({ validated: 0, total: 0, percent: 0 });
    expect(formationProgress(2, 0)).toEqual({ validated: 0, total: 0, percent: 0 });
    expect(formationProgress(9, 7)).toEqual({ validated: 7, total: 7, percent: 100 });
  });

  it('ET-5, BR-PRO-01 — une formation en pause garde le même calcul', () => {
    const modules = [
      { status: 'validated' as const },
      { status: 'validated' as const },
      { status: 'open' as const },
      { status: 'locked' as const },
      { status: 'locked' as const },
      { status: 'locked' as const },
      { status: 'locked' as const },
    ];
    expect(
      programmeIndicators({
        status: 'paused',
        modules,
        weeks: 6,
        volumeHours: 150,
        threshold: 80,
        hoursPerDay: 5,
        studyDaysPerWeek: 5,
      }),
    ).toEqual({
      progress: { validated: 2, total: 7, percent: 29 },
      weeks: 6,
      volumeHours: 150,
      threshold: 80,
      hoursPerDay: 5,
      studyDaysPerWeek: 5,
    });
  });

  it('CL-5 — les semaines sont des jours civils, pas des millisecondes brutes', () => {
    expect(calendarWeeks('2026-11-02', '2026-12-11')).toBe(6);
    expect(calendarWeeks('2026-03-23', '2026-04-05')).toBe(2);
    expect(calendarWeeks('2026-11-02', '2026-11-02')).toBe(1);
    expect(calendarWeeks('2026-11-10', '2026-11-02')).toBe(1);
  });

  it('BR-FOR-08, ET-4 — un module verrouillé refuse l’accès avec sa condition', () => {
    expect(lockedModuleMessage({ position: 2, unlockAfterPosition: 1 })).toBe(
      'Se débloque quand le quiz du module 1 est validé.',
    );
    expect(() => {
      assertModuleAccess({ position: 2, status: 'locked', unlockAfterPosition: 1 });
    }).toThrow(AppError);
    expect(() => {
      assertModuleAccess({ position: 3, status: 'open', unlockAfterPosition: null });
    }).not.toThrow();
    expect(() => {
      assertModuleAccess({ position: 1, status: 'validated', unlockAfterPosition: null });
    }).not.toThrow();

    try {
      assertModuleAccess({ position: 4, status: 'locked', unlockAfterPosition: 3 });
      throw new Error('refus attendu');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      if (error instanceof AppError) {
        expect(error.code).toBe('MODULE_LOCKED');
        expect(error.detail).toBe('Se débloque quand le quiz du module 3 est validé.');
      }
    }
  });
});
