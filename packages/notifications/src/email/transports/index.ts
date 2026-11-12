// Transport of the process, chosen by `EMAIL_MODE` (SPEC-204 ET-5, ADR-0054).
import { emailConfig } from '../config';

import { memoryTransport } from './memory';
import { createResendTransport } from './resend';
import { createSmtpTransport } from './smtp';
import type { EmailTransport } from './types';

let current: EmailTransport | undefined;

export function getTransport(): EmailTransport {
  if (current !== undefined) return current;
  const config = emailConfig();
  if (config.mode === 'memory') {
    if (config.isProduction) throw new Error('EMAIL_MODE=memory est interdit en production.');
    current = memoryTransport;
  } else if (config.mode === 'smtp') {
    current = createSmtpTransport(config.smtp);
  } else {
    if (config.resendApiKey === undefined) {
      throw new Error('Configuration e-mail invalide : EMAIL_MODE=resend exige RESEND_API_KEY.');
    }
    current = createResendTransport({ apiKey: config.resendApiKey });
  }
  return current;
}

/** Replaces the transport (tests); returns a function restoring the configured one. */
export function setTransport(transport: EmailTransport | undefined): () => void {
  current = transport;
  return () => {
    current = undefined;
  };
}
