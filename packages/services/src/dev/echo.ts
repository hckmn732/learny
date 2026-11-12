// Demonstration services of SPEC-201 (idempotence and pagination), without any persistence.
import {
  encodeCursor,
  decodeCursor,
  type DevItem,
  type EchoInput,
  type EchoOutput,
} from '@learny/contracts';
import { AppError, err, ok, type Result } from '@learny/core';

import type { ServiceContext } from '../context';

export const DEV_ITEM_COUNT = 57;

let executions = 0;

/** Number of effective executions since the process started (proves the absence of re-execution). */
export function devEchoExecutions(): number {
  return executions;
}

export function resetDevEchoCounter(): void {
  executions = 0;
}

export function devEcho(ctx: ServiceContext, input: EchoInput): Result<EchoOutput> {
  if (input.fail === 'business') {
    return err(
      new AppError(
        'FORMATION_LIMIT_REACHED',
        'Vous avez déjà trois formations actives : archivez-en une pour en créer une autre.',
      ),
    );
  }
  if (input.fail === 'crash') throw new Error('démonstration : défaillance inattendue');
  executions += 1;
  return ok({
    message: input.message,
    receivedAt: ctx.clock.now().toISOString(),
    counter: executions,
  });
}

function item(position: number): DevItem {
  const label = `item-${String(position).padStart(2, '0')}`;
  return { id: label, label, position };
}

/** 57 deterministic items, sorted by `(position desc, id desc)` like a real repository (ET-5). */
export function listDevItems(
  _ctx: ServiceContext,
  query: { cursor?: string | undefined; limit: number },
): Result<{ items: DevItem[]; nextCursor: string | null }> {
  let from = DEV_ITEM_COUNT;
  if (query.cursor !== undefined) {
    const decoded = decodeCursor(query.cursor);
    // A cursor made for another list (string key) simply yields an empty page (CL-9).
    if (decoded !== null && typeof decoded.k !== 'number') {
      return ok({ items: [], nextCursor: null });
    }
    if (decoded === null) {
      return err(
        new AppError('VALIDATION_FAILED', 'Le curseur de pagination est illisible.', {
          errors: [{ path: 'query.cursor', message: 'Curseur invalide.' }],
        }),
      );
    }
    from = Math.min(DEV_ITEM_COUNT, Math.max(0, Math.trunc(decoded.k as number)) - 1);
  }
  const rows: DevItem[] = [];
  for (let position = from; position >= 1 && rows.length < query.limit + 1; position -= 1) {
    rows.push(item(position));
  }
  const hasMore = rows.length > query.limit;
  const items = rows.slice(0, query.limit);
  const last = items.at(-1);
  return ok({
    items,
    nextCursor:
      hasMore && last !== undefined ? encodeCursor({ k: last.position, id: last.id }) : null,
  });
}
