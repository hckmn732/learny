import { describe, expect, it } from 'vitest';

import type { BrickType } from '../src/brick-types';
import { brickExamples } from '../src/examples';
import type { BrickPayload } from '../src/payloads';
import { validateBrick } from '../src/validate';

import { draftFor, memoryResolver } from './helpers';
import { expectSchemaAccepts, expectSchemaRejects } from './schema';

export interface SchemaBound<T extends BrickType> {
  name: string;
  make: (base: BrickPayload<T>) => unknown;
}

/** CA-1 suite shared by the thirteen `types/<type>/schema.test.ts` files. */
export function runSchemaSuite<T extends BrickType>(
  type: T,
  bounds: readonly SchemaBound<T>[],
): void {
  const example = brickExamples[type];

  describe(`[SPEC-501] schéma ${type}`, () => {
    it('accepte l’exemple valide', () => {
      expectSchemaAccepts(type, example.valid);
    });

    it(`refuse l’exemple invalide avec ${example.invalidCode}`, async () => {
      const result = await validateBrick(
        draftFor(type, { payload: example.invalid as BrickPayload<T> }),
        memoryResolver(),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.map((issue) => issue.code)).toContain(example.invalidCode);
      }
    });

    for (const bound of bounds) {
      it(`refuse une valeur hors borne : ${bound.name}`, () => {
        expectSchemaRejects(type, bound.make(structuredClone(example.valid as BrickPayload<T>)));
      });
    }
  });
}
