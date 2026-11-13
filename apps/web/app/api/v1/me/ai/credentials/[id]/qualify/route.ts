import { meAiCredentialsQualify } from '@learny/contracts';
import { qualifyCredential } from '@learny/services/ai/qualify';

import { handler } from '../../../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// SPEC-506 EF-3: qualifies one model of the caller's key. The report never carries the key or any
// ciphertext; another learner's identifier is invisible under RLS and answers CREDENTIAL_NOT_FOUND.
export const POST = handler(meAiCredentialsQualify, ({ ctx, params, body }) =>
  qualifyCredential(ctx, params.id, body.modelId),
);
