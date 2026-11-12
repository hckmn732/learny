// Sending of a template to a learner (SPEC-204 ET-1, EF-1). The profile is read with the owner
// role (authorised usage: address and tone of the recipient). `sendEmail` never checks
// `channel_email`: the caller does (SPEC-209), the welcome function does it itself (EF-6).
import { eq } from 'drizzle-orm';

import { AppError, err, ok, type Clock, type LearnyLogger, type Result } from '@learny/core';
import { schema, type Db } from '@learny/db';

import type { EmailCategory } from '../../emails/layout';
import type { EmailProps, EmailTemplateKey } from '../../emails/schemas';
import { isTone, type Tone } from '../../emails/tone';

import { emailConfig } from './config';
import { renderEmail, type EmailMessage } from './render';
import { EMAIL_TEMPLATES } from './templates';
import { getTransport } from './transports';

/** Structural subset of the services `SystemContext` and of the jobs `JobContext`. */
export interface EmailContext {
  sdb: Db;
  clock: Clock;
  logger: LearnyLogger;
}

export interface SendEmailArgs<K extends EmailTemplateKey> {
  userId: string;
  template: K;
  props: EmailProps<K>;
  idempotencyKey: string;
  /** `deletion_completed`: address captured before the profile was deleted. */
  toOverride?: string;
  toneOverride?: Tone;
}

export interface SendEmailResult {
  messageId: string;
  category: EmailCategory;
}

const { profiles, notificationSettings } = schema;

export async function sendEmail<K extends EmailTemplateKey>(
  ctx: EmailContext,
  args: SendEmailArgs<K>,
): Promise<Result<SendEmailResult>> {
  const template = EMAIL_TEMPLATES[args.template];
  const parsed = template.propsSchema.safeParse(args.props);
  if (!parsed.success) {
    return err(
      new AppError('VALIDATION_FAILED', 'Données du gabarit invalides.', {
        errors: parsed.error.issues.map((issue) => ({
          path: issue.path.map(String).join('.'),
          message: issue.message,
        })),
      }),
    );
  }

  const [profile] = await ctx.sdb
    .select({ email: profiles.email, tutorTone: profiles.tutorTone })
    .from(profiles)
    .where(eq(profiles.id, args.userId))
    .limit(1);
  if (profile === undefined && args.toOverride === undefined) {
    return err(new AppError('NOT_FOUND', 'Profil introuvable.'));
  }
  const tone: Tone =
    args.toneOverride ??
    (profile !== undefined && isTone(profile.tutorTone) ? profile.tutorTone : 'vous');
  const to = args.toOverride ?? profile?.email;
  if (to === undefined) return err(new AppError('NOT_FOUND', 'Profil introuvable.'));

  const rendered = await renderEmail(args.template, parsed.data, { tone, userId: args.userId });
  const message: EmailMessage = {
    ...rendered,
    to,
    from: emailConfig().from,
    headers: { ...rendered.headers, 'X-Entity-Ref-ID': args.idempotencyKey },
  };
  const transport = getTransport();
  const { messageId } = await transport.send(message, { idempotencyKey: args.idempotencyKey });
  // The log never carries the address (docs/engineering/conventions.md §8).
  ctx.logger.info('email sent', {
    userId: args.userId,
    template: args.template,
    component: transport.name,
    outcome: template.category,
    messageId,
  });
  return ok({ messageId, category: template.category });
}

/** `notification_settings.channel_email` of the learner; a missing row never allows a send. */
export async function canSendServiceEmail(ctx: EmailContext, userId: string): Promise<boolean> {
  const [row] = await ctx.sdb
    .select({ channelEmail: notificationSettings.channelEmail })
    .from(notificationSettings)
    .where(eq(notificationSettings.userId, userId))
    .limit(1);
  return row?.channelEmail === true;
}

/** Sets `channel_email = false` for the learner (one-click unsubscribe, ADR-0124). */
export async function disableEmailChannel(ctx: EmailContext, userId: string): Promise<boolean> {
  const updated = await ctx.sdb
    .update(notificationSettings)
    .set({ channelEmail: false, updatedAt: ctx.clock.now() })
    .where(eq(notificationSettings.userId, userId))
    .returning({ userId: notificationSettings.userId });
  return updated.length > 0;
}
