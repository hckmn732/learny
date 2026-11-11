// Demo pages are enabled at runtime only, never at build time (ADR-0102).
export function sddPagesEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.ENABLE_SDD_PAGES === 'true' && env.APP_ENV !== 'production';
}

// Demo identifiers have one shape only; anything else is rejected before any lookup (SPEC-006, CL-5).
export const SDD_SPEC_ID_PATTERN = /^SPEC-\d{3}$/;

/** Registered demo for a validated identifier, or `undefined` (unknown or malformed → 404). */
export function findSddDemo<T>(
  specId: string,
  registry: Readonly<Record<string, T>>,
): T | undefined {
  if (!SDD_SPEC_ID_PATTERN.test(specId) || !Object.hasOwn(registry, specId)) return undefined;
  return registry[specId];
}
