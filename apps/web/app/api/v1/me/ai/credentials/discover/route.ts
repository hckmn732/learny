import { meAiCredentialsDiscover } from '@learny/contracts';
import { discoverCredentialModels } from '@learny/services/ai/credentials';

import { handler } from '../../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const POST = handler(meAiCredentialsDiscover, ({ ctx, body }) =>
  discoverCredentialModels(ctx, body),
);
