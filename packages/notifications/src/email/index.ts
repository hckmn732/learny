// Public API of @learny/notifications/email (SPEC-204 ET-1).
export { EMAIL_FIXTURES, FIXTURE_USER, fixtureFor } from '../../emails/fixtures';
export { EMAIL_COLORS, PREFERENCES_PATH, PREVIEW_FRAME } from '../../emails/layout';
export type { EmailCategory, EmailFrame } from '../../emails/layout';
export { EMAIL_PROPS_SCHEMAS, EMAIL_TEMPLATE_KEYS, isEmailTemplateKey } from '../../emails/schemas';
export type { EmailProps, EmailTemplateKey } from '../../emails/schemas';
export { TONES, isTone, same, t } from '../../emails/tone';
export type { Tone, ToneVariants } from '../../emails/tone';
export {
  DEFAULT_APP_URL,
  DEFAULT_EMAIL_FROM,
  emailConfig,
  readEmailConfig,
  resetEmailConfig,
} from './config';
export type { EmailConfig } from './config';
export {
  EmailRejectedError,
  EmailTransientError,
  isRejectedEmailError,
  isTransientEmailError,
} from './errors';
export { UNSUBSCRIBE_PATH, renderEmail, unsubscribeUrl } from './render';
export type { EmailMessage, RenderOptions, RenderedEmail } from './render';
export { canSendServiceEmail, disableEmailChannel, sendEmail } from './send';
export type { EmailContext, SendEmailArgs, SendEmailResult } from './send';
export { EMAIL_TEMPLATES, templateOf } from './templates';
export type { EmailTemplateDefinition } from './templates';
export { getTransport, setTransport } from './transports';
export { clearOutbox, listOutbox, memoryTransport } from './transports/memory';
export type { OutboxEntry } from './transports/memory';
export { RESEND_TIMEOUT_MS, createResendTransport, isTransientStatus } from './transports/resend';
export { createSmtpTransport } from './transports/smtp';
export type { EmailTransport, EmailTransportName } from './transports/types';
export { createUnsubscribeToken, verifyUnsubscribeToken } from './unsubscribe-token';
