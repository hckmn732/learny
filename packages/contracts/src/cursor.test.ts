import { describe, expect, it } from 'vitest';

import { PaginationQuery } from './common';
import { decodeCursor, encodeCursor } from './cursor';

describe('[SPEC-201] curseur', () => {
  it('round-trips a numeric and a string key, including accents', () => {
    for (const value of [
      { k: 42, id: 'item-42' },
      { k: '2026-11-11T12:20:00Z', id: 'é-ü-日本' },
    ]) {
      const cursor = encodeCursor(value);
      expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(decodeCursor(cursor)).toEqual(value);
    }
  });

  it('returns null for a forged or unreadable cursor, never throws', () => {
    const noId = btoa(JSON.stringify({ k: 1 })).replaceAll('=', '');
    const notJson = btoa('pas du json').replaceAll('=', '');
    for (const bad of ['', '%%%', '***', noId, notJson, 'a'.repeat(5000), btoa('[]')]) {
      expect(decodeCursor(bad)).toBeNull();
    }
  });

  it('parses the pagination query with default 20 and bounds 1..100', () => {
    expect(PaginationQuery.parse({})).toEqual({ limit: 20 });
    expect(PaginationQuery.parse({ limit: '100', cursor: 'abc' })).toEqual({
      limit: 100,
      cursor: 'abc',
    });
    for (const limit of ['0', '101', '1.5', 'abc']) {
      expect(PaginationQuery.safeParse({ limit }).success, limit).toBe(false);
    }
  });
});
