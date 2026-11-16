// Local queue of the answers given offline (SPEC-801 EF-7, ET-9). `enqueue` runs before the
// correction is shown and assigns a UUID v4 `clientId`, the idempotency key of the server. The
// queue keeps a rejected entry for seven days (CL-4) then purges it.
import { clock } from '@learny/core';

import {
  deleteQueueEntry,
  pendingCount,
  pendingEntries,
  putQueueEntry,
  queueEntries,
  type QueueEntry,
} from './db';

export type EnqueueInput = Omit<
  QueueEntry,
  'clientId' | 'status' | 'attempts' | 'lastError' | 'answeredAt'
> & { clientId?: string; answeredAt?: string };

const REJECTED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/** EF-7 — stores the entry immediately with a stable `clientId` (idempotence key). */
export async function enqueue(
  input: EnqueueInput,
  now: () => Date = () => clock.now(),
): Promise<QueueEntry> {
  const entry: QueueEntry = {
    ...input,
    clientId: input.clientId ?? crypto.randomUUID(),
    answeredAt: input.answeredAt ?? now().toISOString(),
    status: 'pending',
    attempts: 0,
  };
  await putQueueEntry(entry);
  notifyQueueChanged();
  return entry;
}

/** EF-9 — wakes the header indicator after a local queue change. */
export function notifyQueueChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('learny-offline-queue'));
  }
}

export { pendingCount, pendingEntries, queueEntries, deleteQueueEntry, putQueueEntry };

/** CL-4 — a rejected entry is kept seven days, then removed. */
export async function purgeRejected(now: Date): Promise<number> {
  const entries = await queueEntries();
  let removed = 0;
  for (const entry of entries) {
    if (entry.status !== 'rejected') continue;
    const answeredAt = new Date(entry.answeredAt).getTime();
    if (Number.isNaN(answeredAt) || answeredAt < now.getTime() - REJECTED_RETENTION_MS) {
      await deleteQueueEntry(entry.clientId);
      removed += 1;
    }
  }
  return removed;
}
