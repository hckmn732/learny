// Legal acceptance service (SPEC-806 EF-3, EF-4, ET-3, ET-4; BR-ACC-02, ADR-0045).
//
// One pair of rows (`cgu`, `privacy`) is written in the same transaction, under the learner's RLS
// client, with the instant of the injected clock. The repository enforces idempotence on
// `(user_id, document, version)`: replaying the same versions keeps the original timestamp.
// The server guard rejects any mutation that still needs a new acceptance; export, deletion,
// sign-in, legal reads and the acceptance itself are explicit exemptions.
import { activeLegalVersions, type LegalVersions } from '@learny/config';
import {
  LegalAcceptanceInput,
  type LegalAcceptanceState,
  type LegalAcceptanceInput as LegalAcceptanceInputValue,
} from '@learny/contracts';
import { AppError } from '@learny/core';
import { latestLegalAcceptance, recordLegalAcceptance, sql } from '@learny/db';

import type { ServiceContext } from '../context';
import { requireUser } from '../resources/result';

/**
 * Routes that must keep working while a new version waits for acceptance (ET-4). The server, not
 * only the UI, refuses the other mutations through `requireCurrentLegalAcceptance`.
 */
export const LEGAL_EXEMPT_OPERATIONS = [
  'auth.signIn',
  'auth.signUp',
  'me.export.request',
  'me.export.read',
  'me.deletion.schedule',
  'me.deletion.cancel',
  'me.legal.accept',
] as const;

const EXEMPT = new Set<string>(LEGAL_EXEMPT_OPERATIONS);

/** ET-4 — explicit exemptions of the server guard. */
export function isLegalGuardExempt(operation: string): boolean {
  return EXEMPT.has(operation) || operation.startsWith('legal.') || operation.startsWith('page.');
}

function requiredVersions(versions: LegalVersions): AppError {
  return new AppError(
    'LEGAL_ACCEPTANCE_REQUIRED',
    'Une nouvelle version des conditions doit être acceptée avant cette action.',
    {
      errors: [
        { code: 'EXPECTED_VERSION', path: 'cguVersion', message: versions.cgu },
        { code: 'EXPECTED_VERSION', path: 'privacyVersion', message: versions.privacy },
      ],
    },
  );
}

function parseInput(input: unknown): LegalAcceptanceInputValue {
  const result = LegalAcceptanceInput.safeParse(input);
  if (result.success) return result.data;
  throw new AppError('VALIDATION_FAILED', 'Les versions soumises sont invalides.', {
    errors: result.error.issues.map((issue) => ({
      path: issue.path.join('.') || '(racine)',
      message: issue.message,
    })),
  });
}

interface LatestRows {
  cgu: string | null;
  privacy: string | null;
}

async function readLatest(ctx: ServiceContext): Promise<LatestRows> {
  const { userId, db } = requireUser(ctx);
  return db.run(async (tx) => {
    const cgu = await latestLegalAcceptance(tx, { userId, document: 'cgu' });
    const privacy = await latestLegalAcceptance(tx, { userId, document: 'privacy' });
    return { cgu: cgu?.version ?? null, privacy: privacy?.version ?? null };
  });
}

/**
 * ET-3 — records the active pair once, atomically. A version that is no longer active is a 409 and
 * writes nothing; a replay of the same pair returns the original acceptance instant.
 */
export async function acceptLegalVersions(
  ctx: ServiceContext,
  input: unknown,
  versions: LegalVersions = activeLegalVersions(),
): Promise<LegalAcceptanceState> {
  const value = parseInput(input);
  if (value.cguVersion !== versions.cgu || value.privacyVersion !== versions.privacy) {
    throw new AppError(
      'CONFLICT',
      'Les versions soumises ne sont plus les versions actives. Rechargez la page.',
      {
        errors: [
          { code: 'EXPECTED_VERSION', path: 'cguVersion', message: versions.cgu },
          { code: 'EXPECTED_VERSION', path: 'privacyVersion', message: versions.privacy },
        ],
      },
    );
  }

  const { userId, db } = requireUser(ctx);
  const now = ctx.clock.now();
  return db.run(async (tx) => {
    const cgu = await recordLegalAcceptance(tx, {
      userId,
      document: 'cgu',
      version: value.cguVersion,
      acceptedAt: now,
    });
    const privacy = await recordLegalAcceptance(tx, {
      userId,
      document: 'privacy',
      version: value.privacyVersion,
      acceptedAt: now,
    });
    await tx.execute(sql`
      update public.profiles
      set terms_version = ${`cgu:${value.cguVersion};privacy:${value.privacyVersion}`},
          terms_accepted_at = ${now.toISOString()}::timestamptz,
          updated_at = ${now.toISOString()}::timestamptz
      where id = ${userId}::uuid
    `);

    // CL-3 — a replay keeps the original rows; the answer exposes the real traceable instant.
    const instants = [cgu.acceptance.acceptedAt, privacy.acceptance.acceptedAt].map((date) =>
      date.getTime(),
    );
    return {
      cguVersion: value.cguVersion,
      privacyVersion: value.privacyVersion,
      acceptedAt: new Date(Math.max(...instants)).toISOString(),
      complete: true as const,
    };
  });
}

/**
 * ET-4 — server guard of the mutations that require the current documents. It reads the latest
 * accepted versions under the learner's RLS and answers `LEGAL_ACCEPTANCE_REQUIRED` with the two
 * expected versions; reading, export and deletion never call it.
 */
export async function requireCurrentLegalAcceptance(
  ctx: ServiceContext,
  versions: LegalVersions = activeLegalVersions(),
): Promise<void> {
  const latest = await readLatest(ctx);
  if (latest.cgu !== versions.cgu || latest.privacy !== versions.privacy) {
    throw requiredVersions(versions);
  }
}

/** Guard entry point of the API wrapper, honouring the explicit exemptions of ET-4. */
export async function enforceLegalAcceptance(
  ctx: ServiceContext,
  operation: string,
): Promise<void> {
  if (isLegalGuardExempt(operation)) return;
  await requireCurrentLegalAcceptance(ctx);
}
