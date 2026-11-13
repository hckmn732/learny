const CODE = /LRN-[A-Z2-9]{4}/i;

/** EF-12 — extracts the invitation code from a bare code or any link, never from a mistyped one. */
export function parseInviteCode(value: string): string | null {
  const match = CODE.exec(value.trim());
  return match === null ? null : match[0].toUpperCase();
}
