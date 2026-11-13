// Unit tests of the file life cycle (SPEC-206 EF-2, EF-4, EF-5, ET-5, ET-6): finalization from the
// real bytes, signed read URL, soft deletion with deferred blob cleanup and the single
// `resource/uploaded` emission. Storage, the database and the event sink are fakes.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { silentLogger, TestClock } from '../../test/support/fakes';
import { buildImage, buildPdf } from '../../test/support/files';

import { deleteResource, purgeDeletedBlobs } from './delete';
import type { ResourceDeps } from './deps';
import { finalizeUpload } from './finalize';
import type { ResourceRow } from './queries';
import { getSignedReadUrl } from './read';
import { ensureUploadedEvent } from './uploaded-event';

const mocks = vi.hoisted(() => ({
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    text: strings.join('?'),
    values,
  })),
  userRun: vi.fn(),
  serviceExecute: vi.fn(),
  serviceTransaction: vi.fn(),
  createReadUrl: vi.fn(),
  deleteStoredObject: vi.fn(),
}));

vi.mock('@learny/db', () => ({
  sql: mocks.sql,
  schema: {},
  createReadUrl: mocks.createReadUrl,
  deleteStoredObject: mocks.deleteStoredObject,
  serviceDb: () => ({
    execute: mocks.serviceExecute,
    transaction: mocks.serviceTransaction,
  }),
}));

const clock = new TestClock();
const USER = '11111111-1111-4111-8111-111111111111';
const RID = '44444444-4444-4444-8444-444444444444';
const CH = '22222222-2222-4222-8222-222222222222';
const FID = '33333333-3333-4333-8333-333333333333';
const PDF = buildPdf({ pages: 2 });
const IMAGE = buildImage('png');

function tx() {
  return { execute: vi.fn() };
}

function deps(overrides: Partial<ResourceDeps> = {}): ResourceDeps {
  return {
    gateway: { signRead: vi.fn(), delete: vi.fn() } as never,
    reader: {
      info: vi.fn().mockResolvedValue({ size: PDF.length, etag: '"etag-1"' }),
      read: vi.fn().mockResolvedValue({ bytes: PDF, etag: '"etag-1"' }),
    },
    events: { emitUploaded: vi.fn().mockResolvedValue(undefined) },
    accessToken: vi.fn((userId: string) => `token:${userId}`),
    ...overrides,
  };
}

function ctx(database = { run: mocks.userRun }, logger = silentLogger()) {
  return { userId: USER, requestId: 'req-1', db: database as never, clock, logger };
}

function row(overrides: Partial<ResourceRow> = {}): ResourceRow {
  return {
    id: RID,
    owner_id: USER,
    formation_id: FID,
    chapter_id: CH,
    kind: 'pdf',
    title: 'Guide',
    storage_path: `${USER}/${RID}/guide.pdf`,
    mime: null,
    size_bytes: null,
    status: 'queued',
    metadata: { upload: { declaredBytes: PDF.length } },
    deleted_at: null,
    updated_at: new Date('2026-11-11T12:20:00Z'),
    ...overrides,
  };
}

beforeEach(() => {
  mocks.userRun.mockReset();
  mocks.serviceExecute.mockReset().mockResolvedValue([]);
  mocks.serviceTransaction.mockReset();
  mocks.createReadUrl.mockReset().mockResolvedValue({
    url: 'https://storage.test/read',
    expiresAt: new Date('2026-11-11T12:30:00Z'),
  });
  mocks.deleteStoredObject.mockReset().mockResolvedValue(undefined);
  clock.set('2026-11-11T12:20:00Z');
});

function runWith(t: ReturnType<typeof tx>): void {
  mocks.userRun.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(t));
}

describe('[SPEC-206] finalisation d’un fichier (EF-2)', () => {
  it('mesure les octets réels, enregistre mime, taille et empreinte puis émet une fois', async () => {
    const t = tx();
    t.execute
      .mockResolvedValueOnce([row()]) // initial read
      .mockResolvedValueOnce([]) // lock owner
      .mockResolvedValueOnce([row()]) // row locked
      .mockResolvedValueOnce([]) // expired reservations
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([{ used: 0 }])
      .mockResolvedValueOnce([
        row({
          mime: 'application/pdf',
          size_bytes: PDF.length,
          status: 'ready',
          metadata: {
            pages: 2,
            upload: {
              declaredBytes: PDF.length,
              finalizedAt: '2026-11-11T12:20:00.000Z',
              sha256: 'sha',
              etag: '"etag-1"',
            },
          },
        }),
      ])
      .mockResolvedValueOnce([{ id: RID }]); // event claim
    runWith(t);
    const d = deps();
    const result = await finalizeUpload(ctx(), d, RID);
    expect(result).toMatchObject({
      ok: true,
      value: {
        id: RID,
        kind: 'pdf',
        status: 'ready',
        mime: 'application/pdf',
        sizeBytes: PDF.length,
        pages: 2,
      },
    });
    // eslint-disable-next-line @typescript-eslint/unbound-method -- fake observed without its receiver
    expect(d.reader.read).toHaveBeenCalledWith(
      'resources',
      row().storage_path,
      `token:${USER}`,
      50 * 1024 * 1024,
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method -- fake observed without its receiver
    expect(d.events.emitUploaded).toHaveBeenCalledWith(
      { userId: USER, resourceId: RID, formationId: FID, chapterId: CH, kind: 'pdf' },
      { id: `resource-uploaded:${RID}` },
    );
    const update = mocks.sql.mock.calls.find((call) => String(call[0]).includes('set mime ='));
    expect(update?.slice(1)).toEqual(expect.arrayContaining(['application/pdf', PDF.length]));
  });

  it('est idempotente quand l’objet n’a pas changé, et refuse un objet remplacé (ET-5)', async () => {
    const finalized = row({
      size_bytes: PDF.length,
      mime: 'application/pdf',
      kind: 'pdf',
      metadata: { upload: { declaredBytes: PDF.length, etag: '"etag-1"' } },
    });
    const t = tx();
    t.execute.mockResolvedValueOnce([finalized]).mockResolvedValueOnce([]);
    runWith(t);
    const d = deps();
    await expect(finalizeUpload(ctx(), d, RID)).resolves.toMatchObject({
      ok: true,
      value: { id: RID, sizeBytes: PDF.length },
    });
    // eslint-disable-next-line @typescript-eslint/unbound-method -- fake observed without its receiver
    expect(d.reader.read).not.toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/unbound-method -- fake observed without its receiver
    expect(d.events.emitUploaded).not.toHaveBeenCalled();

    const changed = deps();
    changed.reader.info = vi.fn().mockResolvedValue({ size: PDF.length + 1, etag: '"other"' });
    const t2 = tx();
    t2.execute.mockResolvedValueOnce([finalized]);
    runWith(t2);
    await expect(finalizeUpload(ctx(), changed, RID)).resolves.toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
  });

  it('refuse un apport introuvable, supprimé, sans fichier ou d’un autre type (EF-6)', async () => {
    const cases: Array<[ResourceRow | null, boolean, string]> = [
      [null, false, 'NOT_FOUND'],
      [null, true, 'FORBIDDEN'],
      [row({ deleted_at: new Date('2026-11-11T12:20:00Z') }), false, 'NOT_FOUND'],
      [row({ kind: 'note' }), false, 'CONFLICT'],
      [row({ storage_path: null }), false, 'CONFLICT'],
      [row({ metadata: {} }), false, 'CONFLICT'],
    ];
    for (const [value, present, code] of cases) {
      const t = tx();
      t.execute.mockResolvedValueOnce(value === null ? [] : [value]);
      runWith(t);
      mocks.serviceExecute.mockResolvedValue([{ present }]);
      const result = await finalizeUpload(ctx(), deps(), RID);
      expect(result).toMatchObject({ ok: false, error: { code } });
    }
  });

  it('refuse un objet absent, vide, tronqué ou modifié pendant la lecture (CL-6)', async () => {
    for (const [info, read, code] of [
      [null, null, 'UPLOAD_INCOMPLETE'],
      [{ size: 0, etag: '"e"' }, null, 'UPLOAD_INCOMPLETE'],
      [{ size: 5, etag: '"e"' }, null, 'UPLOAD_INCOMPLETE'],
      [{ size: PDF.length, etag: '"e"' }, null, 'UPLOAD_INCOMPLETE'],
      [{ size: PDF.length, etag: '"e"' }, { bytes: PDF.slice(0, -1), etag: '"e"' }, 'CONFLICT'],
    ] as const) {
      const t = tx();
      t.execute.mockResolvedValueOnce([row()]);
      runWith(t);
      const d = deps();
      d.reader.info = vi.fn().mockResolvedValue(info);
      d.reader.read = vi.fn().mockResolvedValue(read);
      const result = await finalizeUpload(ctx(), d, RID);
      expect(result).toMatchObject({ ok: false, error: { code } });
    }
  });

  it('écarte un fichier trop gros ou d’un type refusé et libère son emplacement (ET-6)', async () => {
    const tooLarge = tx();
    tooLarge.execute.mockResolvedValueOnce([row()]).mockResolvedValueOnce([]);
    runWith(tooLarge);
    const large = deps();
    large.reader.info = vi.fn().mockResolvedValue({ size: 60 * 1024 * 1024, etag: '"e"' });
    await expect(finalizeUpload(ctx(), large, RID)).resolves.toMatchObject({
      ok: false,
      error: { code: 'UPLOAD_TOO_LARGE' },
    });
    expect(mocks.deleteStoredObject).toHaveBeenCalled();

    const text = new TextEncoder().encode('pas une image');
    const hostile = tx();
    hostile.execute
      .mockResolvedValueOnce([
        row({ kind: 'image', metadata: { upload: { declaredBytes: text.length } } }),
      ])
      .mockResolvedValueOnce([]);
    runWith(hostile);
    const invalid = deps();
    invalid.reader.read = vi.fn().mockResolvedValue({ bytes: text, etag: '"e"' });
    invalid.reader.info = vi.fn().mockResolvedValue({ size: text.length, etag: '"e"' });
    await expect(finalizeUpload(ctx(), invalid, RID)).resolves.toMatchObject({
      ok: false,
      error: { code: 'UNSUPPORTED_TYPE' },
    });
  });

  it('accepte une image et retient la seconde finalisation concurrente (CL-4)', async () => {
    const image = row({
      kind: 'image',
      metadata: { upload: { declaredBytes: IMAGE.length } },
    });
    const finalized = row({
      kind: 'image',
      size_bytes: IMAGE.length,
      mime: 'image/png',
      metadata: { upload: { declaredBytes: IMAGE.length, etag: '"etag-1"' } },
    });
    const t = tx();
    t.execute
      .mockResolvedValueOnce([image])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([finalized])
      .mockResolvedValueOnce([]);
    runWith(t);
    const d = deps();
    d.reader.info = vi.fn().mockResolvedValue({ size: IMAGE.length, etag: '"etag-1"' });
    d.reader.read = vi.fn().mockResolvedValue({ bytes: IMAGE, etag: '"etag-1"' });
    await expect(finalizeUpload(ctx(), d, RID)).resolves.toMatchObject({
      ok: true,
      value: { kind: 'image', mime: 'image/png' },
    });
    // No update: the row was already finalized by the concurrent call.
    expect(mocks.sql.mock.calls.some((call) => String(call[0]).includes('set mime ='))).toBe(false);
  });

  it('écarte une finalisation qui dépasserait la capacité, trigger inclus (CL-3)', async () => {
    const t = tx();
    t.execute
      .mockResolvedValueOnce([row()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([row()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 100 }])
      .mockResolvedValueOnce([{ used: 0 }]);
    runWith(t);
    await expect(finalizeUpload(ctx(), deps(), RID)).resolves.toMatchObject({
      ok: false,
      error: { code: 'QUOTA_EXCEEDED' },
    });

    const trigger = tx();
    trigger.execute
      .mockResolvedValueOnce([row()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([row()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([{ used: 0 }])
      .mockRejectedValueOnce(new Error('storage_quota_exceeded'))
      .mockResolvedValueOnce([]);
    runWith(trigger);
    await expect(finalizeUpload(ctx(), deps(), RID)).resolves.toMatchObject({
      ok: false,
      error: { code: 'QUOTA_EXCEEDED' },
    });
  });

  it('refuse une mise à jour sans ligne renvoyée (conflit parallèle)', async () => {
    const t = tx();
    t.execute
      .mockResolvedValueOnce([row()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([row()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([{ used: 0 }])
      .mockResolvedValueOnce([]);
    runWith(t);
    await expect(finalizeUpload(ctx(), deps(), RID)).resolves.toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
  });

  it('refuse la finalisation sans lecteur connecté', async () => {
    await expect(finalizeUpload({ ...ctx(), db: null }, deps(), RID)).resolves.toMatchObject({
      ok: false,
      error: { code: 'UNAUTHENTICATED' },
    });
  });
});

describe('[SPEC-206] lecture signée (EF-4)', () => {
  it('signe dix minutes pour un fichier finalisé', async () => {
    const t = tx();
    t.execute.mockResolvedValueOnce([row({ size_bytes: PDF.length, mime: 'application/pdf' })]);
    runWith(t);
    await expect(getSignedReadUrl(ctx(), deps(), RID)).resolves.toEqual({
      ok: true,
      value: { url: 'https://storage.test/read', expiresAt: '2026-11-11T12:30:00.000Z' },
    });
    expect(mocks.createReadUrl).toHaveBeenCalledWith(
      expect.objectContaining({ clock }),
      { userId: USER, accessToken: `token:${USER}`, role: 'user' },
      { bucket: 'resources', path: row().storage_path },
    );
  });

  it('refuse un apport supprimé, une note ou un fichier non finalisé (CL-5, CL-7)', async () => {
    for (const value of [
      row({ deleted_at: new Date('2026-11-11T12:20:00Z') }),
      row({ storage_path: null }),
      row({ size_bytes: null }),
      row({ kind: 'note', size_bytes: 3 }),
    ]) {
      const t = tx();
      t.execute.mockResolvedValueOnce([value]);
      runWith(t);
      await expect(getSignedReadUrl(ctx(), deps(), RID)).resolves.toMatchObject({
        ok: false,
        error: { code: 'NOT_FOUND' },
      });
    }
    const missing = tx();
    missing.execute.mockResolvedValueOnce([]);
    runWith(missing);
    mocks.serviceExecute.mockResolvedValue([{ present: false }]);
    await expect(getSignedReadUrl(ctx(), deps(), RID)).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
  });
});

describe('[SPEC-206] suppression et nettoyage différé (EF-5, ET-6)', () => {
  it('supprime logiquement puis retire le blob', async () => {
    const t = tx();
    t.execute.mockResolvedValueOnce([row()]);
    runWith(t);
    const service = tx();
    mocks.serviceTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(service),
    );
    await expect(deleteResource(ctx(), deps(), RID)).resolves.toEqual({
      ok: true,
      value: undefined,
    });
    expect(service.execute).toHaveBeenCalledTimes(3);
    expect(mocks.deleteStoredObject).toHaveBeenCalledTimes(1);
    expect(mocks.serviceExecute).toHaveBeenCalled(); // blobRemovedAt marker
  });

  it('est idempotente quand le blob est déjà retiré, et survit à une panne de Storage', async () => {
    const removed = row({
      metadata: { upload: { declaredBytes: PDF.length, blobRemovedAt: '2026-11-11T12:00:00Z' } },
    });
    const t = tx();
    t.execute.mockResolvedValueOnce([removed]);
    runWith(t);
    mocks.serviceTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(tx()),
    );
    await expect(deleteResource(ctx(), deps(), RID)).resolves.toEqual({
      ok: true,
      value: undefined,
    });
    expect(mocks.deleteStoredObject).not.toHaveBeenCalled();

    const failing = tx();
    failing.execute.mockResolvedValueOnce([row()]);
    runWith(failing);
    mocks.serviceTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(tx()),
    );
    mocks.deleteStoredObject.mockRejectedValue(new Error('storage down'));
    const logger = { ...silentLogger(), warn: vi.fn() };
    await expect(deleteResource(ctx(undefined, logger), deps(), RID)).resolves.toEqual({
      ok: true,
      value: undefined,
    });
    expect(logger.warn).toHaveBeenCalled();
  });

  it('refuse un apport absent ou d’un autre propriétaire', async () => {
    const t = tx();
    t.execute.mockResolvedValueOnce([]);
    runWith(t);
    mocks.serviceExecute.mockResolvedValue([{ present: true }]);
    await expect(deleteResource(ctx(), deps(), RID)).resolves.toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });
  });

  it('nettoie les blobs en attente par lots bornés (CL-8)', async () => {
    const pending = [
      { id: RID, owner_id: USER, storage_path: `${USER}/${RID}/a.pdf` },
      { id: 'r2', owner_id: USER, storage_path: `${USER}/r2/b.pdf` },
    ];
    const sdb = { execute: vi.fn().mockResolvedValue(pending) };
    const system = { sdb, logger: silentLogger() };
    await expect(
      purgeDeletedBlobs(system as never, deps(), { limit: 10, ownerId: USER }),
    ).resolves.toEqual({ removed: 2, failed: 0 });

    mocks.deleteStoredObject.mockRejectedValueOnce(new Error('down'));
    await expect(purgeDeletedBlobs(system as never, deps())).resolves.toEqual({
      removed: 1,
      failed: 1,
    });
    for (const limit of [0, -1, 1001, 1.5]) {
      await expect(purgeDeletedBlobs(system as never, deps(), { limit })).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
      });
    }
  });
});

describe('[SPEC-206] émission unique de resource/uploaded (ET-5)', () => {
  it('émet quand la réclamation est gagnée, puis marque l’émission', async () => {
    const t = tx();
    t.execute.mockResolvedValueOnce([{ id: RID }]).mockResolvedValueOnce([]);
    runWith(t);
    const d = deps();
    await ensureUploadedEvent(ctx(), d, ctx().db, row({ size_bytes: PDF.length }));
    // eslint-disable-next-line @typescript-eslint/unbound-method -- fake observed without its receiver
    expect(d.events.emitUploaded).toHaveBeenCalledTimes(1);
    expect(t.execute).toHaveBeenCalledTimes(2);
  });

  it('ne fait rien quand la réclamation est perdue ou déjà émise (CL-4)', async () => {
    const t = tx();
    t.execute.mockResolvedValueOnce([]);
    runWith(t);
    const d = deps();
    await ensureUploadedEvent(ctx(), d, ctx().db, row({ size_bytes: PDF.length }));
    // eslint-disable-next-line @typescript-eslint/unbound-method -- fake observed without its receiver
    expect(d.events.emitUploaded).not.toHaveBeenCalled();
  });

  it('libère la réclamation et répond 503 quand l’émission échoue', async () => {
    const t = tx();
    t.execute.mockResolvedValueOnce([{ id: RID }]).mockResolvedValueOnce([]);
    runWith(t);
    const d = deps();
    d.events.emitUploaded = vi.fn().mockRejectedValue(new Error('bus down'));
    const logger = { ...silentLogger(), error: vi.fn() };
    await expect(
      ensureUploadedEvent(ctx(undefined, logger), d, ctx().db, row({ size_bytes: PDF.length })),
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(logger.error).toHaveBeenCalled();
    expect(t.execute).toHaveBeenCalledTimes(2);
  });
});
