import { describe, expect, it } from 'vitest';

import type { AutomationActionView } from '../moteur-d-automatismes';

import { explainReprise } from './reprise';

const TZ = 'Europe/Paris';
const CREATED_AT = '2026-11-11T12:20:00.000Z';

function action(overrides: Partial<AutomationActionView> = {}): AutomationActionView {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    automation: 'reprise',
    kind: 'reprise_proposed',
    summary: '',
    formationId: '22222222-2222-4222-8222-222222222222',
    payload: {
      title: 'Ledgers parallèles',
      missedDate: '2026-11-10',
      proposed: {
        startsAt: '2026-11-12T10:30:00+01:00',
        endsAt: '2026-11-12T12:00:00+01:00',
        bufferSlotId: '33333333-3333-4333-8333-333333333333',
        inBuffer: true,
      },
      alternatives: [],
    },
    undoPayload: null,
    requiresConsent: true,
    status: 'pending_consent',
    decidedAt: null,
    createdAt: CREATED_AT,
    ...overrides,
  };
}

describe('[SPEC-712] reprise · explication d’une ligne', () => {
  it('EF-8, CA-8 — proposition de créneau dans une marge, deux tons', () => {
    expect(explainReprise(action(), 'vous', TZ)).toBe(
      '« Ledgers parallèles » n’a pas été terminé mardi. Je propose de le reprendre jeudi à 10:30, dans une marge de votre agenda.',
    );
    expect(explainReprise(action(), 'tu', TZ)).toBe(
      '« Ledgers parallèles » n’a pas été terminé mardi. Je propose de le reprendre jeudi à 10:30, dans une marge de ton agenda.',
    );
  });

  it('EF-8 — sans marge, le texte parle d’un créneau libre', () => {
    const free = action({
      payload: {
        ...action().payload,
        proposed: {
          startsAt: '2026-11-12T10:30:00+01:00',
          endsAt: '2026-11-12T11:30:00+01:00',
          bufferSlotId: null,
          inBuffer: false,
        },
      },
    });
    expect(explainReprise(free, 'vous', TZ)).toContain('dans un créneau libre de votre agenda');
    expect(explainReprise(free, 'tu', TZ)).toContain('dans un créneau libre de ton agenda');
  });

  it('EF-8, CA-2 — une reprise appliquée est notée dans l’agenda', () => {
    const applied = action({ status: 'applied' });
    expect(explainReprise(applied, 'vous', TZ)).toBe(
      'C’est noté : reprise de « Ledgers parallèles » jeudi 10:30. Elle est dans votre agenda.',
    );
    expect(explainReprise(applied, 'tu', TZ)).toBe(
      'C’est noté : reprise de « Ledgers parallèles » jeudi 10:30. Elle est dans ton agenda.',
    );
    const auto = action({ kind: 'slot_rescheduled', status: 'applied' });
    expect(explainReprise(auto, 'vous', TZ)).toBe(
      'C’est noté : reprise de « Ledgers parallèles » jeudi 10:30. Elle est dans votre agenda.',
    );
  });

  it('EF-8 — reprise de 5 minutes, deux tons', () => {
    const short = action({
      kind: 'reprise_short_proposed',
      payload: {
        inactiveDays: 2,
        proposed: {
          startsAt: '2026-11-12T09:00:00+01:00',
          endsAt: '2026-11-12T09:05:00+01:00',
        },
      },
    });
    expect(explainReprise(short, 'vous', TZ)).toBe(
      'Vous n’avez pas étudié depuis 2 jours. Je propose une reprise de 5 minutes jeudi à 9:00.',
    );
    expect(explainReprise(short, 'tu', TZ)).toBe(
      'Tu n’as pas étudié depuis 2 jours. Je te propose une reprise de 5 minutes jeudi à 9:00.',
    );
  });

  it('EF-8 — alléger ou décaler, avec la variante « plus de place »', () => {
    const plan = action({
      kind: 'plan_change_proposed',
      payload: {
        formationTitle: 'SAP S/4HANA Finance',
        inactiveDays: 5,
        reason: 'inactivity',
        options: [],
      },
    });
    expect(explainReprise(plan, 'vous', TZ)).toBe(
      '5 jours sans étude sur « SAP S/4HANA Finance » : je propose d’alléger le programme ou de décaler la fin.',
    );
    const noRoom = action({
      kind: 'plan_change_proposed',
      payload: { title: 'Ledgers parallèles', reason: 'no_room', inactiveDays: 2, options: [] },
    });
    expect(explainReprise(noRoom, 'vous', TZ)).toBe(
      'Plus de place pour reprendre « Ledgers parallèles » cette semaine : je propose d’alléger le programme ou de décaler la fin.',
    );
  });

  it('EF-8 — les statuts finaux préfixent la ligne', () => {
    expect(explainReprise(action({ status: 'declined' }), 'vous', TZ)).toMatch(/^Refusé : /);
    expect(explainReprise(action({ status: 'expired' }), 'vous', TZ)).toMatch(/^Expiré : /);
    expect(explainReprise(action({ status: 'undone' }), 'vous', TZ)).toMatch(/^Annulé : /);
  });

  it('ET-3 — une ligne, 160 caractères au plus, même avec un titre long', () => {
    const long = action({
      payload: {
        ...action().payload,
        title: 'Un titre de séance particulièrement long qui dépasse largement la limite',
      },
    });
    for (const status of ['pending_consent', 'applied', 'declined', 'expired', 'undone'] as const) {
      const text = explainReprise(action({ ...long, status }), 'vous', TZ);
      expect(text.length).toBeLessThanOrEqual(160);
      expect(text).not.toContain('\n');
    }
  });
});
