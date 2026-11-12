// Time zone helpers (SPEC-202 ET-1; SPEC-207 builds on them).

/**
 * True for a known IANA zone (`Europe/Paris`, `UTC`…). Matching is exact and case-sensitive, so a
 * stored zone is always the one the platform reports; legacy aliases the runtime still resolves
 * (`Asia/Calcutta`) are accepted too.
 */
export function isValidIanaZone(zone: string): boolean {
  if (zone === 'UTC') return true;
  if (Intl.supportedValuesOf('timeZone').includes(zone)) return true;
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: zone }).resolvedOptions().timeZone === zone;
  } catch {
    return false;
  }
}
