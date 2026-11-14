// Unit tests of the authenticated profile projection (SPEC-601 EF-10, completed by SPEC-602).
// The transaction is a fake: these tests pin the DTO trimming, the not-found refusal and the
// unauthenticated refusal, not SQL.
import { describe, expect, it, vi } from 'vitest';

import type { UserDatabase } from '@learny/db';

import { TestClock } from '../test/support/fakes';

import type { ServiceContext } from './context';
import { getMe } from './me';

const USER = '11111111-1111-4111-8111-111111111111';

function context(execute: ReturnType<typeof vi.fn>): ServiceContext {
  return {
    userId: USER,
    requestId: 'req-me',
    db: { run: (flow: (tx: unknown) => Promise<unknown>) => flow({ execute }) } as UserDatabase,
    clock: new TestClock('2026-11-11T12:20:00Z'),
    logger: {} as never,
  };
}

function row(partial: Record<string, unknown> = {}) {
  return {
    id: USER,
    email: 'alex@test.learny.test',
    first_name: 'Alex',
    last_name: 'Martin',
    tutor_tone: 'tu',
    course_language: 'fr',
    timezone: 'Europe/Paris',
    onboarding_step: 'done',
    onboarding_completed_at: new Date('2026-11-01T10:00:00Z'),
    current_formation_id: '22222222-2222-4222-8222-222222222222',
    ...partial,
  };
}

describe('[SPEC-601] profil authentifié', () => {
  it('projette le profil et convertit la date de fin d’accueil (EF-10)', async () => {
    const result = await getMe(context(vi.fn().mockResolvedValue([row()])));

    expect(result).toEqual({
      ok: true,
      value: {
        id: USER,
        email: 'alex@test.learny.test',
        firstName: 'Alex',
        lastName: 'Martin',
        tutorTone: 'tu',
        courseLanguage: 'fr',
        timezone: 'Europe/Paris',
        onboardingStep: 'done',
        onboardingCompletedAt: '2026-11-01T10:00:00.000Z',
        currentFormationId: '22222222-2222-4222-8222-222222222222',
      },
    });
  });

  it('rend null les noms absents ou blancs et une date non renseignée', async () => {
    const result = await getMe(
      context(
        vi.fn().mockResolvedValue([
          row({
            first_name: '   ',
            last_name: null,
            onboarding_completed_at: null,
            current_formation_id: null,
          }),
        ]),
      ),
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        firstName: null,
        lastName: null,
        onboardingCompletedAt: null,
        currentFormationId: null,
      },
    });
  });

  it('normalise une date brute renvoyée par la base (chaîne ISO)', async () => {
    const result = await getMe(
      context(
        vi.fn().mockResolvedValue([row({ onboarding_completed_at: '2026-11-01T10:00:00+00:00' })]),
      ),
    );
    expect(result).toMatchObject({
      ok: true,
      value: { onboardingCompletedAt: '2026-11-01T10:00:00.000Z' },
    });
  });

  it('rend null une date brute illisible', async () => {
    const result = await getMe(
      context(vi.fn().mockResolvedValue([row({ onboarding_completed_at: 'invalide' })])),
    );
    expect(result).toMatchObject({ ok: true, value: { onboardingCompletedAt: null } });
  });

  it('refuse un profil introuvable (NOT_FOUND)', async () => {
    const result = await getMe(context(vi.fn().mockResolvedValue([])));
    expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('refuse un appel sans session (UNAUTHENTICATED)', async () => {
    const anonymous: ServiceContext = {
      userId: null,
      requestId: 'req-me',
      db: null,
      clock: new TestClock(),
      logger: {} as never,
    };
    await expect(getMe(anonymous)).resolves.toMatchObject({
      ok: false,
      error: { code: 'UNAUTHENTICATED' },
    });
  });

  it('laisse remonter un défaut inattendu', async () => {
    await expect(getMe(context(vi.fn().mockRejectedValue(new Error('panne'))))).rejects.toThrow(
      'panne',
    );
  });
});
