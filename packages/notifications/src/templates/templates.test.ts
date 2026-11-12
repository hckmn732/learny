import { describe, expect, it } from 'vitest';

import { EVENT_NOTIFICATION_TYPES } from '@learny/contracts';

import { NOTIFICATION_TEMPLATES, TYPE_PREFERENCE, channelsOf } from './index';

const DATA = {
  formationTitle: 'SAP S/4HANA Finance',
  moduleTitle: 'Comptabilité générale',
  notionTitle: 'Saisie des pièces comptables',
  title: 'Séance de travail',
  when: 'demain à 14:00',
  minutes: 20,
  notions: 14,
  activityCount: 5,
  plannedLabel: '5 h',
  studyLabel: '13 h',
  percent: 85,
  taskLabel: 'Génération du cours',
  groupTitle: 'Promotion Finance',
  href: '/aujourdhui',
  milestones: '10 notions maîtrisées',
  label: '10 notions maîtrisées',
};

const VOUVOIEMENT = /\b(vous|votre|vos)\b/iu;

describe('[SPEC-209] gabarits', () => {
  it('CA-5 — un gabarit par type, dans l’ordre de notification_type', () => {
    expect(Object.keys(NOTIFICATION_TEMPLATES)).toEqual([...EVENT_NOTIFICATION_TYPES]);
    for (const type of EVENT_NOTIFICATION_TYPES) {
      expect(NOTIFICATION_TEMPLATES[type].icon).toMatch(/^[a-z][a-z0-9-]{0,39}$/u);
    }
  });

  it('CA-5 — 16 types × 2 tons : titres et textes bornés, liens internes', () => {
    for (const type of EVENT_NOTIFICATION_TYPES) {
      const template = NOTIFICATION_TEMPLATES[type];
      for (const tone of ['vous', 'tu'] as const) {
        const title = template.title(DATA, tone);
        const body = template.body(DATA, tone);
        expect(title.length, `${type}/${tone}`).toBeGreaterThan(0);
        expect(title.length, `${type}/${tone}`).toBeLessThanOrEqual(120);
        expect(body.length, `${type}/${tone}`).toBeGreaterThan(0);
        expect(body.length, `${type}/${tone}`).toBeLessThanOrEqual(400);
        expect(template.href(DATA), `${type}/${tone}`).toMatch(/^\/(?!\/)[^\s\\]*$/u);
      }
    }
  });

  it('CA-5 — aucune variante tu ne contient de vouvoiement', () => {
    for (const type of EVENT_NOTIFICATION_TYPES) {
      const template = NOTIFICATION_TEMPLATES[type];
      const title = template.title(DATA, 'tu');
      const body = template.body(DATA, 'tu');
      expect(VOUVOIEMENT.test(title), `${type} titre : ${title}`).toBe(false);
      expect(VOUVOIEMENT.test(body), `${type} texte : ${body}`).toBe(false);
    }
  });

  it('CA-5, BR-ACC-05 — le ton change le texte et le libellé fixe reste au vouvoiement', () => {
    expect(NOTIFICATION_TEMPLATES.course_ready.title({}, 'vous')).toBe('Votre cours est prêt');
    expect(NOTIFICATION_TEMPLATES.course_ready.title({}, 'tu')).toBe('Ton cours est prêt');
    expect(NOTIFICATION_TEMPLATES.course_ready.title({}, 'vous')).not.toBe(
      NOTIFICATION_TEMPLATES.course_ready.title({}, 'tu'),
    );
  });

  it('EF-3 — correspondance type → interrupteur et canaux externes', () => {
    expect(TYPE_PREFERENCE.global_quiz_today).toBe('typeRevision');
    expect(TYPE_PREFERENCE.validation_soon).toBe('typeValidation');
    expect(TYPE_PREFERENCE.module_validated).toBe('typeValidation');
    expect(TYPE_PREFERENCE.course_ready).toBe('typeCourse');
    expect(TYPE_PREFERENCE.new_gap).toBe('typeGap');
    expect(TYPE_PREFERENCE.session_planned).toBe('typePlanning');
    expect(TYPE_PREFERENCE.session_to_reschedule).toBe('typePlanning');
    expect(TYPE_PREFERENCE.planning_adjusted).toBe('typePlanning');
    expect(TYPE_PREFERENCE.relaunch).toBe('typeRelaunch');
    expect(channelsOf('daily_digest')).toEqual(['email']);
    expect(channelsOf('export_ready')).toEqual(['push']);
    expect(channelsOf('validation_soon')).toEqual(['email', 'push']);
  });

  it('ET-2 — un titre ou un texte trop long est tronqué dans les bornes de SPEC-109', () => {
    const long = 'x'.repeat(500);
    for (const type of EVENT_NOTIFICATION_TYPES) {
      const template = NOTIFICATION_TEMPLATES[type];
      expect(
        template.title({ ...DATA, title: long, moduleTitle: long }, 'vous').length,
      ).toBeLessThanOrEqual(120);
      expect(
        template.body({ ...DATA, title: long, moduleTitle: long }, 'tu').length,
      ).toBeLessThanOrEqual(400);
    }
  });
});
