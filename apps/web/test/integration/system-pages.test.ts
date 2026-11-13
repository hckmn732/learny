// @vitest-environment jsdom
import { createElement } from 'react';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '@learny/core';
import { closeDb, sql } from '@learny/db';
import { asUser, withRollback } from '@learny/db/testing';
import { createFormation, createUser } from '@learny/testing';
import { cleanup, renderComponent, screen } from '@learny/testing/render';

import { ErrorView } from '../../components/system/error-view';
import { NotFoundView } from '../../components/system/system-page-view';
import { decideRoute, type GuardInput } from '../../lib/route-guard';

const USER = '4b7c1c8e-6a0f-4d52-9d3e-6f9d1f0a1b11';
const profile = () =>
  Promise.resolve({ onboardingStep: 'done', deletionScheduledFor: null } as const);

function input(pathname: string, overrides: Partial<GuardInput> = {}): GuardInput {
  return { pathname, search: '', userId: USER, cachedStep: undefined, ...overrides };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await closeDb();
});

describe("[SPEC-308] Pages système et mise en page d'authentification service", () => {
  it('une session expirée renvoie vers Connexion avec le retour local, jamais un externe (CA-4, CL-3)', async () => {
    expect(await decideRoute(input('/acces-refuse', { userId: null }), profile)).toEqual({
      kind: 'redirect',
      to: '/connexion?suite=%2Facces-refuse',
    });

    expect(
      await decideRoute(input('/connexion', { search: '?suite=%2Fhors-ligne' }), profile),
    ).toEqual({ kind: 'redirect', to: '/hors-ligne' });

    for (const external of [
      'https%3A%2F%2Fevil.example',
      '%2F%2Fevil.example',
      '%5Cevil.example',
      'javascript%3Aalert(1)',
    ]) {
      expect(
        await decideRoute(input('/connexion', { search: `?suite=${external}` }), profile),
        external,
      ).toEqual({ kind: 'redirect', to: '/accueil' });
    }
  });

  it('la 404 ne rend aucun détail interne ni identifiant de requête inventé (CA-1, CL-2)', () => {
    renderComponent(createElement(NotFoundView, { signedIn: false }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Page introuvable');
    expect(screen.getByRole('link', { name: 'Se connecter' })).toBeTruthy();
    expect(screen.queryByTestId('system-error-request-id')).toBeNull();
    expect(document.body.innerHTML).not.toMatch(
      /SQLSTATE|relation|stack|\.tsx:\d+|secret|token|db\.internal/i,
    );
  });

  it('une erreur récupérable affiche l’identifiant présent et appelle reset() une fois (CA-2)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const reset = vi.fn();
    const { user } = renderComponent(
      createElement(ErrorView, {
        error: new AppError('INTERNAL_ERROR', 'select * from private.accounts failed', {
          requestId: 'req-308-safe',
        }),
        reset,
      }),
    );

    expect(screen.getByTestId('system-error-request-id').textContent).toBe(
      'Identifiant de requête : req-308-safe',
    );
    const html = document.body.innerHTML;
    expect(html).not.toContain('private.accounts');
    expect(html).not.toContain('select *');
    expect(html).not.toMatch(/\.tsx:\d+|ECONNREFUSED|db\.internal/i);

    await user.click(screen.getByTestId('system-error-retry'));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('RLS : la formation de A reste invisible pour B (CA-3, isolation des données)', async () => {
    const result = await withRollback(async (tx) => {
      const a = await createUser(tx, { email: 'sys-a@test.learny.test' });
      const b = await createUser(tx, { email: 'sys-b@test.learny.test' });
      const formation = await createFormation(tx, {
        ownerId: a.id,
        title: 'Formation privée de A',
      });
      const seenByA = await asUser(tx, a.id, (userTx) =>
        userTx.execute<{ id: string }>(sql`select id::text as id from public.formations`),
      );
      const seenByB = await asUser(tx, b.id, (userTx) =>
        userTx.execute<{ id: string }>(sql`select id::text as id from public.formations`),
      );
      return { formation, seenByA, seenByB };
    });

    expect(result.seenByA.map((row) => row.id)).toContain(result.formation.id);
    expect(result.seenByB.map((row) => row.id)).not.toContain(result.formation.id);
    expect(result.seenByB).toHaveLength(0);
  });
});
