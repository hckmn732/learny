// Simulated provider of the e2e builds (SPEC-3402 ET-3, CA-2).
//
// Real Apple and Google identifiers are not available to the project (see acceptance.md): the e2e
// build replaces the provider window by a sign-in of a dedicated account that the campaign
// provisions without any legal acceptance. Everything upstream is the production code — session,
// legal gate, profile name, navigation — so CA-2 is proved end to end without a provider secret.
import { supabase } from '../supabase';

import { providerName, type ProviderAdapter, type ProviderId, type ProviderResult } from './types';

/** Account provisioned by `e2e/prepare-oauth-user.mjs`; never set outside an e2e build. */
function mockCredentials(): { email: string; password: string } {
  const email = (process.env.EXPO_PUBLIC_SDD_OAUTH_EMAIL as string | undefined) ?? '';
  const password = (process.env.EXPO_PUBLIC_SDD_OAUTH_PASSWORD as string | undefined) ?? '';
  if (email === '' || password === '') {
    throw new Error('Compte du fournisseur simulé absent du build e2e.');
  }
  return { email, password };
}

/** Name announced by the simulated provider (EF-2); fixed, so the campaign is deterministic. */
export const MOCK_PROVIDER_NAME = { firstName: 'Camille', lastName: 'Durand' } as const;

export function createMockProvider(id: ProviderId): ProviderAdapter {
  return {
    id,
    isAvailable(): Promise<boolean> {
      return Promise.resolve(true);
    },
    async signIn(): Promise<ProviderResult> {
      const { email, password } = mockCredentials();
      const { error } = await supabase().auth.signInWithPassword({ email, password });
      if (error !== null) throw error;
      return {
        status: 'session',
        name: providerName(MOCK_PROVIDER_NAME.firstName, MOCK_PROVIDER_NAME.lastName),
      };
    },
  };
}
