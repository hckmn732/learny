// One-click unsubscribe (SPEC-204 EF-5, ET-7, ADR-0124). The only public write of the API: it
// accepts the signed token alone, updates `notification_settings.channel_email` with the owner
// role (authorised usage) and never reveals the address.
import { AppError, err, ok, type Result } from '@learny/core';
import { serviceDb } from '@learny/db';
import {
  disableEmailChannel,
  emailConfig,
  verifyUnsubscribeToken,
} from '@learny/notifications/email';

import type { ServiceContext } from '../context';

/** The learner of a valid token, `null` for an altered or forged one (CL-5). */
export function readUnsubscribeToken(token: string): string | null {
  return verifyUnsubscribeToken(emailConfig().linkSecret, token);
}

export function invalidUnsubscribeToken(): AppError {
  return new AppError('UNSUBSCRIBE_TOKEN_INVALID', 'Ce lien n’est plus valide.');
}

export async function unsubscribeByToken(
  ctx: ServiceContext,
  token: string,
): Promise<Result<{ ok: true }>> {
  const userId = readUnsubscribeToken(token);
  if (userId === null) return err(invalidUnsubscribeToken());
  const updated = await disableEmailChannel(
    { sdb: serviceDb(), clock: ctx.clock, logger: ctx.logger },
    userId,
  );
  // A deleted account has no settings row: the link is treated as expired, nothing is revealed.
  if (!updated) return err(invalidUnsubscribeToken());
  ctx.logger.info('email channel disabled', { userId, outcome: 'unsubscribed' });
  return ok({ ok: true });
}
