// Unit tests of the controlled citation link (SPEC-609 EF-2, ET-1, ET-3, CL-3, BR-COU-02). The
// user client and the signed-URL helper are fakes: these tests pin the deleted label, the signed
// page fragment and the web anchor / media minute.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '@learny/core';
import type { UserDatabase } from '@learny/db';

import { silentLogger, TestClock } from '../../test/support/fakes';
import type { ServiceContext } from '../context';
import type { ResourceDeps } from '../resources/deps';

import { getCitationSource } from './citation-source';

const mocks = vi.hoisted(() => ({
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    text: strings.join('?'),
    values,
  })),
  signed: vi.fn(),
}));

vi.mock('@learny/db', () => ({ sql: mocks.sql }));
vi.mock('../resources/read', () => ({ getSignedReadUrl: mocks.signed }));

const USER = '11111111-1111-4111-8111-111111111111';
const CITATION = '22222222-2222-4222-8222-222222222222';
const RESOURCE = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-11-11T12:20:00Z');

function context(execute: ReturnType<typeof vi.fn>): ServiceContext {
  return {
    userId: USER,
    requestId: 'req-citation',
    db: { run: (flow: (tx: unknown) => Promise<unknown>) => flow({ execute }) } as UserDatabase,
    clock: new TestClock(NOW.toISOString()),
    logger: silentLogger(),
  };
}

const deps = {} as ResourceDeps;

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: CITATION,
    media_kind: 'pdf',
    location: { page: 4 },
    resource_id: RESOURCE,
    resource_kind: 'pdf',
    url: null,
    deleted_at: null,
    status: 'ready',
    storage_path: `${USER}/${RESOURCE}/guide.pdf`,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.signed.mockReset();
});

describe('[SPEC-609] source contrôlée d’une citation', () => {
  it('refuse un identifiant de citation invalide', async () => {
    await expect(getCitationSource(context(vi.fn()), deps, 'pas-un-uuid')).resolves.toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_FAILED' },
    });
  });

  it('rend 404 une citation absente ou étrangère (ET-1)', async () => {
    const execute = vi.fn().mockResolvedValue([]);

    await expect(getCitationSource(context(execute), deps, CITATION)).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND', detail: 'Citation introuvable.' },
    });
  });

  it.each([
    ['sans ressource', { resource_id: null }],
    ['sans type de ressource', { resource_kind: null }],
    ['supprimée', { deleted_at: NOW }],
    ['non prête', { status: 'queued' }],
  ])('rend « source supprimée » pour une ressource %s (ADR-0039)', async (_label, overrides) => {
    const execute = vi.fn().mockResolvedValue([row(overrides)]);

    await expect(getCitationSource(context(execute), deps, CITATION)).resolves.toMatchObject({
      ok: true,
      value: {
        citationId: CITATION,
        deleted: true,
        url: null,
        page: null,
        startSec: null,
        anchor: null,
      },
    });
    expect(mocks.signed).not.toHaveBeenCalled();
  });

  it('signe un PDF avec le fragment de page (ET-3)', async () => {
    const execute = vi.fn().mockResolvedValue([row()]);
    mocks.signed.mockResolvedValue({
      ok: true,
      value: { url: 'https://storage.test/guide.pdf', expiresAt: NOW.toISOString() },
    });

    await expect(getCitationSource(context(execute), deps, CITATION)).resolves.toMatchObject({
      ok: true,
      value: {
        citationId: CITATION,
        mediaKind: 'pdf',
        deleted: false,
        url: 'https://storage.test/guide.pdf#page=4',
        page: 4,
        startSec: null,
        anchor: null,
      },
    });
  });

  it('signe une image sans page et conserve un fragment existant', async () => {
    const execute = vi
      .fn()
      .mockResolvedValue([
        row({ media_kind: 'image', resource_kind: 'image', location: { page: '2' } }),
      ]);
    mocks.signed.mockResolvedValue({
      ok: true,
      value: { url: 'https://storage.test/schema.png#zoom', expiresAt: NOW.toISOString() },
    });

    await expect(getCitationSource(context(execute), deps, CITATION)).resolves.toMatchObject({
      ok: true,
      value: { url: 'https://storage.test/schema.png#zoom', page: 2 },
    });
  });

  it('rend « source supprimée » si le fichier n’est plus signable', async () => {
    const execute = vi.fn().mockResolvedValue([row()]);
    mocks.signed.mockResolvedValue({
      ok: false,
      error: new AppError('NOT_FOUND', 'Aucun fichier.'),
    });

    await expect(getCitationSource(context(execute), deps, CITATION)).resolves.toMatchObject({
      ok: true,
      value: { deleted: true, url: null, page: null },
    });
  });

  it('propage les autres erreurs de signature', async () => {
    const execute = vi.fn().mockResolvedValue([row()]);
    mocks.signed.mockResolvedValue({
      ok: false,
      error: new AppError('SERVICE_UNAVAILABLE', 'Stockage indisponible.'),
    });

    await expect(getCitationSource(context(execute), deps, CITATION)).resolves.toMatchObject({
      ok: false,
      error: { code: 'SERVICE_UNAVAILABLE' },
    });
  });

  it('ajoute l’ancre d’une source web (CL-3)', async () => {
    const execute = vi.fn().mockResolvedValue([
      row({
        media_kind: 'web',
        resource_kind: 'web',
        url: 'https://doc.test/comptabilite',
        location: { anchor: 'cle-40', startSec: 12, page: 4 },
      }),
    ]);

    await expect(getCitationSource(context(execute), deps, CITATION)).resolves.toMatchObject({
      ok: true,
      value: {
        url: 'https://doc.test/comptabilite#cle-40',
        page: null,
        startSec: 12,
        anchor: 'cle-40',
      },
    });
  });

  it('ajoute la minute d’une vidéo et ignore une ancre hors web', async () => {
    const execute = vi.fn().mockResolvedValue([
      row({
        media_kind: 'video',
        resource_kind: 'youtube',
        url: 'https://youtu.be/abc',
        location: { startSec: '42' },
      }),
    ]);

    await expect(getCitationSource(context(execute), deps, CITATION)).resolves.toMatchObject({
      ok: true,
      value: {
        url: 'https://youtu.be/abc#t=42',
        startSec: 42,
        anchor: null,
      },
    });
  });

  it('laisse l’URL nue d’une source web sans ancre ni minute', async () => {
    const execute = vi
      .fn()
      .mockResolvedValue([
        row({ media_kind: 'web', resource_kind: 'web', url: 'https://doc.test/x', location: null }),
      ]);

    await expect(getCitationSource(context(execute), deps, CITATION)).resolves.toMatchObject({
      ok: true,
      value: { url: 'https://doc.test/x', startSec: null, anchor: null },
    });
  });

  it('rend une URL nulle pour une source sans lien', async () => {
    const execute = vi
      .fn()
      .mockResolvedValue([
        row({ media_kind: 'note', resource_kind: 'note', url: null, location: { page: 'x' } }),
      ]);

    await expect(getCitationSource(context(execute), deps, CITATION)).resolves.toMatchObject({
      ok: true,
      value: { url: null, page: null, startSec: null, anchor: null },
    });
  });
});
