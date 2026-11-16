import { describe, expect, it } from 'vitest';

import type { AutomationActionView } from '../moteur-d-automatismes';

import { explainJeuLacune } from './jeu-lacune';

const TZ = 'Europe/Paris';
const CREATED_AT = '2026-11-11T12:20:00.000Z';

function action(
  overrides: Partial<AutomationActionView> = {},
  payload: Record<string, unknown> = {},
): AutomationActionView {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    automation: 'jeu_lacune',
    kind: 'game_chosen',
    summary: '',
    formationId: '22222222-2222-4222-8222-222222222222',
    payload: {
      dedupeKey: 'game:notion:2026-11-06T08:00:00.000Z',
      notionId: '33333333-3333-4333-8333-333333333333',
      notionLabel: 'Variante d’exercice',
      nature: 'forgetting',
      confusedWithId: null,
      confusedWithLabel: null,
      format: 'recall_card',
      brickId: null,
      pendingGeneration: false,
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

describe('[SPEC-716] jeu choisi selon la lacune · explications', () => {
  it('EF-9 — oubli, identique dans les deux tons', () => {
    const expected = 'Lacune « Variante d’exercice » : carte de rappel ajoutée au quiz global.';
    expect(explainJeuLacune(action(), 'vous', TZ)).toBe(expected);
    expect(explainJeuLacune(action(), 'tu', TZ)).toBe(expected);
  });

  it('EF-9 — confusion, association et classement', () => {
    expect(
      explainJeuLacune(
        action(
          {},
          {
            nature: 'confusion',
            notionLabel: 'Variante d’exercice',
            confusedWithLabel: 'Exercice comptable',
            format: 'matching',
          },
        ),
        'vous',
        TZ,
      ),
    ).toBe(
      'Lacune « Variante d’exercice » : association « Variante d’exercice / Exercice comptable » ajouté au quiz global.',
    );
    expect(
      explainJeuLacune(action({}, { nature: 'confusion', format: 'categorization' }), 'vous', TZ),
    ).toContain('classement');
  });

  it('EF-9 — génération en attente, expiration et annulation', () => {
    expect(explainJeuLacune(action({}, { pendingGeneration: true }), 'vous', TZ)).toContain(
      '(en préparation)',
    );
    expect(explainJeuLacune(action({ status: 'expired' }), 'vous', TZ)).toBe(
      'Lacune « Variante d’exercice » levée avant l’entraînement.',
    );
    expect(explainJeuLacune(action({ status: 'undone' }), 'vous', TZ)).toContain('Annulé :');
  });

  it('EF-9 — exercice planifié et annulé', () => {
    const exercise = action(
      { kind: 'exercise_scheduled' },
      {
        nature: 'application',
        notionLabel: 'Équilibre d’une pièce',
        startsAt: '2026-11-12T08:00:00.000Z',
        slotId: '44444444-4444-4444-8444-444444444444',
      },
    );
    expect(explainJeuLacune(exercise, 'vous', TZ)).toBe(
      'Lacune « Équilibre d’une pièce » : exercice pratique placé jeudi 9:00.',
    );
    expect(explainJeuLacune({ ...exercise, status: 'undone' }, 'vous', TZ)).toBe(
      'Annulé : exercice pratique de « Équilibre d’une pièce ».',
    );
  });

  it('ET-3 — une ligne, 160 caractères au plus', () => {
    const long = action(
      {},
      {
        nature: 'confusion',
        notionLabel: 'Une notion au libellé particulièrement long pour la journalisation',
        confusedWithLabel: 'Une autre notion tout aussi longue que la première',
        format: 'categorization',
      },
    );
    for (const status of ['applied', 'consumed', 'expired', 'undone'] as const) {
      const text = explainJeuLacune({ ...long, status }, 'vous', TZ);
      expect(text.length).toBeLessThanOrEqual(160);
      expect(text).not.toContain('\n');
    }
  });
});
