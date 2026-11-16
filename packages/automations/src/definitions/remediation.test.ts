import { describe, expect, it } from 'vitest';

import type { AutomationActionView } from '../moteur-d-automatismes';

import { explainRemediation } from './remediation';

const TZ = 'Europe/Paris';
const CREATED_AT = '2026-11-11T12:20:00.000Z';

function action(
  overrides: Partial<AutomationActionView> = {},
  payload: Record<string, unknown> = {},
): AutomationActionView {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    automation: 'remediation',
    kind: 'remediation_ready',
    summary: '',
    formationId: '22222222-2222-4222-8222-222222222222',
    payload: {
      dedupeKey: 'remediation:attempt',
      attemptId: '33333333-3333-4333-8333-333333333333',
      attemptNo: 1,
      moduleId: '44444444-4444-4444-8444-444444444444',
      moduleTitle: 'Comptabilité générale',
      modulePosition: 3,
      score: 58,
      threshold: 80,
      gapNotionIds: [],
      gapLabels: ['Clé de comptabilisation', 'Ledgers parallèles'],
      remediationActivityId: '55555555-5555-4555-8555-555555555555',
      durationMin: 15,
      retryAvailableAt: '2026-11-11T13:00:00.000Z',
      mode: 'advised',
      createdOn: CREATED_AT,
      plan: {
        retry: {
          startsAt: '2026-11-11T13:00:00.000Z',
          endsAt: '2026-11-11T14:00:00.000Z',
          slotId: null,
          created: true,
          previous: null,
          buffer: null,
        },
      },
      ...payload,
    },
    undoPayload: null,
    requiresConsent: false,
    status: 'applied',
    decidedAt: CREATED_AT,
    createdAt: CREATED_AT,
    ...overrides,
  };
}

describe('[SPEC-715] remédiation · explication', () => {
  it('EF-8, CA-7 — le texte appliqué est identique dans les deux tons', () => {
    const expected =
      'Quiz à 58 % : remédiation de 15 min préparée, tentative 2 placée mercredi 14:00.';
    expect(explainRemediation(action(), 'vous', TZ)).toBe(expected);
    expect(explainRemediation(action(), 'tu', TZ)).toBe(expected);
  });

  it('EF-8 — le mode obligatoire ajoute la mention dédiée', () => {
    const text = explainRemediation(action({}, { mode: 'mandatory' }), 'vous', TZ);
    expect(text).toContain('Remédiation obligatoire avant la tentative.');
    expect(text.length).toBeLessThanOrEqual(160);
  });

  it('EF-8, CL-9 — IA indisponible : délai appliqué et explication adaptée', () => {
    const text = explainRemediation(action({}, { remediationActivityId: null }), 'vous', TZ);
    expect(text).toBe(
      'Quiz à 58 % : tentative 2 placée mercredi 14:00. La remédiation sera prête dès que l’IA sera disponible.',
    );
  });

  it('EF-8, CA-5 — l’annulation nomme le module et garde une seule ligne', () => {
    const text = explainRemediation(action({ status: 'undone' }), 'vous', TZ);
    expect(text).toBe('Annulé : délai et remédiation planifiée du quiz du module 3.');
    expect(text).not.toContain('\n');
  });

  it('EF-8 — une action consommée garde le texte appliqué', () => {
    const applied = explainRemediation(action(), 'vous', TZ);
    expect(explainRemediation(action({ status: 'consumed' }), 'vous', TZ)).toBe(applied);
  });

  it('EF-8 — pause globale : les créneaux sont annoncés à la reprise', () => {
    const text = explainRemediation(action({}, { paused: true }), 'vous', TZ);
    expect(text).toContain('tentative 2 placée à la reprise');
    expect(text.length).toBeLessThanOrEqual(160);
  });
});
