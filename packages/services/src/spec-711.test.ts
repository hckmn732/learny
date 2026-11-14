// Unit tests of the persistence helpers of the automation engine (SPEC-711 ET-4, CA-2, CL-1).
//
// The transaction is a fake: these tests pin the validation of a proposal (before any write), the
// `pending_consent`/`applied` derivation and the shape of the idempotent result when the partial
// unique index already holds the dedupe key. The real `on conflict do nothing`, the row locks and
// RLS are pinned by the integration and route suites — no SQL is executed here.
import { describe, expect, it } from 'vitest';

import { AppError } from '@learny/core';
import type { AutomationAction, DbTx } from '@learny/db';

import {
  createAutomationActionQuiet,
  type CreateAutomationActionQuietInput,
} from './automations/index';

const USER = '11111111-1111-4111-8111-111111111111';
const ACTION = '22222222-2222-4222-8222-222222222222';
const AT = new Date('2026-11-11T12:20:00Z');

interface FakeTxOptions {
  inserted?: Record<string, unknown>[];
  existing?: AutomationAction | null;
}

function fakeTx(options: FakeTxOptions = {}): DbTx {
  const tx = {
    execute: (): Promise<Record<string, unknown>[]> => Promise.resolve(options.inserted ?? []),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: (): Promise<AutomationAction[]> =>
            Promise.resolve(
              options.existing === undefined || options.existing === null ? [] : [options.existing],
            ),
        }),
      }),
    }),
  };
  return tx as unknown as DbTx;
}

const INPUT: CreateAutomationActionQuietInput = {
  userId: USER,
  formationId: null,
  automation: 'reprise',
  kind: 'reprise_demo',
  summary: 'Séance de reprise de 15 min proposée',
  payload: { minutes: 15, dedupeKey: 'reprise:2026-11-11' },
  requiresConsent: true,
  createdAt: AT,
};

function insertedRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ACTION,
    user_id: USER,
    formation_id: null,
    automation: 'reprise',
    kind: 'reprise_demo',
    summary: 'Séance de reprise de 15 min proposée',
    payload: { minutes: 15, dedupeKey: 'reprise:2026-11-11' },
    undo_payload: { restaure: 'aucune séance' },
    requires_consent: true,
    status: 'pending_consent',
    decided_at: null,
    created_at: AT,
    ...overrides,
  };
}

function existingAction(): AutomationAction {
  return {
    id: ACTION,
    userId: USER,
    formationId: null,
    automation: 'reprise',
    kind: 'reprise_demo',
    summary: 'Séance de reprise de 15 min proposée',
    payload: { minutes: 15, dedupeKey: 'reprise:2026-11-11' },
    undoPayload: null,
    requiresConsent: true,
    status: 'pending_consent',
    decidedAt: null,
    createdAt: AT,
  };
}

function expectValidationFailure(fn: () => Promise<unknown>, field: string): Promise<void> {
  return fn().then(
    () => {
      throw new Error(`un refus ${field} était attendu`);
    },
    (error: unknown) => {
      expect(error).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.code).toBe('VALIDATION_FAILED');
      expect(appError.errors?.[0]?.path).toBe(field);
    },
  );
}

describe('[SPEC-711] règles et calculs — persistance', () => {
  it('CA-2 — une proposition crée une action en attente d’accord et projette la ligne', async () => {
    const result = await createAutomationActionQuiet(fakeTx({ inserted: [insertedRow()] }), INPUT);
    expect(result.created).toBe(true);
    expect(result.action).toEqual({
      id: ACTION,
      userId: USER,
      formationId: null,
      automation: 'reprise',
      kind: 'reprise_demo',
      summary: 'Séance de reprise de 15 min proposée',
      payload: { minutes: 15, dedupeKey: 'reprise:2026-11-11' },
      undoPayload: { restaure: 'aucune séance' },
      requiresConsent: true,
      status: 'pending_consent',
      decidedAt: null,
      createdAt: AT,
    });
  });

  it('CA-2 — une seconde livraison du même événement rend l’action existante sans écrire', async () => {
    const tx = fakeTx({ inserted: [], existing: existingAction() });
    const result = await createAutomationActionQuiet(tx, INPUT);
    expect(result.created).toBe(false);
    expect(result.action?.id).toBe(ACTION);
    expect(result.action?.status).toBe('pending_consent');
  });

  it('CA-2 — un conflit sans ligne existante est une erreur interne, jamais une action inventée', async () => {
    await expect(
      createAutomationActionQuiet(fakeTx({ inserted: [], existing: null }), INPUT),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });

  it('CA-2 — une action sans consentement est appliquée et une échéance passée reste modélisée', async () => {
    const result = await createAutomationActionQuiet(
      fakeTx({
        inserted: [
          insertedRow({
            requires_consent: false,
            status: 'applied',
            payload: { dedupeKey: 'k', expiresAt: '2026-11-10T12:20:00.000Z' },
          }),
        ],
      }),
      { ...INPUT, requiresConsent: false, payload: { expiresAt: '2026-11-10T12:20:00.000Z' } },
    );
    expect(result.created).toBe(true);
    expect(result.action?.status).toBe('applied');
    expect(result.action?.requiresConsent).toBe(false);
  });

  it('CL-1 — un identifiant, une clé ou un type hors schéma ne sont jamais écrits', async () => {
    await expectValidationFailure(
      () =>
        createAutomationActionQuiet(fakeTx(), {
          ...INPUT,
          userId: 'pas-un-uuid',
        }),
      'userId',
    );
    await expectValidationFailure(
      () =>
        createAutomationActionQuiet(fakeTx(), {
          ...INPUT,
          formationId: 'pas-un-uuid',
        }),
      'formationId',
    );
    await expectValidationFailure(
      () =>
        createAutomationActionQuiet(fakeTx(), {
          ...INPUT,
          automation: 'inconnu' as never,
        }),
      'automation',
    );
    await expectValidationFailure(
      () => createAutomationActionQuiet(fakeTx(), { ...INPUT, kind: '' }),
      'kind',
    );
    await expectValidationFailure(
      () =>
        createAutomationActionQuiet(fakeTx(), {
          ...INPUT,
          summary: 'deux\nlignes',
        }),
      'summary',
    );
  });

  it('CL-1 — une action en attente ne peut pas porter de date de décision', async () => {
    await expectValidationFailure(
      () => createAutomationActionQuiet(fakeTx(), { ...INPUT, decidedAt: AT }),
      'decidedAt',
    );
    await expectValidationFailure(
      () => createAutomationActionQuiet(fakeTx(), { ...INPUT, createdAt: new Date(NaN) }),
      'createdAt',
    );
  });
});
