import { describe, expect, it } from 'vitest';

import { maskKey } from './crypto';

describe('[SPEC-505] masquage des clés', () => {
  it('CA-4 — préfixe alphabétique conservé et quatre derniers caractères visibles', () => {
    expect(maskKey('a91F', 'sk')).toBe('sk-••••••••a91F');
    expect(maskKey('a91F', 'sk-')).toBe('sk-••••••••a91F');
  });

  it('CA-4 — une clé sans préfixe n’affiche que les puces et les quatre derniers', () => {
    expect(maskKey('7Kq2', '')).toBe('••••••••7Kq2');
    expect(maskKey('7Kq2')).toBe('••••••••7Kq2');
  });

  it('ne montre jamais plus de quatre caractères de la clé', () => {
    const masked = maskKey('a91F', 'sk');
    expect(masked.replace(/[•-]/gu, '')).toBe('ska91F');
    expect(masked).not.toContain('sk-proj');
  });
});
