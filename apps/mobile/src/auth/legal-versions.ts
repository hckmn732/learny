// Active legal versions known by the mobile build (SPEC-3402 CA-2, BR-ACC-02; ADR-3020).
//
// The API serialises the `errors` of a problem only for `VALIDATION_FAILED` (and two siblings), so
// neither `422 LEGAL_ACCEPTANCE_REQUIRED` nor the `409 CONFLICT` of a submitted pair carries the
// active versions: the mobile cannot learn them from the server today (verified against the local
// stack, see `evidence/SPEC-3402/acceptance.md`). The build therefore carries the versions of its
// release — public information, printed on the legal pages — and the server still validates them:
// a stale pair is refused, never silently accepted. P35 must expose the versions to the clients
// (contract change, out of the mobile track, ADR-3001 § 4).
export const MOBILE_LEGAL_VERSIONS = {
  cguVersion: '2026-11-11',
  privacyVersion: '2026-11-11',
} as const;
