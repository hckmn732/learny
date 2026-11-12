// SMTP transport (SPEC-204 ET-5): nodemailer towards Mailpit in local development, without TLS.
import { createTransport, type Transporter } from 'nodemailer';

import { EmailTransientError } from '../errors';
import type { EmailMessage } from '../render';

import type { EmailTransport } from './types';

export function createSmtpTransport(options: { host: string; port: number }): EmailTransport {
  let transporter: Transporter | undefined;
  const mailer = (): Transporter => {
    transporter ??= createTransport({ host: options.host, port: options.port, secure: false });
    return transporter;
  };
  return {
    name: 'smtp',
    async send(message: EmailMessage) {
      try {
        const info = (await mailer().sendMail({
          from: message.from,
          to: message.to,
          subject: message.subject,
          html: message.html,
          text: message.text,
          headers: message.headers,
        })) as { messageId?: string };
        return { messageId: info.messageId ?? `smtp_${String(Date.parse('1970-01-01'))}` };
      } catch (error) {
        // The SMTP server is local infrastructure: any failure is worth a retry.
        throw new EmailTransientError(
          error instanceof Error ? error.message : 'Envoi SMTP impossible.',
        );
      }
    },
  };
}
