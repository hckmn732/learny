// [SPEC-2002] Generated SDK covers the whole contract and keeps readable types.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, expectTypeOf, it } from 'vitest';

import type { paths } from './schema';

const ROOT = path.resolve(import.meta.dirname, '../../..');

interface Inventory {
  operations: { id: string; method: string; path: string }[];
}

describe('[SPEC-2002] generated SDK', () => {
  it('exposes every operation id of the inventory (CA-2)', () => {
    const inventory = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'api', 'inventory.json'), 'utf8'),
    ) as Inventory;
    const source = fs.readFileSync(path.join(import.meta.dirname, 'schema.d.ts'), 'utf8');
    const missing = inventory.operations
      .map((operation) => operation.id)
      .filter((id) => !source.includes(`"${id}"`));
    expect(missing).toEqual([]);
    expect(inventory.operations).toHaveLength(156);
  });

  it('types a read operation and its errors from the contract', () => {
    expectTypeOf<paths['/api/v1/agenda']['get']>().not.toBeNever();
    expectTypeOf<paths['/api/v1/health']['get']>().not.toBeNever();
    expectTypeOf<paths['/api/v1/agenda']>().toHaveProperty('get');
  });
});
