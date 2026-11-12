// Unit tests of the e-mailed link callback (SPEC-202 EF-6, CL-1, CL-2): any failure leads to the
// invalid-link page, never to a session or a redirect to an unsafe path.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { silentLogger, TestClock } from '../../test/support/fakes';

const mocks = vi.hoisted(() => ({
  finalize: vi.fn(),
  loadProfile: vi.fn(),
}));

vi.mock('./finalize', () => ({
  finalizeFirstVerification: mocks.finalize,
  loadDestinationProfile: mocks.loadProfile,
}));

import { INVALID_LINK_DESTINATION, completeVerification } from './verify';

const clock = new TestClock();
const ctx = { userId: null, requestId: 'req-1', db: null, clock, logger: silentLogger() };
const USER = '11111111-1111-4111-8111-111111111111';

function auth(overrides: Record<string, unknown> = {}) {
  return {
    verifyOtp: vi
      .fn()
      .mockResolvedValue({ data: { user: { id: USER } }, error: null, ...overrides }),
  };
}

function deps(client = auth()) {
  return { auth: client as never, appUrl: 'https://learny.test' };
}

beforeEach(() => {
  mocks.finalize.mockReset();
  mocks.loadProfile.mockReset();
  mocks.finalize.mockResolvedValue({ firstTime: true });
  mocks.loadProfile.mockResolvedValue({ onboardingStep: 'done', deletionScheduledFor: null });
});

describe('[SPEC-202] callback du lien reçu', () => {
  it('vérifie le jeton côté serveur puis applique la destination (EF-6)', async () => {
    const client = auth();
    await expect(
      completeVerification(
        ctx,
        { tokenHash: 'hash', type: 'magiclink', next: '/agenda?semaine=2' },
        deps(client),
      ),
    ).resolves.toBe('/agenda?semaine=2');
    expect(client.verifyOtp).toHaveBeenCalledWith({ token_hash: 'hash', type: 'magiclink' });
    expect(mocks.finalize).toHaveBeenCalledWith(ctx, USER, 'magic_link');
    expect(mocks.loadProfile).toHaveBeenCalledWith(USER);
  });

  it('ignore un `next` hors application (CL-4)', async () => {
    await expect(
      completeVerification(
        ctx,
        { tokenHash: 'hash', type: 'magiclink', next: 'https://evil.example' },
        deps(),
      ),
    ).resolves.toBe('/accueil');
  });

  it('répond la page lien invalide pour une erreur ou un utilisateur absent (CL-1)', async () => {
    await expect(
      completeVerification(
        ctx,
        { tokenHash: 'hash', type: 'email' },
        deps(auth({ data: { user: { id: USER } }, error: { code: 'otp_expired' } })),
      ),
    ).resolves.toBe(INVALID_LINK_DESTINATION);
    await expect(
      completeVerification(
        ctx,
        { tokenHash: 'hash', type: 'signup' },
        deps(auth({ data: { user: null }, error: null })),
      ),
    ).resolves.toBe(INVALID_LINK_DESTINATION);
    expect(mocks.finalize).not.toHaveBeenCalled();
  });

  it('répond la page lien invalide quand le service tombe, sans fuite (CL-2)', async () => {
    const logger = { ...silentLogger(), warn: vi.fn() };
    const client = { verifyOtp: vi.fn().mockRejectedValue(new Error('réseau')) };
    await expect(
      completeVerification(
        { ...ctx, logger },
        { tokenHash: 'hash', type: 'magiclink' },
        deps(client as never),
      ),
    ).resolves.toBe(INVALID_LINK_DESTINATION);
    expect(logger.warn).toHaveBeenCalledWith('verification failed', {
      code: 'SERVICE_UNAVAILABLE',
    });
  });
});
