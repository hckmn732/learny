// Inspection of the e-mails sent during a test (SPEC-204 §8 step 6, docs/engineering/testing.md
// §3): the memory outbox of `@learny/notifications` in unit and integration tests, Mailpit
// (`MAILPIT_URL`, `GET /api/v1/messages`) when the SMTP transport is exercised.
import { clearOutbox, listOutbox, type OutboxEntry } from '@learny/notifications/email';

import { listMail, mailpitUrl, waitForMail, type MailMessage } from './auth';

export type { OutboxEntry } from '@learny/notifications/email';

/** Messages of the memory transport, optionally those addressed to one recipient. */
export function memoryMail(to?: string): readonly OutboxEntry[] {
  const entries = listOutbox();
  return to === undefined ? entries : entries.filter((entry) => entry.message.to === to);
}

export function clearMemoryMail(): void {
  clearOutbox();
}

/** Whether Mailpit answers on `MAILPIT_URL` (SMTP tests are skipped otherwise). */
export async function mailpitAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${mailpitUrl()}/api/v1/messages?limit=1`);
    return response.ok;
  } catch {
    return false;
  }
}

/** Latest messages Mailpit received (all recipients). */
export async function listMailpitMessages(limit = 50): Promise<MailMessage[]> {
  const base = mailpitUrl();
  const response = await fetch(`${base}/api/v1/messages?limit=${String(limit)}`);
  if (!response.ok) throw new Error(`Mailpit ${String(response.status)} sur ${base}`);
  const body = (await response.json()) as {
    messages: { ID: string; Subject: string; To: { Address: string }[] }[];
  };
  return body.messages.map((entry) => ({
    id: entry.ID,
    subject: entry.Subject,
    to: entry.To[0]?.Address ?? '',
    html: '',
    text: '',
  }));
}

export { listMail as listMailpitMail, mailpitUrl, waitForMail as waitForMailpitMail };
