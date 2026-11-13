import { describe, expect, it } from 'vitest';

import { parseInviteCode } from './parseInviteCode';

describe('[SPEC-602] code d’invitation', () => {
  it('met le code seul en majuscules', () => {
    expect(parseInviteCode('lrn-ab2c')).toBe('LRN-AB2C');
  });

  it('extrait le code d’un lien complet', () => {
    expect(parseInviteCode('https://learny.app/invitation/LRN-AB2C')).toBe('LRN-AB2C');
  });

  it('refuse un code qui contient 1 ou 0 (alphabet sans ambiguïté)', () => {
    expect(parseInviteCode('LRN-AB1C')).toBeNull();
    expect(parseInviteCode('LRN-AB0C')).toBeNull();
  });

  it('refuse un texte sans code', () => {
    expect(parseInviteCode('bonjour')).toBeNull();
  });
});
