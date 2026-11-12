// In-memory transport (SPEC-204 ET-5): the outbox of the unit, integration and e2e tests. A second
// send with the same idempotency key returns the same message identifier without a new entry.
import { randomUUID } from 'node:crypto';

import { clock } from '@learny/core';

import type { EmailMessage } from '../render';

import type { EmailTransport } from './types';

export interface OutboxEntry {
  messageId: string;
  idempotencyKey: string;
  /** ISO instant of the send (injectable clock, ADR-0047). */
  at: string;
  message: EmailMessage;
}

const outbox: OutboxEntry[] = [];

export const memoryTransport: EmailTransport = {
  name: 'memory',
  send(message, { idempotencyKey }) {
    const existing = outbox.find((entry) => entry.idempotencyKey === idempotencyKey);
    if (existing !== undefined) return Promise.resolve({ messageId: existing.messageId });
    const entry: OutboxEntry = {
      messageId: `mem_${randomUUID()}`,
      idempotencyKey,
      at: clock.now().toISOString(),
      message,
    };
    outbox.push(entry);
    return Promise.resolve({ messageId: entry.messageId });
  },
};

/** Messages sent so far, oldest first (copies: the outbox cannot be altered from outside). */
export function listOutbox(): readonly OutboxEntry[] {
  return outbox.map((entry) => ({ ...entry, message: { ...entry.message } }));
}

export function clearOutbox(): void {
  outbox.length = 0;
}
