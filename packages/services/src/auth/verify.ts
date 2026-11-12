// Callback of the e-mailed link (SPEC-202 EF-6, ADR-0121): the token hash is verified on the
// server and the session cookies are written by the Auth client.
import { CALLBACK_TYPES } from '@learny/contracts';

import type { ServiceContext } from '../context';

import type { AuthDeps } from './client';
import { isSafeNextPath, resolvePostAuthDestination } from './destination';
import { finalizeFirstVerification, loadDestinationProfile } from './finalize';

export const INVALID_LINK_DESTINATION = '/connexion?erreur=lien-invalide';

export type CallbackType = (typeof CALLBACK_TYPES)[number];

/** Returns the path to redirect to; any failure leads to the invalid-link page (CL-1, CL-2). */
export async function completeVerification(
  ctx: ServiceContext,
  input: { tokenHash: string; type: CallbackType; next?: string | undefined },
  deps: AuthDeps,
): Promise<string> {
  try {
    const { data, error } = await deps.auth.verifyOtp({
      token_hash: input.tokenHash,
      type: input.type,
    });
    if (error !== null || data.user === null) return INVALID_LINK_DESTINATION;
    await finalizeFirstVerification(ctx, data.user.id, 'magic_link');
    const profile = await loadDestinationProfile(data.user.id);
    return resolvePostAuthDestination(profile, isSafeNextPath(input.next) ? input.next : undefined);
  } catch {
    ctx.logger.warn('verification failed', { code: 'SERVICE_UNAVAILABLE' });
    return INVALID_LINK_DESTINATION;
  }
}
