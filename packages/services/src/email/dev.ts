// Demonstration services of SPEC-204 (ENABLE_SDD_PAGES only): preview of a template with the
// sample data, send to the signed-in learner, memory outbox.
import { randomUUID } from 'node:crypto';

import type { EmailOutbox, EmailPreview, EmailSendInput, EmailSendResult } from '@learny/contracts';
import { AppError, type Result } from '@learny/core';
import { serviceDb } from '@learny/db';
import {
  EMAIL_TEMPLATES,
  fixtureFor,
  getTransport,
  listOutbox,
  renderEmail,
  sendEmail,
  type EmailTemplateKey,
  type Tone,
} from '@learny/notifications/email';

import type { ServiceContext } from '../context';

const PREVIEW_USER_ID = '00000000-0000-4000-8000-000000000204';

export async function previewEmail(
  ctx: ServiceContext,
  input: { template: EmailTemplateKey; tone: Tone },
): Promise<EmailPreview> {
  const rendered = await renderEmail(input.template, fixtureFor(input.template, input.tone), {
    tone: input.tone,
    userId: ctx.userId ?? PREVIEW_USER_ID,
  });
  return {
    template: input.template,
    tone: input.tone,
    category: EMAIL_TEMPLATES[input.template].category,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    headers: rendered.headers,
  };
}

export async function sendDemoEmail(
  ctx: ServiceContext,
  input: EmailSendInput,
): Promise<Result<EmailSendResult>> {
  if (ctx.userId === null) throw new AppError('UNAUTHENTICATED', 'Vous devez être connecté.');
  const result = await sendEmail(
    { sdb: serviceDb(), clock: ctx.clock, logger: ctx.logger },
    {
      userId: ctx.userId,
      template: input.template,
      props: fixtureFor(input.template, input.tone),
      // One message per click: the wrapper's Idempotency-Key deduplicates the HTTP replays.
      idempotencyKey: `sdd-204:${input.template}:${randomUUID()}`,
      toneOverride: input.tone,
    },
  );
  if (!result.ok) return result;
  return { ok: true, value: { messageId: result.value.messageId, transport: getTransport().name } };
}

export function listDemoOutbox(): EmailOutbox {
  if (getTransport().name !== 'memory') return { items: [] };
  return {
    items: listOutbox().map((entry) => ({
      to: entry.message.to,
      subject: entry.message.subject,
      headers: entry.message.headers,
      template: entry.message.tags.find((tag) => tag.name === 'template')?.value ?? '',
      at: entry.at,
    })),
  };
}
