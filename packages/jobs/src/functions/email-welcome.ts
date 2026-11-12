// Welcome e-mail (SPEC-204 ET-6, EF-6, ADR-0124): sent once after `user/signed-up`, immediately,
// outside the daily cap and the quiet hours (direct answer to an action of the learner), but only
// when `notification_settings.channel_email` is true. A replay reuses the same idempotency key,
// so the transport deduplicates (CL-1).
import { eq } from 'drizzle-orm';
import { NonRetriableError } from 'inngest';

import { schema, type Db } from '@learny/db';
import { canSendServiceEmail, isRejectedEmailError, sendEmail } from '@learny/notifications/email';

import { defineFunction } from '../define';

export const EMAIL_WELCOME_ID = 'email-welcome';

export const welcomeIdempotencyKey = (userId: string): string => `welcome:${userId}`;

export const emailWelcome = defineFunction(
  { id: EMAIL_WELCOME_ID, trigger: { event: 'user/signed-up' }, idempotency: 'event.data.userId' },
  async ({ event, step, ctx, logger }) => {
    const { userId } = event.data;
    const allowed = await step.run('check-preference', () => canSendServiceEmail(ctx, userId));
    if (!allowed) {
      logger.info('welcome e-mail skipped', { userId, outcome: 'email_channel_off' });
      return { sent: false as const };
    }
    const messageId = await step.run('send', async () => {
      try {
        const result = await sendEmail(ctx, {
          userId,
          template: 'welcome',
          props: { firstName: await firstNameOf(ctx, userId) },
          idempotencyKey: welcomeIdempotencyKey(userId),
        });
        if (!result.ok) {
          // Profile gone or invalid data: a retry would not change anything.
          throw new NonRetriableError(result.error.code);
        }
        return result.value.messageId;
      } catch (error) {
        if (isRejectedEmailError(error)) {
          throw new NonRetriableError(error.message, { cause: error });
        }
        throw error;
      }
    });
    return { sent: true as const, messageId };
  },
);

async function firstNameOf(ctx: { sdb: Db }, userId: string): Promise<string | null> {
  const [row] = await ctx.sdb
    .select({ firstName: schema.profiles.firstName })
    .from(schema.profiles)
    .where(eq(schema.profiles.id, userId))
    .limit(1);
  return row?.firstName ?? null;
}
