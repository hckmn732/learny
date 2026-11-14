import { describe, expect, it } from 'vitest';

import { isSensitiveKey } from './redaction';

describe('[SPEC-010] isSensitiveKey', () => {
  it('reconnaît les fragments sensibles quelle que soit la casse', () => {
    for (const key of [
      'password',
      'Authorization',
      'apiKey',
      'userEmail',
      'Set-Cookie',
      'promptText',
    ]) {
      expect(isSensitiveKey(key), key).toBe(true);
    }
  });

  it('laisse passer les clés neutres', () => {
    for (const key of ['requestId', 'status', 'durationMs', 'route']) {
      expect(isSensitiveKey(key), key).toBe(false);
    }
  });
});
