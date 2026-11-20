import {
  meAiCredentialsCreate,
  meAiCredentialsDelete,
  meAiCredentialsDiscover,
  meAiCredentialsList,
  meAiCredentialsQualify,
} from '@learny/contracts';
import type { HandlerArgs } from '@learny/http/route-handler';
import {
  createCredential,
  deleteCredential,
  discoverCredentialModels,
  listCredentials,
} from '@learny/services/ai/credentials';
import { qualifyCredential } from '@learny/services/ai/qualify';

// SPEC-1004 ET-1 - implementations of the `ai-credentials` contract, moved verbatim from the Next route
// files so that `apps/api` (SPEC-1101) serves exactly the same code.
export const aiCredentialsImplementations = {
  meAiCredentialsQualify: ({ ctx, params, body }: HandlerArgs<typeof meAiCredentialsQualify>) =>
    qualifyCredential(ctx, params.id, body.modelId),
  meAiCredentialsDelete: async ({ ctx, params }: HandlerArgs<typeof meAiCredentialsDelete>) => {
    const result = await deleteCredential(ctx, params.id);
    return result.ok ? undefined : result;
  },
  meAiCredentialsCreate: ({ ctx, body }: HandlerArgs<typeof meAiCredentialsCreate>) =>
    createCredential(ctx, body),
  meAiCredentialsDiscover: ({ ctx, body }: HandlerArgs<typeof meAiCredentialsDiscover>) =>
    discoverCredentialModels(ctx, body),
  meAiCredentialsList: async ({ ctx }: HandlerArgs<typeof meAiCredentialsList>) => {
    const result = await listCredentials(ctx);
    return result.ok ? { items: result.value } : result;
  },
};
