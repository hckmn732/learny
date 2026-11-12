// Resend transport (SPEC-204 ET-5, CL-2): one API call per message with the idempotency key of the
// caller; 429, 5xx and network failures are transient, every other 4xx is a definitive rejection.
import { Resend } from 'resend';

import { EmailRejectedError, EmailTransientError } from '../errors';
import type { EmailMessage } from '../render';

import type { EmailTransport } from './types';

export const RESEND_TIMEOUT_MS = 10_000;

export function isTransientStatus(status: number | null): boolean {
  return status === null || status === 429 || status >= 500;
}

export function createResendTransport(options: {
  apiKey: string;
  timeoutMs?: number;
}): EmailTransport {
  const resend = new Resend(options.apiKey);
  const timeoutMs = options.timeoutMs ?? RESEND_TIMEOUT_MS;
  return {
    name: 'resend',
    async send(message: EmailMessage, { idempotencyKey }) {
      const { data, error } = await resend.emails.send(
        {
          from: message.from,
          to: message.to,
          subject: message.subject,
          html: message.html,
          text: message.text,
          headers: message.headers,
          tags: message.tags,
        },
        { idempotencyKey, signal: AbortSignal.timeout(timeoutMs) },
      );
      if (error !== null) {
        const status = error.statusCode;
        if (isTransientStatus(status)) {
          throw new EmailTransientError(`Resend indisponible (${error.name}).`, status);
        }
        throw new EmailRejectedError(`Resend a refusé le message (${error.name}).`, status ?? 400);
      }
      return { messageId: data.id };
    },
  };
}
