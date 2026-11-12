import type { EmailMessage } from '../render';

export type EmailTransportName = 'resend' | 'smtp' | 'memory';

export interface EmailTransport {
  name: EmailTransportName;
  send(message: EmailMessage, options: { idempotencyKey: string }): Promise<{ messageId: string }>;
}
