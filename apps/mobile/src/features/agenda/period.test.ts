// Vitest [SPEC-3203] — périodes, semaines et mois de l'agenda (ET-1, EF-2, EF-4, EF-5, CA-2).
//
// Les bornes sont celles de la maquette (semaine du lundi 9 au dimanche 15 novembre 2026) et les
// jours sont lus dans le fuseau de l'apprenant, jamais dans celui du processus : les deux fuseaux
// ci-dessous donnent deux journées civiles différentes pour le même instant (BR-ACC-07).
import { describe, expect, it } from 'vitest';

import {
  addDays,
  addMonths,
  canShift,
  clampDay,
  dayDistance,
  daysInMonth,
  daysOfWeek,
  endOfMonth,
  endOfWeek,
  formatMinutes,
  formatMinuteOfDay,
  isInPeriod,
  minutesOfDay,
  monthCells,
  periodOf,
  shiftPeriod,
  startOfMonth,
  startOfWeek,
  todayOf,
  weekdayOf,
} from './period';

const WEDNESDAY = '2026-11-11';
const PARIS = 'Europe/Paris';
const NEW_YORK = 'America/New_York';

describe('[SPEC-3203] périodes de l’agenda', () => {
  it('démarre la semaine le lundi et la finit le dimanche (EF-2)', () => {
    expect(weekdayOf(WEDNESDAY)).toBe(2);
    expect(startOfWeek(WEDNESDAY)).toBe('2026-11-09');
    expect(endOfWeek(WEDNESDAY)).toBe('2026-11-15');
    expect(startOfWeek('2026-11-15')).toBe('2026-11-09');
    expect(startOfWeek('2026-11-09')).toBe('2026-11-09');
  });

  it('rend les sept jours de la semaine du lundi au dimanche (EF-2)', () => {
    const days = daysOfWeek(WEDNESDAY);
    expect(days).toHaveLength(7);
    expect(days[0]).toBe('2026-11-09');
    expect(days[6]).toBe('2026-11-15');
    expect(days.map((day) => weekdayOf(day))).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('borne un jour, une semaine et un mois (BR-AGE-01)', () => {
    expect(periodOf('jour', WEDNESDAY)).toEqual({ from: WEDNESDAY, to: WEDNESDAY });
    expect(periodOf('semaine', WEDNESDAY)).toEqual({ from: '2026-11-09', to: '2026-11-15' });
    expect(periodOf('mois', WEDNESDAY)).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(isInPeriod('2026-11-15', periodOf('semaine', WEDNESDAY))).toBe(true);
    expect(isInPeriod('2026-11-16', periodOf('semaine', WEDNESDAY))).toBe(false);
  });

  it('compte les jours des mois, années bissextiles comprises', () => {
    expect(daysInMonth('2026-11-11')).toBe(30);
    expect(daysInMonth('2026-02-10')).toBe(28);
    expect(daysInMonth('2024-02-10')).toBe(29);
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28');
    expect(startOfMonth('2026-11-11')).toBe('2026-11-01');
  });

  it('décale une période d’un jour, d’une semaine ou d’un mois (EF-9)', () => {
    expect(shiftPeriod('jour', WEDNESDAY, 1)).toBe('2026-11-12');
    expect(shiftPeriod('jour', WEDNESDAY, -1)).toBe('2026-11-10');
    expect(shiftPeriod('semaine', WEDNESDAY, 1)).toBe('2026-11-18');
    expect(shiftPeriod('semaine', WEDNESDAY, -1)).toBe('2026-11-04');
    expect(shiftPeriod('mois', WEDNESDAY, 1)).toBe('2026-12-11');
    expect(shiftPeriod('mois', WEDNESDAY, -1)).toBe('2026-10-11');
  });

  it('ramène le jour d’un mois plus court au dernier jour du mois cible', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
  });

  it('traverse les changements d’heure sans perdre de jour', () => {
    // 25 octobre 2026 : fin de l'heure d'été en Europe/Paris, une journée de 25 heures.
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25');
    expect(dayDistance('2026-10-24', '2026-10-26')).toBe(2);
    expect(daysOfWeek('2026-10-25')[0]).toBe('2026-10-19');
  });

  it('dessine six semaines pleines pour le mois de la maquette (EF-5)', () => {
    const cells = monthCells(WEDNESDAY);
    expect(cells).toHaveLength(42);
    expect(cells[0]?.day).toBe('2026-10-26');
    expect(cells[0]?.inMonth).toBe(false);
    expect(cells[6]?.day).toBe('2026-11-01');
    expect(cells[6]?.inMonth).toBe(true);
    expect(cells[35]?.day).toBe('2026-11-30');
    expect(cells[36]?.day).toBe('2026-12-01');
    expect(cells[36]?.inMonth).toBe(false);
    expect(cells.every((cell) => weekdayOf(cell.day) === cells.indexOf(cell) % 7)).toBe(true);
  });

  it('borne la navigation aux dates des formations (CL-2)', () => {
    const bounds = { from: '2026-11-09', to: '2026-11-15' };
    expect(canShift('jour', WEDNESDAY, -1, bounds)).toBe(true);
    expect(canShift('jour', '2026-11-09', -1, bounds)).toBe(false);
    expect(canShift('jour', '2026-11-15', 1, bounds)).toBe(false);
    expect(canShift('semaine', WEDNESDAY, 1, bounds)).toBe(false);
    expect(canShift('mois', WEDNESDAY, 1, bounds)).toBe(false);
    expect(canShift('mois', WEDNESDAY, 1, null)).toBe(true);
    expect(clampDay('2026-11-01', bounds)).toBe('2026-11-09');
    expect(clampDay('2026-12-01', bounds)).toBe('2026-11-15');
    expect(clampDay(WEDNESDAY, bounds)).toBe(WEDNESDAY);
    expect(clampDay('2026-01-01', null)).toBe('2026-01-01');
  });

  it('lit le jour et l’heure dans le fuseau de l’apprenant (BR-ACC-07)', () => {
    const lateInParis = new Date('2026-11-10T23:30:00.000Z');
    expect(todayOf(lateInParis, PARIS)).toBe('2026-11-11');
    expect(todayOf(lateInParis, NEW_YORK)).toBe('2026-11-10');
    const frozen = new Date('2026-11-11T12:20:00.000Z');
    expect(todayOf(frozen, PARIS)).toBe('2026-11-11');
    expect(minutesOfDay(frozen, PARIS)).toBe(13 * 60 + 20);
    expect(minutesOfDay(frozen, NEW_YORK)).toBe(7 * 60 + 20);
    expect(minutesOfDay(frozen, 'UTC')).toBe(12 * 60 + 20);
  });

  it('formate les heures et les durées des totaux (EF-3, BR-AGE-06)', () => {
    expect(formatMinuteOfDay(540)).toBe('09:00');
    expect(formatMinuteOfDay(800)).toBe('13:20');
    expect(formatMinuteOfDay(1439)).toBe('23:59');
    expect(formatMinutes(800)).toBe('13 h 20');
    expect(formatMinutes(120)).toBe('2 h');
    expect(formatMinutes(40)).toBe('40 min');
    expect(formatMinutes(0)).toBe('0 min');
  });
});
