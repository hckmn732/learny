export function sddPagesEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.ENABLE_SDD_PAGES === 'true' && env.APP_ENV !== 'production';
}

export const SDD_SPEC_ID_PATTERN = /^SPEC-\d{3,4}$/;

export function findSddDemo<T>(
  specId: string,
  registry: Readonly<Record<string, T>>,
): T | undefined {
  if (!SDD_SPEC_ID_PATTERN.test(specId) || !Object.hasOwn(registry, specId)) return undefined;
  return registry[specId];
}
