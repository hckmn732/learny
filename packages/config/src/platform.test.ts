import { describe, expect, it } from 'vitest';

import { HOSTING_REGIONS, isEuRegion } from './platform';

describe('[SPEC-001] platform regions', () => {
  it.each(Object.entries(HOSTING_REGIONS))('%s region %s is in the EU', (_service, region) => {
    expect(isEuRegion(region)).toBe(true);
  });

  it('rejects non-EU regions', () => {
    expect(isEuRegion('iad1')).toBe(false);
    expect(isEuRegion('us-east-1')).toBe(false);
  });
});
