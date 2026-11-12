import { describe, expect, it } from 'vitest';

import { isValidIanaZone } from './time';

describe('[SPEC-202] fuseaux IANA', () => {
  it.each(['Europe/Paris', 'UTC', 'America/New_York', 'Asia/Tokyo', 'Asia/Calcutta'])(
    'accepts %s',
    (zone) => {
      expect(isValidIanaZone(zone)).toBe(true);
    },
  );

  it.each(['', 'Mars/Phobos', 'europe/paris', 'Paris', 'UTC+2', '../etc/passwd', 'x'.repeat(70)])(
    'refuses %j',
    (zone) => {
      expect(isValidIanaZone(zone)).toBe(false);
    },
  );
});
