import { describe, expect, it } from 'vitest';

import {
  WCAG22_APPLICABLE_COUNT,
  WCAG22_CRITERIA,
  WCAG22_CRITERIA_COUNT,
  WCAG22_NOT_APPLICABLE,
  wcagCriterion,
} from './wcag22';

describe('[SPEC-803] catalogue WCAG 2.2 A/AA', () => {
  it('liste les 55 critères A et AA, dont les ajouts de WCAG 2.2', () => {
    expect(WCAG22_CRITERIA_COUNT).toBe(55);
    expect(new Set(WCAG22_CRITERIA.map((criterion) => criterion.id)).size).toBe(55);
    for (const id of ['2.4.11', '2.5.7', '2.5.8', '3.2.6', '3.3.7', '3.3.8']) {
      expect(wcagCriterion(id), id).toBeDefined();
    }
  });

  it('retire 4.1.1, obsolète dans WCAG 2.2', () => {
    expect(wcagCriterion('4.1.1')).toBeUndefined();
  });

  it('marque six critères non applicables et 49 applicables', () => {
    expect(WCAG22_APPLICABLE_COUNT).toBe(49);
    expect(WCAG22_NOT_APPLICABLE.map((criterion) => criterion.id)).toEqual([
      '1.2.1',
      '1.2.2',
      '1.2.3',
      '1.2.4',
      '1.2.5',
      '1.4.2',
    ]);
    expect(WCAG22_NOT_APPLICABLE.every((criterion) => criterion.reason !== undefined)).toBe(true);
  });

  it('porte un niveau A ou AA et un titre pour chaque critère', () => {
    for (const criterion of WCAG22_CRITERIA) {
      expect(['A', 'AA']).toContain(criterion.level);
      expect(criterion.title.length).toBeGreaterThan(0);
    }
  });
});
