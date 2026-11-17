import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GlobalQuizSessionDtoSchema, type OfflinePackResponse } from '@learny/contracts';

import { listPacks, purgeOfflineDatabase, readMeta } from './db';
import { availablePacks, prefetchPack } from './pack';

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '44444444-4444-4444-8444-444444444444';
const SAP = '22222222-2222-4222-8222-222222222222';
const AGILE = '55555555-5555-4555-8555-555555555555';

function session(formationId: string, day = '2026-11-11') {
  return GlobalQuizSessionDtoSchema.parse({
    sessionId: null,
    attemptId: null,
    formationId,
    forDate: day,
    mode: 'full',
    status: 'empty',
    header: { notionCount: 0, modulesLabel: '', estimatedMinutes: 0, subtitle: '' },
    modeOptions: { fullMinutes: 0, microMinutes: 1 },
    note: '',
    rationale: [],
    tuned: [],
    smoothing: null,
    items: [],
    currentPosition: 0,
    summary: null,
  });
}

function packResponse(
  ownerId: string,
  formations: { id: string; title: string }[],
  localDate = '2026-11-11',
): OfflinePackResponse {
  return {
    ownerId,
    localDate,
    generatedAt: '2026-11-11T12:20:00.000Z',
    expiresAt: '2026-11-12T23:00:00.000Z',
    formations: formations.map((formation) => ({
      formationId: formation.id,
      formationTitle: formation.title,
      session: session(formation.id, localDate),
      extraCards: [],
    })),
  };
}

function fetchOf(body: OfflinePackResponse) {
  return vi.fn(() =>
    Promise.resolve(new Response(JSON.stringify(body), { status: 200 })),
  ) as unknown as typeof fetch;
}

beforeEach(async () => {
  await purgeOfflineDatabase();
});

describe('[SPEC-801] paquet hors ligne', () => {
  it('remplace le paquet au lieu de le fusionner (EF-4)', async () => {
    const first = await prefetchPack({
      fetchImpl: fetchOf(packResponse(OWNER, [{ id: SAP, title: 'SAP' }])),
    });
    expect(first.stored).toBe(true);
    expect((await listPacks()).map((pack) => pack.formationId)).toEqual([SAP]);
    await prefetchPack({
      fetchImpl: fetchOf(packResponse(OWNER, [{ id: AGILE, title: 'Agile' }], '2026-11-12')),
    });
    expect((await listPacks()).map((pack) => pack.formationId)).toEqual([AGILE]);
  });

  it('supprime la base quand un autre utilisateur se connecte (CL-5)', async () => {
    await prefetchPack({ fetchImpl: fetchOf(packResponse(OWNER, [{ id: SAP, title: 'SAP' }])) });
    await prefetchPack({
      fetchImpl: fetchOf(packResponse(OTHER, [{ id: AGILE, title: 'Agile' }])),
    });
    const packs = await listPacks();
    expect(packs.map((pack) => pack.ownerId)).toEqual([OTHER]);
    expect((await readMeta('owner'))?.ownerId).toBe(OTHER);
  });

  it('supprime un paquet expiré (CL-4)', async () => {
    await prefetchPack({ fetchImpl: fetchOf(packResponse(OWNER, [{ id: SAP, title: 'SAP' }])) });
    const after = await availablePacks(new Date('2026-11-13T12:00:00Z'));
    expect(after).toEqual([]);
    expect(await listPacks()).toEqual([]);
  });

  it('abandonne silencieusement quand le quota est dépassé (CL-7)', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.reject(new DOMException('quota', 'QuotaExceededError')),
    ) as unknown as typeof fetch;
    const result = await prefetchPack({ fetchImpl });
    expect(result).toEqual({ stored: false, reason: 'quota' });
  });
});
