import { describe, expect, it } from 'vitest';

import { computeTargetSize, isTouchExempt } from './touch-targets';

describe('[SPEC-802] cibles tactiles', () => {
  it('détecte une cible de 32 px et accepte 44 px', () => {
    expect(computeTargetSize({ width: 32, height: 32 }, null)).toEqual({ width: 32, height: 32 });
    expect(computeTargetSize({ width: 44, height: 44 }, null)).toEqual({ width: 44, height: 44 });
  });

  it('prend en compte un pseudo-élément positionné de 44 px', () => {
    expect(
      computeTargetSize(
        { width: 28, height: 28 },
        { content: '""', position: 'absolute', width: '44px', height: '44px' },
      ),
    ).toEqual({ width: 44, height: 44 });
  });

  it('ignore un pseudo-élément non positionné ou sans contenu', () => {
    expect(
      computeTargetSize(
        { width: 28, height: 28 },
        { content: 'none', position: 'absolute', width: '44px', height: '44px' },
      ),
    ).toEqual({ width: 28, height: 28 });
    expect(
      computeTargetSize(
        { width: 28, height: 28 },
        { content: '""', position: 'static', width: '44px', height: '44px' },
      ),
    ).toEqual({ width: 28, height: 28 });
  });

  it('reconnaît uniquement les exemptions renseignées', () => {
    expect(isTouchExempt('inline')).toBe(true);
    expect(isTouchExempt('graph-node')).toBe(true);
    expect(isTouchExempt(null)).toBe(false);
    expect(isTouchExempt('')).toBe(false);
  });
});
