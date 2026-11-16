// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { breakpointQuery, isBelowBreakpoint, useBreakpoint } from './use-breakpoint';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('[SPEC-802] useBreakpoint', () => {
  it('compare strictement les bornes 767/768, 899/900, 1023/1024, 1279/1280 et 1439/1440', () => {
    expect(isBelowBreakpoint(767, 'sm')).toBe(true);
    expect(isBelowBreakpoint(768, 'sm')).toBe(false);
    expect(isBelowBreakpoint(899, 'nav')).toBe(true);
    expect(isBelowBreakpoint(900, 'nav')).toBe(false);
    expect(isBelowBreakpoint(1023, 'lg')).toBe(true);
    expect(isBelowBreakpoint(1024, 'lg')).toBe(false);
    expect(isBelowBreakpoint(1279, 'xl')).toBe(true);
    expect(isBelowBreakpoint(1280, 'xl')).toBe(false);
    expect(isBelowBreakpoint(1439, '2xl')).toBe(true);
    expect(isBelowBreakpoint(1440, '2xl')).toBe(false);
  });

  it('exprime les requêtes en rem de 16 px', () => {
    expect(breakpointQuery('sm')).toBe('(width < 48rem)');
    expect(breakpointQuery('nav')).toBe('(width < 56.25rem)');
    expect(breakpointQuery('lg')).toBe('(width < 64rem)');
    expect(breakpointQuery('xl')).toBe('(width < 80rem)');
    expect(breakpointQuery('2xl')).toBe('(width < 90rem)');
  });

  it('suit matchMedia après hydratation, sans valeur mobile au premier rendu', () => {
    let matches = false;
    const listeners = new Set<() => void>();
    vi.stubGlobal('matchMedia', () => ({
      get matches() {
        return matches;
      },
      addEventListener: (_event: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener),
    }));
    const { result } = renderHook(() => useBreakpoint('sm'));
    expect(result.current).toBe(false);
    act(() => {
      matches = true;
      for (const listener of listeners) listener();
    });
    expect(result.current).toBe(true);
  });
});
