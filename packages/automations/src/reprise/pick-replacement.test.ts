import { describe, expect, it } from 'vitest';

import { pickReplacement } from './pick-replacement';

const TZ = 'Europe/Paris';
const NOW = '2026-11-11T12:20:00Z';

const free = (startsAt: string, minutes = 60) => ({
  startsAt,
  endsAt: new Date(new Date(startsAt).getTime() + minutes * 60_000).toISOString(),
});

describe('[SPEC-712] reprise · choix de l’emplacement', () => {
  it('ADR-0192 §4 — la première marge à plus d’une heure devient la proposition', () => {
    const placement = pickReplacement({
      buffers: [
        {
          id: 'trop-tot',
          startsAt: '2026-11-11T13:00:00+01:00',
          endsAt: '2026-11-11T14:00:00+01:00',
        },
        { id: 'marge', startsAt: '2026-11-12T10:30:00+01:00', endsAt: '2026-11-12T12:00:00+01:00' },
      ],
      freeSlots: [
        free('2026-11-12T15:00:00+01:00'),
        free('2026-11-13T15:00:00+01:00'),
        free('2026-11-16T09:00:00+01:00'),
      ],
      durationMin: 90,
      now: NOW,
      timeZone: TZ,
    });
    expect(placement).not.toBeNull();
    expect(placement?.proposed).toEqual({
      startsAt: new Date('2026-11-12T10:30:00+01:00').toISOString(),
      endsAt: new Date('2026-11-12T12:00:00+01:00').toISOString(),
      bufferSlotId: 'marge',
      inBuffer: true,
    });
    expect(placement?.alternatives).toHaveLength(3);
    expect(placement?.alternatives.map((entry) => entry.startsAt)).toEqual([
      new Date('2026-11-12T15:00:00+01:00').toISOString(),
      new Date('2026-11-13T15:00:00+01:00').toISOString(),
      new Date('2026-11-16T09:00:00+01:00').toISOString(),
    ]);
  });

  it('ADR-0192 §4 — une marge plus courte raccourcit la reprise', () => {
    const placement = pickReplacement({
      buffers: [
        {
          id: 'courte',
          startsAt: '2026-11-12T10:30:00+01:00',
          endsAt: '2026-11-12T10:45:00+01:00',
        },
      ],
      freeSlots: [],
      durationMin: 90,
      now: NOW,
      timeZone: TZ,
    });
    expect(placement?.proposed.endsAt).toBe(new Date('2026-11-12T10:45:00+01:00').toISOString());
  });

  it('ADR-0192 §4 — sans marge, le premier créneau libre du planificateur est retenu', () => {
    const placement = pickReplacement({
      buffers: [],
      freeSlots: [free('2026-11-12T15:00:00+01:00', 30)],
      durationMin: 60,
      now: NOW,
      timeZone: TZ,
    });
    expect(placement?.proposed).toEqual({
      startsAt: new Date('2026-11-12T15:00:00+01:00').toISOString(),
      endsAt: new Date('2026-11-12T15:30:00+01:00').toISOString(),
      bufferSlotId: null,
      inBuffer: false,
    });
  });

  it('ADR-0192 §4 — les alternatives se répartissent sur au moins deux jours', () => {
    const placement = pickReplacement({
      buffers: [
        { id: 'marge', startsAt: '2026-11-12T10:30:00+01:00', endsAt: '2026-11-12T12:00:00+01:00' },
      ],
      freeSlots: [
        free('2026-11-12T13:00:00+01:00'),
        free('2026-11-12T15:00:00+01:00'),
        free('2026-11-13T15:00:00+01:00'),
        free('2026-11-16T09:00:00+01:00'),
      ],
      durationMin: 60,
      now: NOW,
      timeZone: TZ,
    });
    const days = new Set(
      (placement?.alternatives ?? []).map((entry) =>
        new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(entry.startsAt)),
      ),
    );
    expect(days.size).toBeGreaterThanOrEqual(2);
    expect(placement?.alternatives).toHaveLength(3);
  });

  it('ADR-0192 §4 — aucune marge ni créneau libre : aucun emplacement', () => {
    expect(
      pickReplacement({ buffers: [], freeSlots: [], durationMin: 60, now: NOW, timeZone: TZ }),
    ).toBeNull();
    expect(
      pickReplacement({
        buffers: [
          {
            id: 'trop-loin',
            startsAt: '2026-11-30T10:00:00+01:00',
            endsAt: '2026-11-30T11:00:00+01:00',
          },
        ],
        freeSlots: [],
        durationMin: 60,
        now: NOW,
        timeZone: TZ,
      }),
    ).toBeNull();
  });
});
