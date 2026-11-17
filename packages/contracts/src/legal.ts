import { z } from 'zod';

import { IsoDateTime } from './common';
import { defineRoute } from './define-route';

// Legal versions and the acceptance route (SPEC-806 EF-3, EF-4, ET-3; BR-ACC-02).
// The client may only accept the versions that are active in the configuration: the server never
// trusts a version sent by the browser and never records a partial pair.

export const LEGAL_DOCUMENTS = ['cgu', 'privacy'] as const;
export const LegalDocument = z.enum(LEGAL_DOCUMENTS);
export type LegalDocument = z.infer<typeof LegalDocument>;

export const LegalVersion = z.string().trim().min(1).max(40);
export type LegalVersion = z.infer<typeof LegalVersion>;

/** ET-3 — the two versions are submitted together; the UI has a single non-prechecked case. */
export const LegalAcceptanceInput = z.strictObject({
  cguVersion: LegalVersion,
  privacyVersion: LegalVersion,
});
export type LegalAcceptanceInput = z.infer<typeof LegalAcceptanceInput>;

/** Answer of an acceptance: the exact recorded versions and the traceable acceptance instant. */
export const LegalAcceptanceState = z.object({
  cguVersion: LegalVersion,
  privacyVersion: LegalVersion,
  acceptedAt: IsoDateTime,
  complete: z.literal(true),
});
export type LegalAcceptanceState = z.infer<typeof LegalAcceptanceState>;

export const meLegalAccept = defineRoute({
  id: 'me.legal.accept',
  method: 'POST',
  path: '/api/v1/me/legal-acceptances',
  auth: 'user',
  body: LegalAcceptanceInput,
  output: LegalAcceptanceState,
  successStatus: 200,
  summary:
    'Enregistre l’acceptation des versions actives des CGU et de la confidentialité (SPEC-806).',
  errors: ['VALIDATION_FAILED', 'CONFLICT', 'UNAUTHENTICATED', 'INTERNAL_ERROR'],
});

export const legalRoutes = { meLegalAccept } as const;
export type LegalRoute = keyof typeof legalRoutes;
