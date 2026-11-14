import { describe, expect, it } from 'vitest';

import { buildRationale } from './rationale';

// SPEC-701 EF-7, ET-5 — bullets frozen at the creation of the session (ADR-0180).
const BASE = {
  timeZone: 'Europe/Paris',
  now: new Date('2026-11-11T12:20:00Z'),
  dueCount: 18,
  deferredCount: 4,
  deferredTo: '2026-11-12',
  capMinutes: 15,
  gapItems: [],
  modulePositions: [1],
} as const;

describe('[SPEC-701] rationale', () => {
  it('ET-5 — les trois puces de la démonstration, dans l’ordre', () => {
    const bullets = buildRationale({
      ...BASE,
      gapItems: [
        {
          notionLabel: 'Variante d’exercice',
          gapNature: 'forgetting',
          gapDetectedAt: '2026-11-06T15:42:00Z',
          format: 'recall_card',
        },
      ],
      modulePositions: [1, 2],
    });
    expect(bullets).toEqual([
      {
        label: 'Lacune en priorité',
        text: 'la variante d’exercice, oubliée depuis le 6 nov., revient en carte de rappel.',
      },
      {
        label: 'Charge lissée',
        text: '4 notions sur 18 reportées à jeudi, pour rester sous 15 min par jour.',
      },
      {
        label: 'Modules mêlés',
        text: 'retrouver la bonne notion parmi d’autres la fixe mieux.',
      },
    ]);
  });

  it('ET-5 — une puce de report seule', () => {
    expect(buildRationale({ ...BASE, deferredCount: 1, deferredTo: '2026-11-12' })).toEqual([
      {
        label: 'Charge lissée',
        text: '1 notion sur 18 reportée à jeudi, pour rester sous 15 min par jour.',
      },
    ]);
  });

  it('ET-5 — une puce de modules seuls', () => {
    expect(
      buildRationale({ ...BASE, dueCount: 3, deferredCount: 0, modulePositions: [1, 2] }),
    ).toEqual([
      {
        label: 'Modules mêlés',
        text: 'retrouver la bonne notion parmi d’autres la fixe mieux.',
      },
    ]);
  });

  it('ET-5 — aucune puce quand rien ne s’applique', () => {
    expect(
      buildRationale({ ...BASE, dueCount: 3, deferredCount: 0, modulePositions: [1] }),
    ).toEqual([]);
  });

  it('ET-5 — une lacune sans date de détection ne produit pas de puce', () => {
    expect(
      buildRationale({
        ...BASE,
        dueCount: 3,
        deferredCount: 0,
        gapItems: [
          {
            notionLabel: 'Variante d’exercice',
            gapNature: 'forgetting',
            gapDetectedAt: null,
            format: 'recall_card',
          },
        ],
      }),
    ).toEqual([]);
  });
});
