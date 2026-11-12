import { z } from 'zod';

import { Empty } from './common';
import { defineRoute } from './define-route';

// E-mail routes of SPEC-204 (ADR-0124): one-click unsubscribe (RFC 8058) and the demonstration
// routes of the templates (ENABLE_SDD_PAGES only, never in production).
export const EMAIL_TEMPLATE_KEYS = [
  'welcome',
  'daily_digest',
  'reminder',
  'weekly_review',
  'ai_task_failed',
  'export_ready',
  'deletion_scheduled',
  'deletion_completed',
] as const;
export const EMAIL_TONES = ['vous', 'tu'] as const;
export const EMAIL_CATEGORIES = ['service', 'transactional'] as const;

export const EmailTemplateKey = z.enum(EMAIL_TEMPLATE_KEYS);
export type EmailTemplateKey = z.infer<typeof EmailTemplateKey>;
export const EmailTone = z.enum(EMAIL_TONES);
export type EmailTone = z.infer<typeof EmailTone>;

export const UnsubscribeQuery = z.object({ token: z.string().min(1).max(256) });
export type UnsubscribeQuery = z.infer<typeof UnsubscribeQuery>;

export const UnsubscribeResult = z.object({ ok: z.literal(true) });
export type UnsubscribeResult = z.infer<typeof UnsubscribeResult>;

export const EmailPreviewQuery = z.object({ template: EmailTemplateKey, tone: EmailTone });
export type EmailPreviewQuery = z.infer<typeof EmailPreviewQuery>;

export const EmailPreview = z.object({
  template: EmailTemplateKey,
  tone: EmailTone,
  category: z.enum(EMAIL_CATEGORIES),
  subject: z.string(),
  html: z.string(),
  text: z.string(),
  headers: z.record(z.string(), z.string()),
});
export type EmailPreview = z.infer<typeof EmailPreview>;

export const EmailSendInput = z.object({ template: EmailTemplateKey, tone: EmailTone });
export type EmailSendInput = z.infer<typeof EmailSendInput>;

export const EmailSendResult = z.object({
  messageId: z.string(),
  transport: z.enum(['resend', 'smtp', 'memory']),
});
export type EmailSendResult = z.infer<typeof EmailSendResult>;

export const EmailOutboxItem = z.object({
  to: z.string(),
  subject: z.string(),
  headers: z.record(z.string(), z.string()),
  template: z.string(),
  at: z.string(),
});
export type EmailOutboxItem = z.infer<typeof EmailOutboxItem>;

export const EmailOutbox = z.object({ items: z.array(EmailOutboxItem) });
export type EmailOutbox = z.infer<typeof EmailOutbox>;

export const emailUnsubscribePost = defineRoute({
  id: 'email.unsubscribe',
  method: 'POST',
  path: '/api/v1/email/unsubscribe',
  auth: 'public',
  query: UnsubscribeQuery,
  output: UnsubscribeResult,
  successStatus: 200,
  rateLimit: 'auth',
  summary:
    'Désinscription en un clic (RFC 8058) : coupe les e-mails de service ; page HTML de confirmation, ou JSON avec Accept: application/json.',
  errors: ['UNSUBSCRIBE_TOKEN_INVALID'],
});

export const emailUnsubscribeGet = defineRoute({
  id: 'email.unsubscribe.page',
  method: 'GET',
  path: '/api/v1/email/unsubscribe',
  auth: 'public',
  query: UnsubscribeQuery,
  output: Empty,
  successStatus: 200,
  rateLimit: 'auth',
  summary: 'Page de désinscription (formulaire POST) ; aucun changement d’état.',
  errors: ['UNSUBSCRIBE_TOKEN_INVALID'],
});

export const devEmailPreview = defineRoute({
  id: 'dev.email.preview',
  method: 'GET',
  path: '/api/v1/dev/sdd/email/preview',
  auth: 'user',
  query: EmailPreviewQuery,
  output: EmailPreview,
  successStatus: 200,
  summary:
    'Route de démonstration : aperçu d’un gabarit avec les données d’exemple (JSON, ou text/html sans Accept: application/json) (SPEC-204).',
  errors: ['VALIDATION_FAILED'],
});

export const devEmailSend = defineRoute({
  id: 'dev.email.send',
  method: 'POST',
  path: '/api/v1/dev/sdd/email/send',
  auth: 'user',
  body: EmailSendInput,
  output: EmailSendResult,
  successStatus: 201,
  idempotent: true,
  summary: 'Route de démonstration : envoie un gabarit à l’utilisateur connecté (SPEC-204).',
  errors: ['VALIDATION_FAILED', 'IDEMPOTENCY_IN_PROGRESS', 'NOT_FOUND'],
});

export const devEmailOutbox = defineRoute({
  id: 'dev.email.outbox',
  method: 'GET',
  path: '/api/v1/dev/sdd/email/outbox',
  auth: 'user',
  output: EmailOutbox,
  successStatus: 200,
  summary: 'Route de démonstration : boîte d’envoi du transport mémoire (SPEC-204).',
  errors: [],
});

export const emailRoutes = { emailUnsubscribePost, emailUnsubscribeGet } as const;
export const devEmailRoutes = { devEmailPreview, devEmailSend, devEmailOutbox } as const;
