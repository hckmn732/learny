// Unit tests of the personal-data services (SPEC-211 EF-1, EF-2, EF-5, EF-6, ET-1, ET-3, CL-1,
// CL-2, CL-5, CL-7): export request/read/download and deletion schedule/cancel. The database, the
// outbox transaction, Storage and the e-mail service are fakes.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '@learny/core';
import type { DataExport } from '@learny/db';

import { silentLogger, TestClock } from '../../test/support/fakes';

import {
  DELETION_DELAY_MS,
  assertSystemUser,
  cancelDeletion,
  deletionLabel,
  scheduleDeletion,
} from './deletion';
import {
  EXPORT_EXPIRED_MESSAGE,
  EXPORT_LIMIT_MESSAGE,
  EXPORT_TTL_MS,
  downloadExport,
  exportOwnerEmail,
  getExport,
  requestExport,
} from './export';
import type { PersonalDataDeps } from './export';

const mocks = vi.hoisted(() => ({
  serviceExecute: vi.fn(),
  serviceTransaction: vi.fn(),
  withTransaction: vi.fn(),
  findPending: vi.fn(),
  count: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
  canDownload: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock('@learny/db', () => ({
  SIGNED_URL_TTL_SECONDS: 600,
  schema: {},
  serviceDb: () => ({ execute: mocks.serviceExecute, transaction: mocks.serviceTransaction }),
  findPendingDataExport: mocks.findPending,
  countDataExportsOn: mocks.count,
  createDataExport: mocks.create,
  getDataExport: mocks.get,
  canDownloadDataExport: mocks.canDownload,
}));
vi.mock('@learny/jobs', () => ({
  withTransaction: mocks.withTransaction,
  formatLongDate: (date: Date) => date.toISOString().slice(0, 10),
}));
vi.mock('@learny/notifications/email', () => ({ sendEmail: mocks.sendEmail }));

const clock = new TestClock();
const USER = '11111111-1111-4111-8111-111111111111';
const EXPORT_ID = '55555555-5555-4555-8555-555555555555';
const ctx = () => ({
  userId: USER,
  requestId: 'req-1',
  db: { run: async (fn: (tx: unknown) => Promise<unknown>) => fn({}) } as never,
  clock,
  logger: silentLogger(),
});

function outbox() {
  return { add: vi.fn() };
}

function exportRow(overrides: Partial<DataExport> = {}): DataExport {
  return {
    id: EXPORT_ID,
    userId: USER,
    status: 'queued',
    requestedOn: '2026-11-11',
    sizeBytes: null,
    storagePath: null,
    createdAt: new Date('2026-11-11T12:20:00Z'),
    expiresAt: null,
    error: null,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.serviceExecute.mockReset().mockResolvedValue([]);
  mocks.serviceTransaction.mockReset();
  mocks.withTransaction.mockReset();
  mocks.findPending.mockReset();
  mocks.count.mockReset();
  mocks.create.mockReset();
  mocks.get.mockReset();
  mocks.canDownload.mockReset().mockReturnValue(false);
  mocks.sendEmail.mockReset().mockResolvedValue({ ok: true, value: { messageId: 'm1' } });
  clock.set('2026-11-11T12:20:00Z');
});

function exportTx() {
  const events = outbox();
  const tx = { execute: vi.fn().mockResolvedValue([]) };
  mocks.withTransaction.mockImplementation(
    async (_db: unknown, callback: (tx: unknown, outbox: unknown) => Promise<unknown>) =>
      callback(tx, events),
  );
  return { events, tx };
}

describe('[SPEC-211] export des données (EF-1, EF-2)', () => {
  it('crée un export en file, un seul par jour, et publie l’événement (CL-1)', async () => {
    const { events, tx } = exportTx();
    mocks.serviceExecute.mockResolvedValue([{ timezone: 'Europe/Paris' }]);
    mocks.findPending.mockResolvedValue(null);
    mocks.count.mockResolvedValue(0);
    mocks.create.mockResolvedValue(exportRow({ id: EXPORT_ID }));
    await expect(requestExport(ctx())).resolves.toEqual({
      ok: true,
      value: { exportId: EXPORT_ID, status: 'queued' },
    });
    expect(mocks.create).toHaveBeenCalledWith(tx, {
      userId: USER,
      status: 'queued',
      requestedOn: '2026-11-11',
      createdAt: clock.now(),
    });
    expect(events.add).toHaveBeenCalledWith(
      'account/export-requested',
      { userId: USER, exportId: EXPORT_ID },
      { id: `account-export:${EXPORT_ID}` },
    );
  });

  it('renvoie l’export déjà en cours sans en créer un second (double clic)', async () => {
    exportTx();
    mocks.serviceExecute.mockResolvedValue([{ timezone: 'Europe/Paris' }]);
    mocks.findPending.mockResolvedValue(exportRow({ status: 'running' }));
    await expect(requestExport(ctx())).resolves.toEqual({
      ok: true,
      value: { exportId: EXPORT_ID, status: 'running' },
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('refuse le quatrième export du jour avec le message dédié (CL-2)', async () => {
    exportTx();
    mocks.serviceExecute.mockResolvedValue([{ timezone: 'Europe/Paris' }]);
    mocks.findPending.mockResolvedValue(null);
    mocks.count.mockResolvedValue(3);
    const result = await requestExport(ctx());
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'EXPORT_LIMIT_REACHED', detail: EXPORT_LIMIT_MESSAGE },
    });
  });

  it('refuse un profil introuvable et une requête anonyme', async () => {
    mocks.serviceExecute.mockResolvedValue([]);
    await expect(requestExport(ctx())).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
    await expect(requestExport({ ...ctx(), userId: null, db: null })).resolves.toMatchObject({
      ok: false,
      error: { code: 'UNAUTHENTICATED' },
    });
  });

  it('lit l’état d’un export, signe les archives disponibles et refuse les expirées (CL-5)', async () => {
    const done = exportRow({
      status: 'done',
      sizeBytes: 2048,
      storagePath: `${USER}/${EXPORT_ID}.zip`,
      expiresAt: new Date(clock.now().getTime() + EXPORT_TTL_MS),
    });
    const gateway = {
      signRead: vi.fn().mockResolvedValue('https://storage.test/export'),
    };
    const deps = {
      gateway,
      accessToken: (userId: string) => `token:${userId}`,
    } as unknown as PersonalDataDeps;
    mocks.get.mockResolvedValue(done);
    mocks.canDownload.mockReturnValue(true);
    await expect(getExport(ctx(), deps, EXPORT_ID)).resolves.toEqual({
      ok: true,
      value: {
        id: EXPORT_ID,
        status: 'done',
        sizeBytes: 2048,
        createdAt: '2026-11-11T12:20:00.000Z',
        expiresAt: done.expiresAt?.toISOString(),
        downloadUrl: 'https://storage.test/export',
      },
    });
    expect(gateway.signRead).toHaveBeenCalledWith(
      'exports',
      done.storagePath,
      `token:${USER}`,
      600,
    );

    mocks.canDownload.mockReturnValue(false);
    mocks.get.mockResolvedValue(exportRow({ status: 'queued' }));
    const view = await getExport(ctx(), deps, EXPORT_ID);
    expect(view.ok && 'downloadUrl' in view.value).toBe(false);
    const expired = exportRow({
      status: 'done',
      expiresAt: new Date('2026-10-01T00:00:00Z'),
    });
    mocks.get.mockResolvedValue(expired);
    await expect(getExport(ctx(), deps, EXPORT_ID)).resolves.toMatchObject({
      ok: false,
      error: { code: 'EXPORT_EXPIRED', detail: EXPORT_EXPIRED_MESSAGE },
    });
    const missingPath = exportRow({ status: 'done', storagePath: null });
    mocks.get.mockResolvedValue(missingPath);
    mocks.canDownload.mockReturnValue(true);
    await expect(getExport(ctx(), deps, EXPORT_ID)).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
  });

  it('refuse la lecture d’un export absent ou d’un autre lecteur', async () => {
    mocks.get.mockResolvedValue(null);
    await expect(
      getExport(
        ctx(),
        { gateway: { signRead: vi.fn() }, accessToken: () => 't' } as unknown as PersonalDataDeps,
        EXPORT_ID,
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('télécharge une archive disponible et refuse une archive expirée ou pas prête (CL-4)', async () => {
    const deps = {
      gateway: { signRead: vi.fn().mockResolvedValue('https://storage.test/export') },
      accessToken: () => 'token',
    } as unknown as PersonalDataDeps;
    mocks.get.mockResolvedValue(
      exportRow({ status: 'done', storagePath: `${USER}/x.zip`, expiresAt: null }),
    );
    mocks.canDownload.mockReturnValue(true);
    await expect(downloadExport(ctx(), deps, EXPORT_ID)).resolves.toEqual({
      ok: true,
      value: { url: 'https://storage.test/export' },
    });
    mocks.canDownload.mockReturnValue(false);
    mocks.get.mockResolvedValue(exportRow({ status: 'queued' }));
    await expect(downloadExport(ctx(), deps, EXPORT_ID)).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
    mocks.get.mockResolvedValue(
      exportRow({
        status: 'done',
        storagePath: `${USER}/x.zip`,
        expiresAt: new Date('2026-10-01T00:00:00Z'),
      }),
    );
    await expect(downloadExport(ctx(), deps, EXPORT_ID)).resolves.toMatchObject({
      ok: false,
      error: { code: 'EXPORT_EXPIRED' },
    });
    mocks.get.mockResolvedValue(null);
    await expect(downloadExport(ctx(), deps, EXPORT_ID)).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
  });

  it('lit l’adresse du propriétaire pour la démonstration', async () => {
    mocks.serviceExecute.mockResolvedValue([{ email: 'ada@test.learny.test' }]);
    await expect(exportOwnerEmail(USER)).resolves.toBe('ada@test.learny.test');
    mocks.serviceExecute.mockResolvedValue([]);
    await expect(exportOwnerEmail(USER)).resolves.toBeNull();
  });
});

describe('[SPEC-211] suppression du compte (EF-5, EF-6)', () => {
  it('programme la suppression à J+30 et envoie un e-mail idempotent (CL-7)', async () => {
    const profile = {
      id: USER,
      email: 'ada@test.learny.test',
      timezone: 'Europe/Paris',
      deletion_requested_at: null,
      deletion_scheduled_for: null,
    };
    mocks.serviceExecute.mockResolvedValue([profile]);
    const tx = { execute: vi.fn().mockResolvedValue([]) };
    mocks.serviceTransaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => callback(tx),
    );
    const result = await scheduleDeletion(ctx());
    expect(result).toEqual({
      ok: true,
      value: { scheduledFor: new Date(clock.now().getTime() + DELETION_DELAY_MS).toISOString() },
    });
    expect(tx.execute).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ clock }), {
      userId: USER,
      template: 'deletion_scheduled',
      props: { scheduledLabel: '2026-12-11' },
      idempotencyKey: `deletion-scheduled:${USER}:${new Date(clock.now().getTime() + DELETION_DELAY_MS).toISOString()}`,
    });
  });

  it('est idempotente : une seconde demande renvoie la même échéance sans e-mail', async () => {
    const scheduledFor = new Date('2026-12-11T12:20:00Z');
    mocks.serviceExecute.mockResolvedValue([
      {
        id: USER,
        email: 'ada@test.learny.test',
        timezone: 'UTC',
        deletion_requested_at: '2026-11-11T12:20:00Z',
        deletion_scheduled_for: scheduledFor.toISOString(),
      },
    ]);
    await expect(scheduleDeletion(ctx())).resolves.toEqual({
      ok: true,
      value: { scheduledFor: scheduledFor.toISOString() },
    });
    expect(mocks.serviceTransaction).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('refuse un profil introuvable et traite une date illisible comme absente', async () => {
    mocks.serviceExecute.mockResolvedValue([]);
    await expect(scheduleDeletion(ctx())).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
    mocks.serviceExecute.mockResolvedValue([
      {
        id: USER,
        email: 'ada@test.learny.test',
        timezone: 'UTC',
        deletion_requested_at: undefined,
        deletion_scheduled_for: 'pas une date',
      },
    ]);
    mocks.serviceTransaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => callback({ execute: vi.fn() }),
    );
    await expect(scheduleDeletion(ctx())).resolves.toMatchObject({ ok: true });
  });

  it('remonte l’échec de l’e-mail de programmation', async () => {
    mocks.serviceExecute.mockResolvedValue([
      {
        id: USER,
        email: 'ada@test.learny.test',
        timezone: 'UTC',
        deletion_requested_at: null,
        deletion_scheduled_for: null,
      },
    ]);
    mocks.serviceTransaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => callback({ execute: vi.fn() }),
    );
    mocks.sendEmail.mockResolvedValue({
      ok: false,
      error: new AppError('SERVICE_UNAVAILABLE', 'mail indisponible'),
    });
    await expect(scheduleDeletion(ctx())).resolves.toMatchObject({
      ok: false,
      error: { code: 'SERVICE_UNAVAILABLE' },
    });
  });

  it('annule la suppression, même sans demande en attente (EF-6)', async () => {
    await expect(cancelDeletion(ctx())).resolves.toEqual({ ok: true, value: undefined });
    expect(mocks.serviceExecute).toHaveBeenCalledTimes(1);
    await expect(cancelDeletion({ ...ctx(), userId: null, db: null })).resolves.toMatchObject({
      ok: false,
      error: { code: 'UNAUTHENTICATED' },
    });
  });

  it('formate l’échéance dans la zone du profil et protège le contexte système', () => {
    expect(deletionLabel(new Date('2026-12-11T12:20:00Z'), 'Europe/Paris')).toContain('11');
    expect(() => {
      assertSystemUser({ userId: 'other', sdb: {} } as never, USER);
    }).toThrow(AppError);
    expect(() => {
      assertSystemUser({ userId: null, sdb: {} } as never, USER);
    }).not.toThrow();
    expect(() => {
      assertSystemUser({ userId: USER, sdb: {} } as never, USER);
    }).not.toThrow();
  });
});
