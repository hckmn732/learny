// Nonce of the Apple request (SPEC-3402 EF-2; ADR-3008 § 7).
//
// Apple receives the SHA-256 hash of a random nonce and puts it in the identity token; Supabase
// receives the raw nonce and checks the match. Both the random source and the digest are injected,
// so the rule is proved in Node (Vitest) without the native crypto module.
export const NONCE_BYTES = 16;

const HEX = /^[0-9a-f]+$/;

/** Hexadecimal form of a byte array (lower case, two digits per byte). */
export function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

/** Random nonce of `NONCE_BYTES` bytes, in hexadecimal. */
export function createNonce(randomBytes: () => Uint8Array): string {
  const nonce = toHex(randomBytes());
  if (nonce === '') throw new Error('Nonce vide : 16 octets aléatoires attendus.');
  return nonce;
}

/** SHA-256 hash of the nonce, sent to Apple; the raw nonce goes to Supabase. */
export async function hashNonce(
  nonce: string,
  digest: (value: string) => Promise<string>,
): Promise<string> {
  if (nonce === '') throw new Error('Nonce absent : le hachage est impossible.');
  const hashed = (await digest(nonce)).toLowerCase();
  if (!HEX.test(hashed)) throw new Error('Empreinte non hexadécimale : SHA-256 attendu.');
  return hashed;
}
