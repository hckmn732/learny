// Demo pages are enabled at runtime only, never at build time (ADR-0102).
export function sddPagesEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.ENABLE_SDD_PAGES === 'true' && env.APP_ENV !== 'production';
}
