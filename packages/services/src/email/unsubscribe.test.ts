// Unit tests of the unsubscribe service (SPEC-204 EF-5, ET-7, ADR-0124): a valid signed token alone
// disables the e-mail channel, an altered or expired one reveals nothing.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { silentLogger, TestClock } from '../../test/support/fakes';

import { invalidUnsubscribeToken, readUnsubscribeToken, unsubscribeByToken } from './unsubscribe';

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  config: vi.fn(),
  disable: vi.fn(),
}));

vi.mock('@learny/db', () => ({ serviceDb: () => ({}) }));
vi.mock('@learny/notifications/email', () => ({
  verifyUnsubscribeToken: mocks.verify,
  emailConfig: mocks.config,
  disableEmailChannel: mocks.disable,
}));

const clock = new TestClock();
const ctx = () => ({
  userId: null,
  requestId: 'req-1',
  db: null,
  clock,
  logger: { ...silentLogger(), info: vi.fn() },
});

beforeEach(() => {
  mocks.verify.mockReset();
  mocks.config.mockReset().mockReturnValue({ linkSecret: 'secret' });
  mocks.disable.mockReset();
});

describe('[SPEC-204] désinscription en un clic', () => {
  it('lit le jeton avec le secret de configuration (CL-5)', () => {
    mocks.verify.mockReturnValue('11111111-1111-4111-8111-111111111111');
    expect(readUnsubscribeToken('jeton')).toBe('11111111-1111-4111-8111-111111111111');
    expect(mocks.verify).toHaveBeenCalledWith('secret', 'jeton');
    expect(mocks.config).toHaveBeenCalled();
  });

  it('refuse un jeton altéré avec un code dédié (CL-5)', async () => {
    mocks.verify.mockReturnValue(null);
    const result = await unsubscribeByToken(ctx(), 'faux');
    expect(result).toMatchObject({ ok: false, error: { code: 'UNSUBSCRIBE_TOKEN_INVALID' } });
    expect(mocks.disable).not.toHaveBeenCalled();
    expect(invalidUnsubscribeToken().code).toBe('UNSUBSCRIBE_TOKEN_INVALID');
  });

  it('désactive le canal e-mail du compte du jeton', async () => {
    const logger = { ...silentLogger(), info: vi.fn() };
    mocks.verify.mockReturnValue('11111111-1111-4111-8111-111111111111');
    mocks.disable.mockResolvedValue(true);
    await expect(unsubscribeByToken({ ...ctx(), logger }, 'jeton')).resolves.toEqual({
      ok: true,
      value: { ok: true },
    });
    expect(mocks.disable).toHaveBeenCalledWith(
      expect.objectContaining({ clock }),
      '11111111-1111-4111-8111-111111111111',
    );
    expect(logger.info).toHaveBeenCalledWith('email channel disabled', {
      userId: '11111111-1111-4111-8111-111111111111',
      outcome: 'unsubscribed',
    });
  });

  it('traite un compte supprimé comme un lien expiré, sans rien révéler', async () => {
    mocks.verify.mockReturnValue('11111111-1111-4111-8111-111111111111');
    mocks.disable.mockResolvedValue(false);
    await expect(unsubscribeByToken(ctx(), 'jeton')).resolves.toMatchObject({
      ok: false,
      error: { code: 'UNSUBSCRIBE_TOKEN_INVALID' },
    });
  });
});
