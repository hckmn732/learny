import { meAiCredentialsDelete } from '@learny/contracts';
import { deleteCredential } from '@learny/services/ai/credentials';

import { handler } from '../../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// SPEC-505 EF-3: removes the task assignments then the credential; another learner's id is a 404.
export const DELETE = handler(meAiCredentialsDelete, async ({ ctx, params }) => {
  const result = await deleteCredential(ctx, params.id);
  return result.ok ? undefined : result;
});
