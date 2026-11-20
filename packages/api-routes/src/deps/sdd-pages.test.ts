import { describe, expect, it } from 'vitest';

import { sddPagesEnabled } from './sdd-pages';

describe('[SPEC-001] sddPagesEnabled', () => {
  it.each([undefined, '', 'false', '1', 'TRUE'])('is disabled for ENABLE_SDD_PAGES=%s', (value) => {
    expect(sddPagesEnabled({ ENABLE_SDD_PAGES: value })).toBe(false);
  });

  it('is enabled for ENABLE_SDD_PAGES=true outside production', () => {
    expect(sddPagesEnabled({ ENABLE_SDD_PAGES: 'true' })).toBe(true);
    expect(sddPagesEnabled({ ENABLE_SDD_PAGES: 'true', APP_ENV: 'test' })).toBe(true);
  });

  it('is disabled in production', () => {
    expect(sddPagesEnabled({ ENABLE_SDD_PAGES: 'true', APP_ENV: 'production' })).toBe(false);
  });
});
