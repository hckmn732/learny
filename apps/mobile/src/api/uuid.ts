// Identifier of a request or of an intent (SPEC-3003 EF-2, ET-3).
//
// The application passes `randomUUID` of `expo-crypto` (a real CSPRNG); this module keeps the
// generator pure so the unit tests, the tools and the demonstration pages do not need a native
// runtime. A request identifier is not a secret: it only correlates a request with the server log.
const SEPARATORS = [8, 13, 18, 23] as const;
const HEX = '0123456789abcdef';

function digit(random: () => number, modulo: number, offset = 0): string {
  const index = (Math.floor(random() * modulo) + offset) % HEX.length;
  return HEX.charAt(index);
}

/** RFC 4122 v4 shaped identifier from a random source (`0 ≤ value < 1`). */
export function uuidV4(random: () => number = Math.random): string {
  let out = '';
  for (let index = 0; index < 36; index += 1) {
    if (SEPARATORS.includes(index as (typeof SEPARATORS)[number])) out += '-';
    else if (index === 14) out += '4';
    else if (index === 19) out += digit(random, 4, 8);
    else out += digit(random, 16);
  }
  return out;
}
