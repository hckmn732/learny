import { describe, expect, it } from 'vitest';

import type { AutomationActionView } from '../moteur-d-automatismes';

import { explainMicroSeance, microCardSummary, microLastActionSummary } from './micro-seance';

const TZ = 'Europe/Paris';

function action(overrides: Partial<AutomationActionView> = {}): AutomationActionView {
  return {
    id: 'action-713',
    automation: 'micro_seance',
    kind: 'micro_session_proposed',
    summary: '',
    formationId: '00000000-0000-4000-8000-000000000713',
    payload: {
      dedupeKey: 'micro:2026-11-11',
      date: '2026-11-11',
      hour: 20,
      durationMin: 5,
      notionCount: 5,
    },
    undoPayload: { slotId: 'slot-713' },
    requiresConsent: false,
    status: 'applied',
    decidedAt: null,
    createdAt: '2026-11-11T19:00:00.000Z',
    ...overrides,
  };
}

describe('[SPEC-713] micro-séance — explications (EF-8, CA-7)', () => {
  it('applied — les deux tons', () => {
    expect(explainMicroSeance(action(), 'vous', TZ)).toBe(
      'Micro-séance de 5 min proposée à 20:00 pour garder votre série.',
    );
    expect(explainMicroSeance(action(), 'tu', TZ)).toBe(
      'Micro-séance de 5 min proposée à 20:00 pour garder ta série.',
    );
  });

  it('consumed — série conservée', () => {
    expect(explainMicroSeance(action({ status: 'consumed' }), 'vous', TZ)).toBe(
      'Micro-séance de 5 min proposée et faite : série conservée.',
    );
  });

  it('expired — non faite', () => {
    expect(explainMicroSeance(action({ status: 'expired' }), 'vous', TZ)).toBe(
      'Micro-séance de 5 min proposée à 20:00, non faite.',
    );
  });

  it('undone — jour local de l’action', () => {
    expect(explainMicroSeance(action({ status: 'undone' }), 'vous', TZ)).toBe(
      'Annulé : micro-séance de 5 min du mercredi.',
    );
  });

  it('la durée réglée apparaît dans les deux textes de la consommation', () => {
    expect(microCardSummary('2026-11-11', 21, 10, 'tu', TZ)).toBe(
      'Mercredi 21:00, micro-séance de 10 min faite : ta série est conservée.',
    );
    expect(microLastActionSummary('2026-11-11', 21, 10, TZ)).toBe(
      'mercredi 21:00, micro-séance de 10 min faite : série conservée.',
    );
  });
});
