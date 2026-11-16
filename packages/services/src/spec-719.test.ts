// Unit rules of the sprints before a milestone (SPEC-719, BR-AUT-08, ADR-0190).
//
// The helpers are pure (ADR-0020): no database and no process clock. They pin the local J-K/J-1
// calendar days across a DST change, the stable weakest-notion order, the planner placement and
// the explicit impossible days of CL-3.
import { describe, expect, it } from 'vitest';

import { sprintDedupeKey } from '@learny/contracts';
import type { PlannerPreferences } from '@learny/learning-engine';

import {
  explainSprint,
  placeSprintTargets,
  selectWeakestNotions,
  sprintTargetDays,
} from '../../automations/src/automatisme-8-sprint-avant-un-jalon';

const NOW = new Date('2026-11-11T12:20:00Z');
const TZ = 'Europe/Paris';

const PREFERENCES: PlannerPreferences = {
  tz: TZ,
  availability: {
    hoursPerDay: 2,
    studyDays: [1, 2, 3, 4, 5],
    preferredSlots: ['soir'],
  },
};

function uuid(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

describe('[SPEC-719] règles et calculs', () => {
  it('CA-1 — une épreuve du 14 novembre produit J-3 et J-1 en jours locaux', () => {
    expect(sprintTargetDays('2026-11-14', 3)).toEqual([
      { label: 'J-K', day: '2026-11-11' },
      { label: 'J-1', day: '2026-11-13' },
    ]);
    // ET-5 — the civil day stays stable around the DST change (25 October 2026 in Paris).
    expect(sprintTargetDays('2026-10-27', 3)).toEqual([
      { label: 'J-K', day: '2026-10-24' },
      { label: 'J-1', day: '2026-10-26' },
    ]);
    expect(sprintTargetDays('2026-11-14', 2)).toEqual([
      { label: 'J-K', day: '2026-11-12' },
      { label: 'J-1', day: '2026-11-13' },
    ]);
    expect(sprintTargetDays('2026-11-14', 5)).toEqual([
      { label: 'J-K', day: '2026-11-09' },
      { label: 'J-1', day: '2026-11-13' },
    ]);
  });

  it('CA-1 — deux créneaux de 30 minutes, placés sans chevauchement', () => {
    const plan = placeSprintTargets({
      examDate: '2026-11-14',
      examSlotId: uuid(700),
      formationId: uuid(1),
      moduleId: uuid(10),
      daysBefore: 3,
      durationMin: 30,
      now: NOW,
      timeZone: TZ,
      preferences: PREFERENCES,
      slots: [],
    });
    expect(plan.targets.map((target) => target.day)).toEqual(['2026-11-11', '2026-11-13']);
    expect(plan.targets.every((target) => target.durationMin === 30)).toBe(true);
    expect(plan.targets.every((target) => target.startsAt < target.endsAt)).toBe(true);
    const [first, second] = plan.targets;
    expect(first?.startsAt).not.toBe(second?.startsAt);
    expect(new Date(first?.startsAt ?? 0).getTime()).toBeGreaterThanOrEqual(NOW.getTime());
    expect(plan.impossible).toEqual([]);
  });

  it('CL-3 — un jour non étudié est expliqué, les créneaux compatibles restent placés', () => {
    // 16 November 2026 is a Monday: J-3 is Friday 13 and J-1 is Sunday 15, not studied.
    const plan = placeSprintTargets({
      examDate: '2026-11-16',
      examSlotId: uuid(701),
      formationId: uuid(1),
      moduleId: uuid(10),
      daysBefore: 3,
      durationMin: 30,
      now: NOW,
      timeZone: TZ,
      preferences: PREFERENCES,
      slots: [],
    });
    expect(plan.targets.map((target) => target.day)).toEqual(['2026-11-13']);
    expect(plan.impossible).toEqual([{ label: 'J-1', day: '2026-11-15', reason: 'no_study_day' }]);
  });

  it('CL-3 — aucune place restante : les deux jours sont expliqués sans chevauchement', () => {
    const busy = {
      slotId: uuid(900),
      formationId: uuid(1),
      moduleId: null,
      kind: 'course' as const,
      title: 'Cours',
      startsAt: '2026-11-11T08:00:00.000Z',
      endsAt: '2026-11-14T23:00:00.000Z',
      status: 'planned' as const,
      createdBy: 'planner' as const,
      movedFromId: null,
    };
    const plan = placeSprintTargets({
      examDate: '2026-11-14',
      examSlotId: uuid(702),
      formationId: uuid(1),
      moduleId: uuid(10),
      daysBefore: 3,
      durationMin: 30,
      now: NOW,
      timeZone: TZ,
      preferences: PREFERENCES,
      slots: [busy],
    });
    expect(plan.targets).toEqual([]);
    expect(plan.impossible.map((entry) => entry.reason)).toEqual(['no_slot', 'no_slot']);
  });

  it('ET-3 — notions les plus faibles d’abord, identifiant stable en cas d’égalité', () => {
    const selected = selectWeakestNotions(
      [
        { notionId: uuid(3), label: 'C', mastery: 40 },
        { notionId: uuid(1), label: 'A', mastery: 20 },
        { notionId: uuid(2), label: 'B', mastery: 40 },
        { notionId: uuid(4), label: 'D', mastery: 10 },
      ],
      3,
    );
    expect(selected.map((notion) => notion.notionId)).toEqual([uuid(4), uuid(1), uuid(2)]);
    expect(selectWeakestNotions([], 3)).toEqual([]);
    expect(selectWeakestNotions([{ notionId: '', label: '', mastery: 0 }])).toEqual([]);
  });

  it('ET-4 — la clé de déduplication dépend de l’épreuve, de la date et de K', () => {
    expect(sprintDedupeKey(uuid(700), '2026-11-14', 3)).toBe(`sprint:${uuid(700)}:2026-11-14:3`);
    expect(sprintDedupeKey(uuid(700), '2026-11-14', 3)).not.toBe(
      sprintDedupeKey(uuid(700), '2026-11-15', 3),
    );
    expect(sprintDedupeKey(uuid(700), '2026-11-14', 3)).not.toBe(
      sprintDedupeKey(uuid(700), '2026-11-14', 5),
    );
  });

  it('EF-2 — l’explication tient sur une ligne de 160 caractères', () => {
    const text = explainSprint(
      {
        id: uuid(1),
        automation: 'sprint',
        kind: 'sprint_planned',
        summary: '',
        formationId: uuid(1),
        payload: {
          examTitle: 'Quiz de validation · Partie 3',
          durationMin: 30,
          notionIds: [uuid(1)],
          notionLabels: ['Clé de comptabilisation', 'Date comptable', 'Plan comptable'],
          targets: [
            {
              label: 'J-K',
              day: '2026-11-11',
              slotId: null,
              startsAt: '2026-11-11T17:30:00.000Z',
              endsAt: '2026-11-11T18:00:00.000Z',
              durationMin: 30,
            },
            {
              label: 'J-1',
              day: '2026-11-13',
              slotId: null,
              startsAt: '2026-11-13T17:30:00.000Z',
              endsAt: '2026-11-13T18:00:00.000Z',
              durationMin: 30,
            },
          ],
          impossible: [],
        },
        undoPayload: null,
        requiresConsent: false,
        status: 'applied',
        decidedAt: null,
        createdAt: '2026-11-10T19:00:00.000Z',
      },
      'vous',
      TZ,
    );
    expect(text.length).toBeLessThanOrEqual(160);
    expect(text).toContain('Sprints de 30 min'.replace('Sprints', 'Vos sprints'));
    expect(text).not.toContain('\n');
  });
});
