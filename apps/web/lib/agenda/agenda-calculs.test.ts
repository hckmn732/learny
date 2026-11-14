import { describe, expect, it } from 'vitest';

import type { AgendaSlot, AgendaSlotKind } from '@learny/contracts';

import { chipLabel, formatDuration, legendEntriesOf, monthCells, totalsOf } from './format';
import { gridHours, layoutDay } from './grid';
import {
  calendarAriaLabel,
  navLabel,
  navTargets,
  rangeCaption,
  rangeLabel,
  shortDayLabel,
  visibleRange,
} from './range';
import { agendaUrl, resolveAgendaState } from './state';

const BOUNDS = { start: '2026-11-02', end: '2026-12-11' };

function slot(input: Partial<AgendaSlot> & Pick<AgendaSlot, 'id'>): AgendaSlot {
  return {
    formationId: 'f-sap',
    moduleId: null,
    moduleNumber: null,
    kind: 'course',
    typeLabel: 'Cours',
    title: 'Séance',
    meta: null,
    date: '2026-11-11',
    startsAt: '2026-11-11T09:00:00.000Z',
    endsAt: '2026-11-11T10:00:00.000Z',
    startMinutes: 540,
    endMinutes: 600,
    status: 'planned',
    href: '/formations/f-sap',
    activityId: null,
    movable: true,
    ...input,
  };
}

describe('[SPEC-704] agenda : calculs', () => {
  describe('resolveAgendaState', () => {
    it('applique les défauts (vue semaine, aujourd’hui, toutes les formations)', () => {
      expect(resolveAgendaState({}, '2026-11-11', BOUNDS)).toEqual({
        view: 'semaine',
        date: '2026-11-11',
        formation: 'all',
        creneau: null,
      });
    });

    it('remplace une vue ou une date invalide par le défaut (EF-1)', () => {
      expect(resolveAgendaState({ vue: 'annee' }, '2026-11-11', BOUNDS).view).toBe('semaine');
      expect(resolveAgendaState({ date: '32/11/2026' }, '2026-11-11', BOUNDS).date).toBe(
        '2026-11-11',
      );
      expect(resolveAgendaState({ date: '2026-02-30' }, '2026-11-11', BOUNDS).date).toBe(
        '2026-11-11',
      );
    });

    it('ramène une date hors bornes à la borne la plus proche (CL-6)', () => {
      expect(resolveAgendaState({ date: '2026-10-01' }, '2026-11-11', BOUNDS).date).toBe(
        '2026-11-02',
      );
      expect(resolveAgendaState({ date: '2027-01-15' }, '2026-11-11', BOUNDS).date).toBe(
        '2026-12-11',
      );
      expect(resolveAgendaState({ date: '2027-01-15' }, '2026-11-11', null).date).toBe(
        '2027-01-15',
      );
    });

    it('conserve le filtre et le créneau demandés (CL-10)', () => {
      const state = resolveAgendaState(
        { formation: 'f-agile', creneau: 'w2' },
        '2026-11-11',
        BOUNDS,
      );
      expect(state.formation).toBe('f-agile');
      expect(state.creneau).toBe('w2');
      expect(agendaUrl(state)).toBe(
        '/agenda?vue=semaine&date=2026-11-11&formation=f-agile&creneau=w2',
      );
    });
  });

  describe('visibleRange', () => {
    it('affiche lundi–vendredi par défaut (EF-6)', () => {
      expect(visibleRange('semaine', '2026-11-11', [1, 2, 3, 4, 5])).toEqual([
        '2026-11-09',
        '2026-11-10',
        '2026-11-11',
        '2026-11-12',
        '2026-11-13',
      ]);
    });

    it('ajoute le samedi et le dimanche étudiés ou portant un créneau (CL-7)', () => {
      expect(visibleRange('semaine', '2026-11-11', [1, 2, 3, 4, 5, 6, 7])).toHaveLength(7);
      expect(visibleRange('semaine', '2026-11-11', [1, 2, 3, 4, 5], ['2026-11-14'])).toEqual([
        '2026-11-09',
        '2026-11-10',
        '2026-11-11',
        '2026-11-12',
        '2026-11-13',
        '2026-11-14',
      ]);
    });

    it('renvoie le jour et le mois complets', () => {
      expect(visibleRange('jour', '2026-11-11', [])).toEqual(['2026-11-11']);
      expect(visibleRange('mois', '2026-11-11', [])).toHaveLength(30);
      expect(visibleRange('mois', '2026-11-11', [])[0]).toBe('2026-11-01');
    });
  });

  describe('navTargets', () => {
    it('borne la navigation de semaine aux formations affichées (CA-3, ADR-0183)', () => {
      expect(navTargets('semaine', '2026-11-09', BOUNDS, [1, 2, 3, 4, 5])).toEqual({
        prev: '2026-11-02',
        next: '2026-11-16',
      });
      // Semaine du 2 novembre : la semaine précédente sort des bornes SAP.
      expect(navTargets('semaine', '2026-11-02', BOUNDS, [1, 2, 3, 4, 5]).prev).toBeNull();
      expect(navTargets('semaine', '2026-11-30', BOUNDS, [1, 2, 3, 4, 5]).next).toBe('2026-12-07');
      // Semaine du 7 décembre : la semaine suivante sort des bornes.
      expect(navTargets('semaine', '2026-12-07', BOUNDS, [1, 2, 3, 4, 5]).next).toBeNull();
    });

    it('élargit les bornes à la formation la plus ancienne (filtre « Toutes »)', () => {
      const all = { start: '2026-10-26', end: '2026-12-11' };
      expect(navTargets('semaine', '2026-11-02', all, [1, 2, 3, 4, 5]).prev).toBe('2026-10-26');
      expect(navTargets('semaine', '2026-10-26', all, [1, 2, 3, 4, 5]).prev).toBeNull();
    });

    it('saute les jours sans étude ni créneau en vue Jour (CA-3)', () => {
      const study = [1, 2, 3, 4, 5];
      expect(navTargets('jour', '2026-11-13', BOUNDS, study).next).toBe('2026-11-16');
      expect(navTargets('jour', '2026-11-09', BOUNDS, study).prev).toBe('2026-11-06');
      // Samedi non étudié : précédent mène au vendredi, suivant au lundi.
      expect(navTargets('jour', '2026-11-07', BOUNDS, study)).toEqual({
        prev: '2026-11-06',
        next: '2026-11-09',
      });
      // Un créneau d'un samedi rend ce jour atteignable.
      expect(navTargets('jour', '2026-11-09', BOUNDS, study, ['2026-11-07']).prev).toBe(
        '2026-11-07',
      );
    });

    it('cible le mois voisin quand il recoupe les bornes (EF-4)', () => {
      expect(navTargets('mois', '2026-11-11', BOUNDS, [])).toEqual({
        prev: null,
        next: '2026-12-01',
      });
      expect(navTargets('mois', '2026-12-07', BOUNDS, []).next).toBeNull();
      const all = { start: '2026-10-26', end: '2026-12-11' };
      expect(navTargets('mois', '2026-11-11', all, []).prev).toBe('2026-10-01');
    });

    it('désactive la navigation sans formation', () => {
      expect(navTargets('semaine', '2026-11-11', null, [])).toEqual({ prev: null, next: null });
    });
  });

  describe('rangeLabel et libellés', () => {
    it('écrit la plage de la semaine dans un même mois (CA-1)', () => {
      expect(rangeLabel('semaine', ['2026-11-09', '2026-11-13'])).toBe('9 – 13 nov. 2026');
    });

    it('écrit la plage à cheval sur deux mois', () => {
      expect(rangeLabel('semaine', ['2026-11-30', '2026-12-04'])).toBe('30 nov. – 4 déc. 2026');
    });

    it('écrit le jour et le mois (EF-3)', () => {
      expect(rangeLabel('jour', ['2026-11-11'])).toBe('Mercredi 11 nov. 2026');
      expect(rangeLabel('mois', ['2026-11-01'])).toBe('Novembre 2026');
      expect(rangeLabel('semaine', [])).toBe('');
    });

    it('écrit le complément du sur-titre sans l’année (EF-2)', () => {
      expect(rangeCaption('semaine', ['2026-11-09', '2026-11-13'])).toBe('semaine du 9 – 13 nov.');
      expect(rangeCaption('jour', ['2026-11-11'])).toBe('Mercredi 11 nov.');
      expect(rangeCaption('mois', ['2026-11-01'])).toBe('novembre 2026');
    });

    it('étiquette le calendrier et les boutons de navigation (EF-3, ET-9)', () => {
      expect(calendarAriaLabel('semaine', ['2026-11-09', '2026-11-13'])).toBe(
        'Semaine · 9 – 13 nov. 2026',
      );
      expect(navLabel('semaine', 'prev')).toBe('Semaine précédente');
      expect(navLabel('jour', 'next')).toBe('Jour suivant');
      expect(navLabel('mois', 'prev')).toBe('Mois précédent');
      expect(shortDayLabel('2026-11-11')).toBe('Mer');
    });
  });

  describe('gridHours', () => {
    it('couvre 09:00–18:00 par défaut (CA-2, ET-6)', () => {
      const grid = gridHours([]);
      expect(grid).toMatchObject({ startHour: 9, endHour: 18 });
      expect(grid.labels[0]).toBe('09:00');
      expect(grid.labels).toHaveLength(9);
      expect(grid.labels[8]).toBe('17:00');
    });

    it('s’étend aux créneaux plus tôt ou plus tard (ET-6)', () => {
      expect(gridHours([{ startMinutes: 8 * 60 + 30, endMinutes: 9 * 60 }]).startHour).toBe(8);
      expect(gridHours([{ startMinutes: 14 * 60, endMinutes: 20 * 60 + 30 }]).endHour).toBe(21);
    });
  });

  describe('layoutDay', () => {
    it('positionne un créneau à l’échelle de 60 px par heure (EF-6)', () => {
      const layout = layoutDay([{ startMinutes: 9 * 60, endMinutes: 12 * 60 }], 9);
      expect(layout[0]).toMatchObject({ top: 2, height: 176, column: 0, columns: 1 });
    });

    it('partage la largeur des créneaux qui se chevauchent (ET-7, CL-8)', () => {
      const layout = layoutDay(
        [
          { startMinutes: 9 * 60, endMinutes: 10 * 60 },
          { startMinutes: 9 * 60 + 30, endMinutes: 10 * 60 + 30 },
          { startMinutes: 11 * 60, endMinutes: 12 * 60 },
        ],
        9,
      );
      expect(layout.map((entry) => entry.columns)).toEqual([2, 2, 1]);
      expect(layout.map((entry) => entry.column)).toEqual([0, 1, 0]);
    });

    it('tronque un créneau à cheval sur minuit à la fin de la grille (CL-3)', () => {
      const layout = layoutDay([{ startMinutes: 23 * 60 + 30, endMinutes: 30 }], 9);
      expect(layout[0]?.height).toBe(26);
      expect(layout[0]?.timeLabel).toBe('23:30 – 00:30');
    });
  });

  describe('formatDuration et totaux', () => {
    it('écrit les durées selon EF-11 (CA-6)', () => {
      expect(formatDuration(0)).toBe('0 h');
      expect(formatDuration(300)).toBe('5 h');
      expect(formatDuration(90)).toBe('1 h 30');
      expect(formatDuration(1740)).toBe('29 h');
    });

    it('calcule les totaux de la période affichée (BR-AGE-06)', () => {
      const totals = totalsOf([
        slot({
          id: 'a',
          kind: 'contributions',
          startsAt: '2026-11-11T08:00:00.000Z',
          endsAt: '2026-11-11T10:00:00.000Z',
          status: 'done',
        }),
        slot({ id: 'b', kind: 'buffer', status: 'planned' }),
        slot({ id: 'c', kind: 'buffer', status: 'done' }),
        slot({
          id: 'd',
          kind: 'course',
          status: 'missed',
          startsAt: '2026-11-11T13:00:00.000Z',
          endsAt: '2026-11-11T14:30:00.000Z',
        }),
      ]);
      expect(totals).toEqual({ plannedMinutes: 210, doneMinutes: 120, marginsRemaining: 1 });
    });
  });

  describe('pastilles et légende', () => {
    const sigleOf = (id: string) => (id === 'f-sap' ? 'SAP' : 'AG');

    it('étiquette les pastilles du mois selon ADR-0183 §5 (EF-8)', () => {
      const chips: {
        kind: AgendaSlotKind;
        title: string;
        formationId: string;
        startMinutes: number;
      }[] = [
        {
          kind: 'validation_quiz',
          title: 'Quiz de validation',
          formationId: 'f-sap',
          startMinutes: 840,
        },
        {
          kind: 'course',
          title: 'Lecture du cours',
          formationId: 'f-agile',
          startMinutes: 17 * 60 + 30,
        },
        {
          kind: 'buffer',
          title: 'Marge de rattrapage',
          formationId: 'f-sap',
          startMinutes: 15 * 60,
        },
      ];
      expect(chips.map((chip) => chipLabel(chip, 'f-sap', sigleOf))).toEqual([
        'Quiz de validation',
        'AG · 17:30',
        'Marge de rattrapage',
      ]);
    });

    it('affiche les six entrées de la maquette et les types complémentaires présents (EF-10)', () => {
      const base = legendEntriesOf(['course', 'buffer']);
      expect(base.map((entry) => entry.label)).toEqual([
        'Apports',
        'Cours',
        'Exercice',
        'Quiz de validation',
        'Quiz global · révision',
        'Marge de rattrapage',
      ]);
      const withExam = legendEntriesOf(['course', 'mock_exam', 'sprint']);
      expect(withExam.map((entry) => entry.label)).toEqual([
        'Apports',
        'Cours',
        'Exercice',
        'Quiz de validation',
        'Quiz global · révision',
        'Marge de rattrapage',
        'Examen blanc',
        'Sprint',
      ]);
    });
  });

  describe('monthCells', () => {
    it('commence au lundi et couvre tout le mois (EF-5)', () => {
      const cells = monthCells('2026-11-11');
      expect(cells.lead).toBe(6); // 1er novembre 2026 = dimanche
      expect(cells.days[0]).toBe('2026-11-01');
      expect(cells.days).toHaveLength(30);
      expect(cells.days[29]).toBe('2026-11-30');
    });
  });
});
