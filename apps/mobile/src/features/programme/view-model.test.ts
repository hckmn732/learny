// Vitest [SPEC-3202] — read model of the Programme tab (CA-1, CA-2; BR-FOR-07, BR-FOR-08,
// BR-COU-08). Pure functions only: statuses, order, remaining reading time and calendar weeks.
import { describe, expect, it } from 'vitest';

import { activeProgramme, courseProgress } from '../../../test/programme/fixtures';

import {
  buildProgrammeView,
  calendarGrid,
  calendarWeeks,
  chapterView,
  formatRange,
  mondayOf,
  moduleMeta,
  moduleStatusLabel,
  remainingMinutes,
  resumeChapter,
} from './view-model';

const programme = activeProgramme();
const course = courseProgress();

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`élément ${String(index)} absent des fixtures`);
  return item;
}

function view(): ReturnType<typeof buildProgrammeView> {
  return buildProgrammeView({ programme, course });
}

describe('[SPEC-3202] modèle de vue du programme', () => {
  it('affiche l’avancement et le module en cours du serveur (BR-PRO-01, CA-1)', () => {
    const model = view();
    expect(model.formation.progressPercent).toBe(38);
    expect(model.formation.modulePosition).toBe(3);
    expect(model.formation.moduleCount).toBe(7);
    expect(model.formation.dateRange).toBe('2 nov. – 11 déc.');
    expect(model.formation.paused).toBe(false);
  });

  it('labellise les trois statuts de module (BR-FOR-07)', () => {
    const modules = view().modules;
    expect(modules.map((module) => module.statusLabel)).toEqual([
      'Validé · 86 %',
      'Validé · 91 %',
      'En cours',
      'Verrouillé',
      'Verrouillé',
      'Verrouillé',
      'Verrouillé',
    ]);
  });

  it('décrit un module verrouillé par sa condition de déblocage (BR-FOR-08, CA-2)', () => {
    const locked = at(view().modules, 3);
    expect(locked.locked).toBe(true);
    expect(locked.chapters).toEqual([]);
    expect(locked.unlockLabel).toBe('Se débloque quand le quiz du module 3 est validé.');
    expect(moduleMeta(at(programme.modules, 3), 5)).toBe('5 chapitres · après le module 3');
    expect(moduleStatusLabel(at(programme.modules, 3))).toBe('Verrouillé');
  });

  it('déduit l’état de chaque chapitre de la progression de lecture (BR-COU-08, CA-1)', () => {
    const chapters = at(view().modules, 2).chapters;
    expect(chapters.map((chapter) => chapter.state)).toEqual([
      'validated',
      'current',
      'upcoming',
      'upcoming',
    ]);
    expect(at(chapters, 0).meta).toBe('Validé');
    expect(at(chapters, 1).meta).toBe('8 min');
    expect(at(chapters, 2).meta).toBeNull();
  });

  it('arrondit la durée restante à la minute supérieure (BR-COU-08)', () => {
    expect(remainingMinutes(45, 14)).toBe(8);
    expect(remainingMinutes(99, 14)).toBe(1);
    expect(remainingMinutes(0, 14)).toBe(14);
  });

  it('reprend le chapitre en cours, sinon le suivant (CA-2)', () => {
    const open = at(view().modules, 2);
    expect(view().resume).toEqual({
      moduleId: open.id,
      chapterId: '00000000-0000-4000-8000-00000000000302',
      chapterPosition: 2,
      label: 'Reprendre le chapitre 2',
    });
    const chapters = open.chapters.map((chapter) => ({ ...chapter, state: 'validated' as const }));
    expect(resumeChapter(at(programme.modules, 2), chapters)?.position).toBe(4);
  });

  it('ne propose aucune reprise hors d’un module ouvert (EF-4)', () => {
    expect(resumeChapter(at(programme.modules, 1), [])).toBeNull();
  });

  it('marque la semaine courante et les séances du calendrier (EF-6)', () => {
    const weeks = calendarWeeks(programme.calendar, programme.today);
    expect(weeks.length).toBeGreaterThan(0);
    expect(weeks.filter((week) => week.current)).toHaveLength(1);
    expect(weeks.flatMap((week) => week.sessions).length).toBeGreaterThan(0);
    expect(mondayOf('2026-11-11')).toBe('2026-11-09');
    expect(formatRange('2026-11-02', '2026-12-11')).toBe('2 nov. – 11 déc.');
  });

  it('grille le calendrier du lundi au dimanche et repère aujourd’hui (EF-6)', () => {
    const rows = calendarGrid(programme.calendar, programme.today);
    expect(rows[0]).toHaveLength(7);
    expect(at(at(rows, 0), 0).day).toBe('2026-11-02');
    const today = rows.flat().find((day) => day.today);
    expect(today?.day).toBe('2026-11-11');
    expect(rows.flat().filter((day) => day.session).length).toBeGreaterThan(0);
  });

  it('donne un libellé accessible à chaque chapitre (BR-PLA-03)', () => {
    const chapter = programme.chapters.find((entry) => entry.id.endsWith('302'));
    if (chapter === undefined) throw new Error('chapitre 2 absent des fixtures');
    const current = chapterView(at(programme.modules, 2), chapter, course);
    expect(current.accessibilityLabel).toBe('Saisie des pièces comptables, 8 min');
  });
});
