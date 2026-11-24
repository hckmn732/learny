// Idempotency keys of the mutations (SPEC-3003 ET-3; canevas § 4, BR-PLA-08).
//
// One UUID per intent, kept until the mutation succeeds: a retry, a 401 replay or an offline
// replay sends the same `Idempotency-Key`, so the server never runs the service twice. The queue
// of persisted intents (`src/offline/queue.ts`) stores the key with the intent (SPEC-3305).
import { uuidV4 } from './uuid';

/** In-memory registry of the key of each intent (ET-3). */
export class IdempotencyRegistry {
  private readonly keys = new Map<string, string>();

  constructor(private readonly generate: () => string = () => uuidV4()) {}

  /** Key of `intentId`, created once and reused until `resolve` (ET-3). */
  keyFor(intentId: string): string {
    const existing = this.keys.get(intentId);
    if (existing !== undefined) return existing;
    const created = this.generate();
    this.keys.set(intentId, created);
    return created;
  }

  /** Forgets the intent once the mutation succeeded: the next attempt gets a new key. */
  resolve(intentId: string): void {
    this.keys.delete(intentId);
  }

  has(intentId: string): boolean {
    return this.keys.has(intentId);
  }

  size(): number {
    return this.keys.size;
  }

  clear(): void {
    this.keys.clear();
  }

  /** Keys currently held, for the persisted intents of the offline queue (SPEC-3305). */
  snapshot(): Readonly<Record<string, string>> {
    return Object.fromEntries(this.keys);
  }
}

/** Registry of the application (one key per intent for the whole process). */
export const idempotencyRegistry = new IdempotencyRegistry();
