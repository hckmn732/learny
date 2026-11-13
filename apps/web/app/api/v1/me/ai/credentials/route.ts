import { meAiCredentialsCreate, meAiCredentialsList } from '@learny/contracts';
import { createCredential, listCredentials } from '@learny/services/ai/credentials';

import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// SPEC-505 EF-1: creates a personal key; the body is never logged and the answer is the masked DTO.
export const POST = handler(meAiCredentialsCreate, ({ ctx, body }) => createCredential(ctx, body));

// SPEC-505 EF-2: oldest first, at most ten, never the key.
export const GET = handler(meAiCredentialsList, async ({ ctx }) => {
  const result = await listCredentials(ctx);
  return result.ok ? { items: result.value } : result;
});
