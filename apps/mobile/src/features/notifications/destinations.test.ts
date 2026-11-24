// Vitest [SPEC-3102] — destination table of the notifications (ET-3, BR-NOT-02, CA-2).
import { describe, expect, it } from 'vitest';

import {
  EVENT_NOTIFICATION_TYPES,
  type NotificationItem,
  type NotificationType,
} from '@learny/contracts';

import {
  destinationOf,
  iconOf,
  moduleOf,
  NOTIFICATION_DESTINATIONS,
  NOTIFICATION_ICONS,
} from './destinations';

const ITEM: NotificationItem = {
  id: '11111111-1111-4111-8111-111111111111',
  type: 'global_quiz_today',
  icon: 'quiz',
  title: 'Quiz global du jour',
  body: '14 notions à revoir, lacunes en priorité. Prévu à 17:00.',
  href: '/formations/sap/quiz-global',
  formationTitle: 'SAP S/4HANA Finance',
  createdAt: '2026-11-11T08:00:00.000Z',
  readAt: null,
  group: 'today',
};

function itemOf(type: NotificationType, href = '/formations/sap/modules/3/quiz'): NotificationItem {
  return { ...ITEM, type, href };
}

describe('[SPEC-3102] table des destinations (ET-3, BR-NOT-02)', () => {
  it('décrit les seize types du contrat, sans trou (BR-NOT-02)', () => {
    const expected = [...EVENT_NOTIFICATION_TYPES].sort();
    expect(Object.keys(NOTIFICATION_DESTINATIONS).sort()).toEqual(expected);
    expect(Object.keys(NOTIFICATION_ICONS).sort()).toEqual(expected);
  });

  it('chaque type porte une icône de la table de la maquette (BR-NOT-02)', () => {
    for (const type of EVENT_NOTIFICATION_TYPES) {
      expect(iconOf({ type }).length).toBeGreaterThan(0);
    }
    expect(iconOf({ type: 'new_gap' })).toBe('target');
    expect(iconOf({ type: 'module_validated' })).toBe('check');
  });

  it('ouvre l’onglet de la table pour les types livrés (ET-3, CA-2)', () => {
    expect(destinationOf(itemOf('global_quiz_today'))).toEqual({
      kind: 'app',
      path: '/reviser',
      delivered: true,
    });
    expect(destinationOf(itemOf('session_planned')).path).toBe('/agenda');
    expect(destinationOf(itemOf('module_validated')).path).toBe('/programme');
    expect(destinationOf(itemOf('session_to_reschedule')).path).toBe('/aujourdhui');
    expect(destinationOf(itemOf('weekly_review')).path).toBe('/aujourdhui');
    expect(destinationOf(itemOf('milestone')).path).toBe('/aujourdhui');
    expect(destinationOf(itemOf('export_ready')).path).toBe('/profil');
    expect(destinationOf(itemOf('planning_adjusted')).path).toBe('/agenda');
  });

  it('ouvre la page web pour les types hors périmètre mobile (ET-3, ADR-3002 § 3)', () => {
    expect(destinationOf(itemOf('new_gap', '/formations/sap/lacunes'))).toEqual({
      kind: 'web',
      path: '/formations/sap/lacunes',
      delivered: true,
    });
    expect(destinationOf(itemOf('group_invitation', '/groupes/abc')).kind).toBe('web');
    expect(destinationOf(itemOf('ai_task_failed', '/parametres#ia')).kind).toBe('web');
  });

  it('ouvre le web tant que les écrans cours et quiz ne sont pas livrés (SPEC-3202/3203)', () => {
    expect(destinationOf(itemOf('validation_soon'))).toEqual({
      kind: 'web',
      path: '/formations/sap/modules/3/quiz',
      delivered: false,
    });
    expect(moduleOf('/formations/sap/modules/3/quiz')).toBe('3');
    expect(moduleOf('/formations/sap/quiz-global')).toBeNull();
    const course = destinationOf(itemOf('course_ready', '/formations/sap/modules/3/cours'));
    expect(course.kind).toBe('web');
  });

  it('reste sur la feuille pour un type inconnu (ET-3)', () => {
    const unknown = { ...ITEM, type: 'type_inconnu' as NotificationType };
    expect(destinationOf(unknown)).toEqual({ kind: 'none', path: '', delivered: false });
  });

  it('refuse un chemin web qui n’est pas interne (ADR-3002 § 3)', () => {
    expect(destinationOf(itemOf('new_gap', 'https://evil.example/x')).kind).toBe('none');
  });
});
