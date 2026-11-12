// Deterministic pseudo-randomness of the engine (SPEC-401 ET-5, ADR-0140): FNV-1a 32 bits over the
// UTF-16 code units, then mulberry32. No Math.random, no system state: a seed always replays the
// same sequence, in tests and in production.
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const MULBERRY_INCREMENT = 0x6d2b79f5;
const UINT32 = 4_294_967_296;

/** FNV-1a 32-bit hash of a string (each UTF-16 code unit is hashed in order). */
export function fnv1a32(text: string): number {
  let hash = FNV_OFFSET;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

/**
 * mulberry32 generator seeded by `fnv1a32(seed)`. Every call returns a number in [0, 1); an empty
 * seed is valid and reproducible (CL-8).
 */
export function createSeededRandom(seed: string): () => number {
  let state = fnv1a32(seed);
  return () => {
    state = (state + MULBERRY_INCREMENT) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / UINT32;
  };
}

/**
 * Returns a new array sorted by `fnv1a32(seed + '|' + key(item))`, then by key on a hash tie. The
 * input is never mutated; equal keys keep their input order (stable sort).
 */
export function stableShuffle<T>(items: readonly T[], seed: string, key: (item: T) => string): T[] {
  const hashed = items.map((item, index) => ({
    item,
    index,
    hash: fnv1a32(`${seed}|${key(item)}`),
    sortKey: key(item),
  }));
  hashed.sort((left, right) => {
    if (left.hash !== right.hash) return left.hash - right.hash;
    if (left.sortKey < right.sortKey) return -1;
    if (left.sortKey > right.sortKey) return 1;
    return left.index - right.index;
  });
  return hashed.map((entry) => entry.item);
}
