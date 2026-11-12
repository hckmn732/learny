// Deterministic pseudo-randomness of the public payloads (ET-7). Same seed, same order, in the
// browser and on the server: no Math.random, no system state.
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const MULBERRY_INCREMENT = 0x6d2b79f5;
const UINT32 = 4_294_967_296;

/** FNV-1a 32-bit hash of a string (UTF-16 code units, in order). */
export function hash32(text: string): number {
  let hash = FNV_OFFSET;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

/** mulberry32 seeded by a 32-bit integer; every call returns a number in [0, 1). */
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

export function createSeededRandom(seed: string): () => number {
  return mulberry32(hash32(seed));
}

/** Fisher-Yates with the generator of `seed`; the input is never mutated. */
export function shuffleSeeded<T>(items: readonly T[], seed: string): T[] {
  const result = [...items];
  const random = createSeededRandom(seed);
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    const current = result[index] as T;
    result[index] = result[swap] as T;
    result[swap] = current;
  }
  return result;
}
