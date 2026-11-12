import { z } from 'zod';

// Opaque pagination cursor: base64url(JSON `{ k, id }`) (SPEC-201 ET-5, ADR-0120). Repositories
// sort by `(k desc, id desc)` and read `limit + 1` rows; the extra row gives `nextCursor`.
export interface CursorValue {
  k: string | number;
  id: string;
}

const CursorSchema = z.object({
  k: z.union([z.string(), z.number()]),
  id: z.string().min(1),
});

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const padded = value.replaceAll('-', '+').replaceAll('_', '/');
    const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export function encodeCursor(value: CursorValue): string {
  return toBase64Url(JSON.stringify({ k: value.k, id: value.id }));
}

/** Returns `null` for any unreadable or forged cursor; never throws (CL-9). */
export function decodeCursor(cursor: string): CursorValue | null {
  const text = fromBase64Url(cursor);
  if (text === null) return null;
  try {
    const parsed = CursorSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
