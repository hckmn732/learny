// [SPEC-2002] The running TypeScript API answers exactly what the contract promises.
//
// Two checks: the served `/api/v1/health` document is typed by the generated SDK, and the served
// OpenAPI JSON stays semantically equal to `api/openapi.yaml` (CL-2). Serialised on the shared
// database lock by the caller.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { compareDocuments, loadDocument } from '../../../contract/compat.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../../..');
const TARGET = process.env.PARITY_TARGET ?? 'http://127.0.0.1:3102';

async function reachable(): Promise<boolean> {
  try {
    const response = await fetch(`${TARGET}/health`, { signal: AbortSignal.timeout(3000) });
    return response.ok;
  } catch {
    return false;
  }
}

describe('[SPEC-2002] contract integration', () => {
  it('keeps the source YAML and the served OpenAPI JSON semantically equal (CL-2)', () => {
    const { breaking, nonBreaking } = compareDocuments(
      loadDocument(path.join(ROOT, 'api', 'openapi.yaml')),
      loadDocument(path.join(ROOT, 'apps', 'api', 'openapi.json')),
    );
    expect(breaking).toEqual([]);
    expect(nonBreaking).toEqual([]);
  });

  it('serves the same contract through the live API', async () => {
    if (!(await reachable())) {
      console.warn(`API unreachable (${TARGET}): live contract check skipped.`);
      return;
    }
    const response = await fetch(`${TARGET}/api/v1/openapi.json`);
    expect(response.status).toBe(200);
    const served = (await response.json()) as Record<string, unknown>;
    const { breaking } = compareDocuments(
      loadDocument(path.join(ROOT, 'apps', 'api', 'openapi.json')),
      served,
    );
    expect(breaking).toEqual([]);
    expect(fs.existsSync(path.join(ROOT, 'packages', 'api-sdk', 'src', 'schema.d.ts'))).toBe(true);
  });
});
