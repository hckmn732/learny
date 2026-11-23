export function sddPagesEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.ENABLE_SDD_PAGES === 'true' && env.APP_ENV !== 'production';
}
