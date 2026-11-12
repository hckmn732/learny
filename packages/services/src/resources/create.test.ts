// Unit tests of the two creation flows of the file service (SPEC-206 EF-1, EF-3, ET-4, ET-7):
// declared types, chapter ownership, capacity, idempotency and reservations. The database, Storage
// signatures and the caller's RLS client are fakes; no network and no real row.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { silentLogger, TestClock } from '../../test/support/fakes';

import { createResource } from './create-resource';
import { createUpload } from './create-upload';
import type { ResourceDeps } from './deps';

const mocks = vi.hoisted(() => ({
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    text: strings.join('?'),
    values,
  })),
  userRun: vi.fn(),
  serviceExecute: vi.fn(),
  createUploadUrl: vi.fn(),
  resourcePath: vi.fn((userId: string, resourceId: string, name: string) =>
    [userId, resourceId, name].join('/'),
  ),
  normalize: vi.fn((name: string) => name.trim()),
}));

vi.mock('@learny/db', () => ({
  sql: mocks.sql,
  schema: {},
  SIGNED_URL_TTL_MS: 15 * 60 * 1000,
  createUploadUrl: mocks.createUploadUrl,
  resourcePath: mocks.resourcePath,
  normalizeStorageFileName: mocks.normalize,
  serviceDb: () => ({ execute: mocks.serviceExecute }),
}));

const clock = new TestClock();
const USER = '11111111-1111-4111-8111-111111111111';
const CHAPTER = '22222222-2222-4222-8222-222222222222';
const FORMATION = '33333333-3333-4333-8333-333333333333';

function tx() {
  return { execute: vi.fn() };
}

function deps(): ResourceDeps {
  return {
    gateway: { signRead: vi.fn(), delete: vi.fn() } as never,
    reader: { info: vi.fn(), read: vi.fn() },
    events: { emitUploaded: vi.fn() },
    accessToken: vi.fn((userId: string) => `token:${userId}`),
  };
}

function ctx(database = { run: mocks.userRun }) {
  return {
    userId: USER,
    requestId: 'req-1',
    db: database as never,
    clock,
    logger: silentLogger(),
  };
}

function chapterRow() {
  return [{ id: CHAPTER, formation_id: FORMATION }];
}

beforeEach(() => {
  mocks.userRun.mockReset();
  mocks.serviceExecute.mockReset().mockResolvedValue([]);
  mocks.createUploadUrl.mockReset().mockResolvedValue({
    url: 'https://storage.test/signed',
    expiresAt: new Date('2026-11-11T12:35:00Z'),
  });
  mocks.resourcePath.mockClear();
  mocks.normalize.mockClear();
  clock.set('2026-11-11T12:20:00Z');
});

describe('[SPEC-206] création d’un fichier (EF-1)', () => {
  it('réserve, signe et renvoie l’URL sans la stocker (CL-1, ET-4)', async () => {
    const t = tx();
    t.execute
      .mockResolvedValueOnce([]) // lock
      .mockResolvedValueOnce(chapterRow())
      .mockResolvedValueOnce([]) // idempotency
      .mockResolvedValueOnce([]) // expired reservations
      .mockResolvedValueOnce([{ total: 3 }]) // chapter count
      .mockResolvedValueOnce([{ used: 0 }]) // used bytes
      .mockResolvedValueOnce([]); // insert
    mocks.userRun.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(t));

    const result = await createUpload(ctx(), deps(), CHAPTER, {
      fileName: ' guide final.pdf ',
      title: undefined,
      mime: 'Application/PDF; charset=binary',
      sizeBytes: 1024,
      idempotencyKey: 'key-1',
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        uploadUrl: 'https://storage.test/signed',
        expiresAt: '2026-11-11T12:35:00.000Z',
      },
    });
    expect(mocks.createUploadUrl).toHaveBeenCalled();
    const createCalls = mocks.createUploadUrl.mock.calls as unknown as Array<
      [unknown, unknown, { bucket: string; path: string }]
    >;
    const target = createCalls[0]?.[2];
    expect(target?.bucket).toBe('resources');
    expect(target?.path.startsWith(`${USER}/`)).toBe(true);
    expect(target?.path.endsWith('/ guide final.pdf ')).toBe(true);
    // The insert binds the normalized mime and the reservation window in the metadata.
    const insert = mocks.sql.mock.calls.find((call) =>
      String(call[0]).includes('insert into public.resources'),
    );
    const values = insert?.slice(1) ?? [];
    expect(values).toContain('guide final');
    const metadata = values.find(
      (value): value is string => typeof value === 'string' && value.includes('reservedUntil'),
    );
    expect(JSON.parse(metadata ?? '{}')).toMatchObject({
      upload: {
        declaredMime: 'application/pdf',
        reservedUntil: '2026-11-11T12:35:00.000Z',
        idempotencyKey: 'key-1',
      },
    });
  });

  it('refuse le type et la taille annoncés avant toute réservation (ET-7)', async () => {
    for (const [mime, size, code] of [
      ['video/mp4', 10, 'UNSUPPORTED_TYPE'],
      ['application/pdf', 60 * 1024 * 1024, 'UPLOAD_TOO_LARGE'],
    ] as const) {
      const result = await createUpload(ctx(), deps(), CHAPTER, {
        fileName: 'x.pdf',
        mime,
        sizeBytes: size,
        idempotencyKey: 'k',
      });
      expect(result).toMatchObject({ ok: false, error: { code } });
    }
    expect(mocks.userRun).not.toHaveBeenCalled();
  });

  it('rejoue une requête identique avec une URL fraîche (ET-4)', async () => {
    const existing = {
      id: '44444444-4444-4444-8444-444444444444',
      chapter_id: CHAPTER,
      storage_path: `${USER}/r/guide.pdf`,
      size_bytes: null,
      metadata: {
        upload: { declaredBytes: 1024, declaredMime: 'application/pdf', reservedUntil: 'old' },
      },
    };
    const t = tx();
    t.execute
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(chapterRow())
      .mockResolvedValueOnce([existing])
      .mockResolvedValueOnce([]); // metadata refresh
    mocks.userRun.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(t));
    const result = await createUpload(ctx(), deps(), CHAPTER, {
      fileName: 'guide.pdf',
      mime: 'application/pdf',
      sizeBytes: 1024,
      idempotencyKey: 'key-1',
    });
    expect(result).toMatchObject({
      ok: true,
      value: { resourceId: existing.id, uploadUrl: 'https://storage.test/signed' },
    });
    expect(t.execute).toHaveBeenCalledTimes(4);
    expect(
      mocks.sql.mock.calls.some((call) => String(call[0]).includes('update public.resources')),
    ).toBe(true);
  });

  it('refuse une clé réutilisée pour un autre envoi, ou un envoi déjà finalisé (ET-4)', async () => {
    const base = {
      id: '44444444-4444-4444-8444-444444444444',
      chapter_id: CHAPTER,
      storage_path: `${USER}/r/guide.pdf`,
      size_bytes: null,
      metadata: { upload: { declaredBytes: 10, declaredMime: 'application/pdf' } },
    };
    for (const [existing, code] of [
      [{ ...base, chapter_id: 'other-chapter' }, 'IDEMPOTENCY_KEY_REUSED'],
      [{ ...base, size_bytes: 10 }, 'CONFLICT'],
      [{ ...base, storage_path: null }, 'IDEMPOTENCY_KEY_REUSED'],
    ] as const) {
      const t = tx();
      t.execute
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(chapterRow())
        .mockResolvedValueOnce([existing]);
      mocks.userRun.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(t));
      const result = await createUpload(ctx(), deps(), CHAPTER, {
        fileName: 'guide.pdf',
        mime: 'application/pdf',
        sizeBytes: 10,
        idempotencyKey: 'key-1',
      });
      expect(result).toMatchObject({ ok: false, error: { code } });
    }
  });

  it('refuse un chapitre absent ou appartenant à un autre (EF-6)', async () => {
    for (const [present, code] of [
      [false, 'NOT_FOUND'],
      [true, 'FORBIDDEN'],
    ] as const) {
      const t = tx();
      t.execute.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      mocks.serviceExecute.mockResolvedValue([{ present }]);
      mocks.userRun.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(t));
      const result = await createUpload(ctx(), deps(), CHAPTER, {
        fileName: 'x.pdf',
        mime: 'application/pdf',
        sizeBytes: 10,
        idempotencyKey: 'k',
      });
      expect(result).toMatchObject({ ok: false, error: { code } });
    }
  });

  it('applique la capacité du chapitre et traduit le trigger de quota (CL-3)', async () => {
    const t = tx();
    t.execute
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(chapterRow())
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 100 }])
      .mockResolvedValueOnce([{ used: 0 }]);
    mocks.userRun.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(t));
    const result = await createUpload(ctx(), deps(), CHAPTER, {
      fileName: 'x.pdf',
      mime: 'application/pdf',
      sizeBytes: 10,
      idempotencyKey: 'k',
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'QUOTA_EXCEEDED' } });

    const trigger = tx();
    trigger.execute
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(chapterRow())
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([{ used: 0 }])
      .mockRejectedValueOnce(new Error('chapter_resource_limit'));
    mocks.userRun.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(trigger));
    const refused = await createUpload(ctx(), deps(), CHAPTER, {
      fileName: 'x.pdf',
      mime: 'application/pdf',
      sizeBytes: 10,
      idempotencyKey: 'k',
    });
    expect(refused).toMatchObject({ ok: false, error: { code: 'QUOTA_EXCEEDED' } });
  });

  it('refuse un envoi sans lecteur connecté', async () => {
    const result = await createUpload({ ...ctx(), db: null }, deps(), CHAPTER, {
      fileName: 'x.pdf',
      mime: 'application/pdf',
      sizeBytes: 10,
      idempotencyKey: 'k',
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });
  });
});

describe('[SPEC-206] contribution sans fichier (EF-3)', () => {
  it('crée une note bornée à 100 000 caractères, en statut queued', async () => {
    const t = tx();
    t.execute
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(chapterRow())
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([{ id: 'r-note' }]);
    mocks.userRun.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(t));
    const result = await createResource(ctx(), CHAPTER, {
      kind: 'note',
      title: 'Ma note',
      text: 'Un contenu',
    });
    expect(result).toEqual({
      ok: true,
      value: { id: 'r-note', kind: 'note', status: 'queued', title: 'Ma note' },
    });
  });

  it('accepte une page ou une vidéo YouTube et déduit le titre de l’hôte', async () => {
    for (const body of [
      { kind: 'web' as const, url: 'https://example.test/article' },
      { kind: 'youtube' as const, url: 'https://youtu.be/abcdef' },
    ]) {
      const t = tx();
      t.execute
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(chapterRow())
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([{ id: 'r-link' }]);
      mocks.userRun.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(t));
      const result = await createResource(ctx(), CHAPTER, body);
      expect(result).toMatchObject({ ok: true, value: { id: 'r-link', kind: body.kind } });
    }
  });

  it('refuse une adresse YouTube étrangère et une note trop longue', async () => {
    const youtube = await createResource(ctx(), CHAPTER, {
      kind: 'youtube',
      url: 'https://evil.example/watch?v=1',
    });
    expect(youtube).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
    const note = await createResource(ctx(), CHAPTER, {
      kind: 'note',
      title: 'x',
      text: 'a'.repeat(100_001),
    });
    expect(note).toMatchObject({ ok: false, error: { code: 'UPLOAD_TOO_LARGE' } });
    expect(mocks.userRun).not.toHaveBeenCalled();
  });

  it('refuse un chapitre absent et un chapitre plein', async () => {
    const t = tx();
    t.execute.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    mocks.serviceExecute.mockResolvedValue([{ present: false }]);
    mocks.userRun.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(t));
    await expect(
      createResource(ctx(), CHAPTER, { kind: 'note', title: 'x', text: 'y' }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });

    const full = tx();
    full.execute
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(chapterRow())
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 100 }]);
    mocks.userRun.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(full));
    await expect(
      createResource(ctx(), CHAPTER, { kind: 'note', title: 'x', text: 'y' }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'QUOTA_EXCEEDED' } });
  });

  it('refuse une création sans lecteur connecté', async () => {
    await expect(
      createResource({ ...ctx(), db: null }, CHAPTER, { kind: 'note', title: 'x', text: 'y' }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });
  });
});
