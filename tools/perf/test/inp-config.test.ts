import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

describe('[SPEC-804] mesure INP isolée', () => {
  it('bloque le précache du service worker pendant le benchmark', () => {
    const config = fs.readFileSync(
      fileURLToPath(new URL('../../../apps/web/playwright.config.ts', import.meta.url)),
      'utf8',
    );
    expect(config).toContain("name: 'perf'");
    expect(config).toContain("serviceWorkers: 'block'");
  });

  it('ne réutilise pas un ancien rapport INP', () => {
    const run = fs.readFileSync(new URL('../run.mjs', import.meta.url), 'utf8');
    expect(run).toContain("fs.rmSync(path.join(OUT, 'inp.json'), { force: true })");
  });

  it('exige les six scénarios et leurs cinq passages', () => {
    const spec = fs.readFileSync(
      fileURLToPath(new URL('../../../apps/web/e2e/perf/inp.perf.ts', import.meta.url)),
      'utf8',
    );
    expect(spec).toContain('scenariosWithP75.length === scenarios.length');
    expect(spec).toContain('result.values.length === PASSES');
  });
});
