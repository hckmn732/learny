import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ canAccessFormation: vi.fn() }));

vi.mock('@learny/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@learny/services')>()),
  canAccessFormation: mocks.canAccessFormation,
}));

import { formationManagementRoutes } from '@learny/contracts';
import { AppError } from '@learny/core';

import { formationManagementImplementations } from '../../../../packages/api-routes/src/implementations/formation-management';

const handler = formationManagementImplementations.formationAccessGet;
const args = {
  ctx: {},
  params: { fid: '9ef31f4a-fd13-4ad5-a4f3-e0d5e5eab3b1' },
  query: undefined,
  body: undefined,
  request: new Request('http://api.test'),
  logger: {},
} as unknown as Parameters<typeof handler>[0];

describe('[SPEC-1202] formation access', () => {
  beforeEach(() => {
    mocks.canAccessFormation.mockReset();
  });

  it('renvoie un succès sans contenu pour une formation visible', async () => {
    mocks.canAccessFormation.mockResolvedValue({ ok: true, value: true });
    await expect(handler(args)).resolves.toBeUndefined();
  });

  it('rend les formations absentes ou étrangères indistinguables en 404', async () => {
    mocks.canAccessFormation.mockResolvedValue({ ok: true, value: false });
    await expect(handler(args)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('conserve une panne transitoire du service', async () => {
    const error = new AppError('SERVICE_UNAVAILABLE', 'Base indisponible.');
    mocks.canAccessFormation.mockResolvedValue({ ok: false, error });
    await expect(handler(args)).rejects.toBe(error);
    expect(formationManagementRoutes.formationAccessGet.rateLimit).toBe('none');
    expect(formationManagementRoutes.formationAccessGet.successStatus).toBe(204);
  });
});
