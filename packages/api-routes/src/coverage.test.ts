import { describe, expect, it } from 'vitest';

import { ROUTES } from '@learny/contracts';

import { expectedRouteFiles, filePathOf, routeCoverage } from './coverage';
import { SPECIAL_HANDLERS } from './special';
import { SPECIAL_ROUTE_MANIFEST } from './special/manifest';
import { ROUTE_IMPLEMENTATIONS } from './tables';

const SPECIAL_COUNT = 32;

describe('[SPEC-1004] route coverage', () => {
  it('couvre chaque route du registre, sans doublon (CA-1)', () => {
    const coverage = routeCoverage();
    expect(coverage.registry).toBeGreaterThan(0);
    // Every registry key is implemented once: standard table or special table (CL-1).
    expect(coverage.uncovered).toEqual([]);
    expect(coverage.standard + coverage.specials).toBeGreaterThanOrEqual(coverage.registry);
    expect(coverage.duplicates).toBe(0);
    expect(coverage.specialDrift).toEqual([]);
    expect(coverage.drift).toBe(0);
  });

  it('ne met aucune route standard dans les gestionnaires spéciaux', () => {
    for (const key of Object.keys(ROUTE_IMPLEMENTATIONS)) {
      expect(Object.hasOwn(SPECIAL_HANDLERS, key), key).toBe(false);
    }
  });

  it('déclare exactement les gestionnaires spéciaux du manifeste (EF-2, CL-1)', () => {
    const declared = SPECIAL_ROUTE_MANIFEST.map((entry) => entry.key).sort();
    expect(Object.keys(SPECIAL_HANDLERS).sort()).toEqual(declared);
    expect(declared.length).toBe(SPECIAL_COUNT);
    for (const entry of SPECIAL_ROUTE_MANIFEST) {
      const handler = SPECIAL_HANDLERS[entry.key];
      expect(handler.method, entry.key).toBe(entry.method);
      expect(handler.path, entry.key).toBe(entry.path);
    }
  });

  it('décrit un fichier Next par chemin, avec ses méthodes (EF-3)', () => {
    const files = expectedRouteFiles();
    const paths = files.map((file) => file.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toContain('api/v1/home/route.ts');
    expect(files.find((file) => file.path === 'api/inngest/route.ts')?.methods).toEqual([
      'GET',
      'POST',
      'PUT',
    ]);
    expect(filePathOf('/api/v1/formations/:fid/sprints')).toBe(
      'api/v1/formations/[fid]/sprints/route.ts',
    );
    expect(filePathOf('/api/v1/_dev/demo-job')).toBe('api/v1/%5Fdev/demo-job/route.ts');
  });

  it('compte chaque route du registre comme implémentée ou spéciale (CA-1)', () => {
    const specialKeys = new Set(Object.keys(SPECIAL_HANDLERS));
    const standardKeys = new Set(Object.keys(ROUTE_IMPLEMENTATIONS));
    for (const key of Object.keys(ROUTES)) {
      expect(standardKeys.has(key) || specialKeys.has(key), key).toBe(true);
    }
  });

  it('mesure la dérive contre une arborescence incomplète (CA-2, CL-3)', () => {
    const files = expectedRouteFiles();
    const withoutHome = files.filter((file) => file.path !== 'api/v1/home/route.ts');
    const coverage = routeCoverage(withoutHome);
    expect(coverage.generated).toBe(files.length - 1);
    expect(coverage.drift).toBe(1);
  });
});
