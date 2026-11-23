// Vitest [SPEC-3201] — modèle de vue de l'écran Aujourd'hui (EF-2, EF-4, EF-9, ET-2, CL-2).
//
// The fixture is the demonstration dataset of SPEC-115 read at 2026-11-11T12:20:00Z (13:20 in
// Paris): the course of 09:00 is done, the warm-up is at 13:50, the validation quiz at 14:00, the
// buffer at 15:00 and the global quiz at 17:00. Assertions cover the selection of the highlighted
// session, the minutes recomputed from the injected instant, the zone of the learner and the order
// of the remaining activities.
import { describe, expect, it } from 'vitest';

import type { HomeDto, HomeSlot, WarmupDto, WarmupItem } from '@learny/contracts';

import {
  alternativeLabel,
  destinationOfSlot,
  gapsFormationOf,
  heroOf,
  hoursLabel,
  linesOf,
  retentionOf,
  stateOf,
  statusLabel,
  streakDays,
  warmupCardOf,
} from './view-model';

const AT = new Date('2026-11-11T12:20:00.000Z');

function slot(overrides: Partial<HomeSlot> & Pick<HomeSlot, 'id' | 'kind' | 'time'>): HomeSlot {
  return {
    formationId: 'f-sap',
    title: 'Activité',
    meta: null,
    moduleId: 'm-3',
    activityId: null,
    startsAt: '2026-11-11T13:00:00.000Z',
    endsAt: '2026-11-11T14:00:00.000Z',
    status: 'planned',
    state: 'upcoming',
    minutesUntil: null,
    href: '/formations/f-sap/modules/m-3/quiz',
    ...overrides,
  };
}

const HOME: HomeDto = {
  today: {
    date: '2026-11-11',
    label: 'Mercredi 11 novembre',
    plannedMinutes: 302,
    doneMinutes: 180,
    slots: [
      slot({
        id: 's-course',
        kind: 'course',
        title: 'Relecture ciblée',
        meta: 'Chapitre 2 et lacunes · fait',
        time: '09:00',
        startsAt: '2026-11-11T08:00:00.000Z',
        endsAt: '2026-11-11T11:00:00.000Z',
        status: 'done',
        state: 'done',
      }),
      slot({
        id: 's-warmup',
        kind: 'warmup',
        title: 'Échauffement',
        meta: '3 questions de rappel · 2 min',
        time: '13:50',
        startsAt: '2026-11-11T12:50:00.000Z',
        endsAt: '2026-11-11T12:52:00.000Z',
        state: 'todo',
      }),
      slot({
        id: 's-quiz',
        kind: 'validation_quiz',
        title: 'Quiz de validation',
        meta: 'Tentative 2 · seuil 80 %',
        time: '14:00',
        state: 'next',
        minutesUntil: 40,
      }),
      slot({
        id: 's-buffer',
        kind: 'buffer',
        title: 'Marge de remédiation',
        meta: 'Utilisée si le quiz échoue',
        time: '15:00',
        startsAt: '2026-11-11T14:00:00.000Z',
        endsAt: '2026-11-11T15:00:00.000Z',
      }),
      slot({
        id: 's-global',
        kind: 'global_quiz',
        title: 'Quiz global',
        meta: '14 notions · 10 min',
        time: '17:00',
        startsAt: '2026-11-11T16:00:00.000Z',
        endsAt: '2026-11-11T16:30:00.000Z',
        href: '/formations/f-sap/quiz-global',
      }),
    ],
    primaryAction: {
      label: 'Commencer le quiz de validation',
      href: '/formations/f-sap/modules/m-3/quiz',
    },
  },
  retention: { oneMonth: null, twoMonths: 0 },
  globalQuiz: null,
  formations: {
    ongoing: [
      {
        id: 'f-sap',
        monogram: 'SAP',
        accent: 'indigo',
        status: 'active',
        title: 'SAP S/4HANA Finance',
        subtitle: 'Être opérationnel · Certification',
        progressPercent: 29,
        modulePosition: 3,
        moduleCount: 7,
        moduleTitle: 'Comptabilité générale',
        moduleStatus: null,
        nextActivity: null,
        endDate: '2026-12-11',
        action: { label: 'Reprendre', href: '/formations/f-sap/modules/m-3' },
        primaryAction: true,
      },
    ],
    completed: [],
  },
};

function warmupItem(position: number): WarmupItem {
  return {
    position,
    notionId: `0f8e1e2a-6b0b-4c1e-9c11-1a2b3c4d5e${String(position)}f`,
    notionLabel: `Notion ${String(position)}`,
    tag: 'yesterday',
    moduleNumber: null,
    question: 'Question ?',
    answer: 'Réponse.',
  };
}

const WARMUP: WarmupDto = {
  activityId: 'a-warmup',
  formationId: 'f-sap',
  nextSession: {
    kind: 'validation_quiz',
    startsAt: '2026-11-11T13:00:00.000Z',
    href: '/formations/f-sap/modules/m-3/quiz',
  },
  scope: 'yesterday_prerequisites',
  items: [warmupItem(0), warmupItem(1), warmupItem(2)],
  answers: [],
  status: 'todo',
};

describe('[SPEC-3201] modèle de vue de la journée', () => {
  it('met en avant le quiz de validation de 14:00 (EF-2, CA-1)', () => {
    const hero = heroOf(HOME, AT);
    expect(hero).not.toBeNull();
    expect(hero?.slotId).toBe('s-quiz');
    expect(hero?.title).toBe('Quiz de validation');
    expect(hero?.time).toBe('14:00');
    expect(hero?.detail).toBe('Comptabilité générale · tentative 2 · seuil 80 %');
    expect(hero?.actionLabel).toBe('Commencer · 60 min');
    expect(hero?.doneLabel).toBe('3 h faites');
    expect(hero?.plannedLabel).toBe('5 h prévues');
    expect(hero?.destination).toEqual({ kind: 'web', path: '/formations/f-sap/modules/m-3/quiz' });
    expect(hero?.label).toBe('Votre séance, Quiz de validation, 14:00');
  });

  it('recalcule « Dans N min » depuis l’instant injecté (ET-2)', () => {
    expect(heroOf(HOME, AT)?.minutesUntil).toBe(40);
    // Two minutes later the same fixture says 38: nothing reads the system clock.
    expect(heroOf(HOME, new Date('2026-11-11T12:22:00.000Z'))?.minutesUntil).toBe(38);
    const buffer = HOME.today.slots[3] as HomeSlot;
    expect(statusLabel(buffer, AT)).toBe('Dans 100 min');
    const global = HOME.today.slots[4] as HomeSlot;
    expect(statusLabel(global, AT)).toBe('À venir');
  });

  it('garde la séance en cours comme séance mise en avant (CL-2)', () => {
    const ongoing = heroOf(HOME, new Date('2026-11-11T13:30:00.000Z'));
    expect(ongoing?.slotId).toBe('s-quiz');
    expect(ongoing?.state).toBe('ongoing');
    expect(ongoing?.actionLabel).toBe('Reprendre');
    expect(ongoing?.minutesUntil).toBeNull();
  });

  it('trie et filtre la suite du jour : séance et échauffement exclus (EF-2, EF-7)', () => {
    const hero = heroOf(HOME, AT);
    const lines = linesOf(HOME, AT, hero?.slotId ?? null);
    expect(lines.map((line) => line.id)).toEqual(['s-course', 's-buffer', 's-global']);
    expect(lines.map((line) => line.status)).toEqual(['Fait', 'Dans 100 min', 'À venir']);
  });

  it('affiche la série du serveur et la rétention non mesurée (EF-4, BR-GAM-01, BR-MEM-06)', () => {
    expect(streakDays({ days: 12 })).toBe(12);
    expect(streakDays(null)).toBeNull();
    expect(retentionOf(HOME)).toBeNull();
    expect(retentionOf({ ...HOME, retention: { oneMonth: 86, twoMonths: 79 } })).toBe(86);
  });

  it('arrondit les heures du jour comme la maquette (« 5 h », « 3 h »)', () => {
    expect(hoursLabel(180)).toBe('3 h');
    expect(hoursLabel(302)).toBe('5 h');
    expect(hoursLabel(45)).toBe('45 min');
  });

  it('affiche les créneaux dans le fuseau de l’apprenant (BR-ACC-07)', () => {
    const startsAt = '2026-11-12T09:30:00.000Z';
    expect(alternativeLabel({ startsAt }, 'Europe/Paris')).toBe('jeu. 12 nov. 10:30');
    expect(alternativeLabel({ startsAt }, 'UTC')).toBe('jeu. 12 nov. 09:30');
  });

  it('route la séance vers sa destination (EF-2, CA-2, ADR-3002 § 3)', () => {
    const quiz = HOME.today.slots[2] as HomeSlot;
    expect(destinationOfSlot({ ...quiz, kind: 'validation_quiz' })).toEqual({
      kind: 'web',
      path: '/formations/f-sap/modules/m-3/quiz',
    });
    const global = HOME.today.slots[4] as HomeSlot;
    expect(destinationOfSlot({ ...global, kind: 'global_quiz' })).toEqual({
      kind: 'app',
      path: '/reviser',
    });
  });

  it('garde une journée vide sans séance (EF-9)', () => {
    const empty: HomeDto = {
      ...HOME,
      today: { ...HOME.today, slots: [], plannedMinutes: 0, doneMinutes: 0 },
    };
    expect(heroOf(empty, AT)).toBeNull();
    expect(linesOf(empty, AT, null)).toEqual([]);
    expect(gapsFormationOf(empty)).toBe('f-sap');
    expect(gapsFormationOf(HOME)).toBe('f-sap');
  });

  it('présente l’échauffement du jour et son compte de questions (EF-7)', () => {
    const card = warmupCardOf({ items: [WARMUP] });
    expect(card).not.toBeNull();
    expect(card?.count).toBe(3);
    expect(card?.title).toBe('Échauffement · 3 questions · 2 min');
    expect(card?.href).toBe('/formations/f-sap/modules/m-3/quiz');
    expect(warmupCardOf({ items: [] })).toBeNull();
    expect(warmupCardOf({ items: [{ ...WARMUP, status: 'done' }] })).toBeNull();
  });

  it('lit l’état d’un créneau sans lire l’horloge (ET-2)', () => {
    const course = HOME.today.slots[0] as HomeSlot;
    expect(stateOf(course, AT)).toBe('done');
    const quiz = HOME.today.slots[2] as HomeSlot;
    expect(stateOf(quiz, AT, 's-quiz')).toBe('next');
  });
});
