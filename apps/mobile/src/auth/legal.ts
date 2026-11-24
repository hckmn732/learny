// Acceptance of a new version of the legal documents (SPEC-3101 EF-7, CL-6; BR-ACC-02,
// BR-PLA-05; ADR-3008 § 5, ADR-0045).
//
// The server refuses every other mutation with `422 LEGAL_ACCEPTANCE_REQUIRED` and carries the
// active versions in the `errors` of the problem (see `packages/services/src/legal/accept.ts`).
// The application therefore never guesses a version: it reads the expected pair from the refusal,
// shows the sheet, records the acceptance and replays the refused action (CL-6).
import { isAppError } from '@learny/core';

import { requireApiClient } from '../api/registry';

export interface LegalVersions {
  readonly cguVersion: string;
  readonly privacyVersion: string;
}

/** Codes of the problem that request a new acceptance. */
const LEGAL_CODES: readonly string[] = ['LEGAL_ACCEPTANCE_REQUIRED', 'LEGAL_VERSIONS_CHANGED'];

/**
 * SPEC-3402 — a provider connection only learns the active versions from a refusal: it submits a
 * placeholder pair to `POST /me/legal-acceptances`, which answers `CONFLICT` with the two active
 * versions. Such a refusal is not a "new acceptance" request (`isLegalAcceptanceRequired` stays
 * false) but it carries the pair the sheet must show.
 */
const VERSION_CONFLICT_CODE = 'CONFLICT';

/** True when the answer asks the learner to accept a new version of the conditions. */
export function isLegalAcceptanceRequired(error: unknown): boolean {
  return isAppError(error) && LEGAL_CODES.includes(error.code);
}

function versionOf(
  errors: readonly { code?: string; path: string; message: string }[],
  path: string,
): string | null {
  const found = errors.find((entry) => entry.path === path);
  if (found === undefined) return null;
  const value = found.message.trim();
  return value === '' ? null : value;
}

/**
 * Active versions carried by the refusal (EF-7, CL-6), or `null` when the answer does not carry
 * the pair: the sheet then stays closed and the failure is displayed as is.
 */
export function expectedLegalVersions(error: unknown): LegalVersions | null {
  if (!isAppError(error)) return null;
  if (!LEGAL_CODES.includes(error.code) && error.code !== VERSION_CONFLICT_CODE) return null;
  const errors = (error as { errors?: { code?: string; path: string; message: string }[] }).errors;
  if (errors === undefined) return null;
  const cguVersion = versionOf(errors, 'cguVersion');
  const privacyVersion = versionOf(errors, 'privacyVersion');
  if (cguVersion === null || privacyVersion === null) return null;
  return { cguVersion, privacyVersion };
}

/** Records the pair accepted in the sheet (`POST /me/legal-acceptances`, BR-ACC-02). */
export async function acceptLegalVersions(versions: LegalVersions): Promise<void> {
  await requireApiClient().api.meLegalAccept({
    body: { cguVersion: versions.cguVersion, privacyVersion: versions.privacyVersion },
  });
}
