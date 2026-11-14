import { describe, expect, it } from 'vitest';

import type { AutomationActionView } from '../moteur-d-automatismes';

import { explainEchauffement, explainWarmupLastAction } from './echauffement';

const TZ = 'Europe/Paris';
const CREATED_AT = '2026-11-11T12:20:00.000Z';
const PAYLOAD = {
  dedupeKey: 'warmup:2026-11-11:formation',
  date: '2026-11-11',
  activityId: '11111111-1111-4111-8111-111111111111',
  slotId: '22222222-2222-4222-8222-222222222222',
  formationId: '33333333-3333-4333-8333-333333333333',
  formationTitle: 'SAP S/4HANA Finance',
  count: 3,
  scope: 'yesterday_prerequisites',
  notionIds: [],
  notionLabels: ['Clé de comptabilisation', 'Date comptable', 'Plan comptable'],
  reviewNotionIds: [],
  nextSession: {
    slotId: '44444444-4444-4444-8444-444444444444',
    kind: 'validation_quiz',
    startsAt: '2026-11-11T14:00:00+01:00',
    moduleId: '55555555-5555-4555-8555-555555555555',
    activityId: null,
  },
};

function action(overrides: Partial<AutomationActionView> = {}): AutomationActionView {
  return {
    id: '66666666-6666-4666-8666-666666666666',
    automation: 'echauffement',
    kind: 'warmup_added',
    summary: '',
    formationId: '33333333-3333-4333-8333-333333333333',
    payload: PAYLOAD,
    undoPayload: null,
    requiresConsent: false,
    status: 'applied',
    decidedAt: null,
    createdAt: CREATED_AT,
    ...overrides,
  };
}

describe('[SPEC-714] échauffement · explication d’une ligne', () => {
  it('EF-10 — action appliquée, deux tons', () => {
    expect(explainEchauffement(action(), 'vous', TZ)).toBe(
      'Échauffement ajouté avant votre quiz de 14:00 : 3 questions sur Clé de comptabilisation, Date comptable, Plan comptable.',
    );
    expect(explainEchauffement(action(), 'tu', TZ)).toBe(
      'Échauffement ajouté avant ton quiz de 14:00 : 3 questions sur Clé de comptabilisation, Date comptable, Plan comptable.',
    );
  });

  it('EF-10, CL-8 — action consommée avec une notion à revoir', () => {
    const consumed = action({
      status: 'consumed',
      payload: {
        ...PAYLOAD,
        knewCount: 2,
        reviewNotionIds: ['77777777-7777-4777-8777-777777777777'],
        reviewNotionLabels: ['Plan comptable'],
        reviewRemaining: false,
      },
    });
    expect(explainEchauffement(consumed, 'vous', TZ)).toBe(
      'Échauffement fait : 2 sur 3 ; 1 notion repasse dans le quiz global du soir.',
    );
    const later = action({
      status: 'consumed',
      payload: {
        ...PAYLOAD,
        knewCount: 2,
        reviewNotionLabels: ['Plan comptable'],
        reviewRemaining: true,
      },
    });
    expect(explainEchauffement(later, 'vous', TZ)).toContain('dans le prochain quiz global.');
  });

  it('EF-10 — expiration et annulation', () => {
    expect(explainEchauffement(action({ status: 'expired' }), 'vous', TZ)).toBe(
      'Échauffement du mercredi 11 novembre non fait.',
    );
    expect(explainEchauffement(action({ status: 'undone' }), 'vous', TZ)).toBe(
      'Annulé : échauffement du mercredi 11 novembre.',
    );
  });

  it('EF-10 (SPEC-710) — dernière action : ce matin, cet après-midi, hier', () => {
    const at = '2026-11-11T12:20:00.000Z';
    expect(
      explainWarmupLastAction(action({ createdAt: '2026-11-11T06:05:00.000Z' }), 'vous', TZ, at),
    ).toBe('ce matin, 3 questions : Clé de comptabilisation, Date comptable, Plan comptable.');
    expect(
      explainWarmupLastAction(action({ createdAt: '2026-11-11T15:00:00.000Z' }), 'vous', TZ, at),
    ).toContain('cet après-midi');
    expect(
      explainWarmupLastAction(action({ createdAt: '2026-11-10T17:00:00.000Z' }), 'vous', TZ, at),
    ).toContain('hier');
  });

  it('ET-3 — une ligne, 160 caractères au plus', () => {
    const long = action({
      payload: {
        ...PAYLOAD,
        notionLabels: Array.from(
          { length: 5 },
          () => 'Une notion au libellé particulièrement long',
        ),
      },
    });
    for (const status of ['applied', 'consumed', 'expired', 'undone'] as const) {
      const text = explainEchauffement(action({ ...long, status }), 'vous', TZ);
      expect(text.length).toBeLessThanOrEqual(160);
      expect(text).not.toContain('\n');
    }
  });
});
