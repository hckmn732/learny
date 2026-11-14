// Deterministic shuffle of the game displays (SPEC-702 ET-7). The seed is the brick version id,
// so the browser never reveals the pair order and a reload always renders the same layout. FNV-1a
// hashes the seed, mulberry32 generates the Fisher-Yates swaps: no Math.random, no clock.

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const MULBERRY_INCREMENT = 0x6d2b79f5;
const UINT32 = 4_294_967_296;

/** FNV-1a 32-bit hash of a string, in UTF-16 code units. */
export function hashSeed(seed: string): number {
  let hash = FNV_OFFSET;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

/** mulberry32: a small deterministic PRNG returning numbers in [0, 1). */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + MULBERRY_INCREMENT) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / UINT32;
  };
}

/**
 * Returns a shuffled copy of `items` (Fisher-Yates). Same seed and same input always give the same
 * permutation; the input array is never mutated.
 */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const result = [...items];
  const random = mulberry32(hashSeed(seed));
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    const current = result[index] as T;
    result[index] = result[swap] as T;
    result[swap] = current;
  }
  return result;
}
