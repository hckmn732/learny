// Vitest [SPEC-3305] — paquet hors ligne (EF-7, ET-4, CL-2).
import { describe, expect, it } from 'vitest';

import type { GlobalQuizSessionDto, OfflinePackResponse } from '@learny/contracts';

import type { KeyValueStore } from '../auth/secure-storage';

import {
  isPackPlayable,
  OFFLINE_PACK_KEY,
  parsePack,
  readPack,
  storedPack,
  writePack,
  packSessionOf,
  clearPack,
} from './pack';

function memoryStore(): KeyValueStore & { readonly values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

const session = { status: 'in_progress' } as GlobalQuizSessionDto;

function pack(
  localDate = '2026-11-11',
  expiresAt = '2026-11-12T06:00:00.000Z',
): OfflinePackResponse {
  return {
    ownerId: '00000000-0000-4000-8000-000000000001',
    localDate,
    generatedAt: '2026-11-11T06:00:00.000Z',
    expiresAt,
    formations: [
      {
        formationId: '00000000-0000-4000-8000-000000000002',
        formationTitle: 'SAP S/4HANA Finance',
        session,
        extraCards: [],
      },
    ],
  };
}

describe('[SPEC-3305] paquet hors ligne (EF-7, CL-2)', () => {
  it('se stocke et se relit dans le magasin chiffré (ET-4)', async () => {
    const store = memoryStore();
    const stored = storedPack(pack(), '2026-11-11T08:00:00.000Z');
    await writePack(store, stored);
    expect(store.values.has(OFFLINE_PACK_KEY)).toBe(true);
    await expect(readPack(store)).resolves.toEqual(stored);
  });

  it('ignore un paquet illisible ou d’un autre schéma', () => {
    expect(parsePack(null)).toBeNull();
    expect(parsePack('pas du json')).toBeNull();
    expect(parsePack(JSON.stringify({ version: 99 }))).toBeNull();
    expect(parsePack(JSON.stringify({ version: 1, day: '2026-11-11' }))).toBeNull();
  });

  it('refuse le paquet de la veille et le paquet expiré (CL-2)', () => {
    const stored = storedPack(pack(), '2026-11-11T08:00:00.000Z');
    const now = new Date('2026-11-11T12:20:00.000Z');
    expect(isPackPlayable(stored, '2026-11-11', now)).toBe(true);
    expect(isPackPlayable(stored, '2026-11-12', now)).toBe(false);
    expect(isPackPlayable(stored, '2026-11-11', new Date('2026-11-13T12:00:00.000Z'))).toBe(false);
    expect(isPackPlayable(null, '2026-11-11', now)).toBe(false);
  });

  it('retrouve la session d’une formation dans le paquet (EF-7)', () => {
    const stored = storedPack(pack(), '2026-11-11T08:00:00.000Z');
    expect(packSessionOf(stored, '00000000-0000-4000-8000-000000000002')?.formationTitle).toBe(
      'SAP S/4HANA Finance',
    );
    expect(packSessionOf(stored, '00000000-0000-4000-8000-000000000009')).toBeNull();
  });

  it('efface le paquet à la déconnexion (EF-6)', async () => {
    const store = memoryStore();
    await writePack(store, storedPack(pack(), '2026-11-11T08:00:00.000Z'));
    await clearPack(store);
    await expect(readPack(store)).resolves.toBeNull();
  });
});
