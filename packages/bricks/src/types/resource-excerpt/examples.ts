// Reference examples of the `resource_excerpt` type.
import type { BrickExample } from '../../payloads';
import { CHUNK_A, RESOURCE_A } from '../example-ids';

import type { ResourceExcerptPayload } from './schema';

export const resourceExcerptExample: BrickExample<'resource_excerpt'> = {
  valid: {
    resourceId: RESOURCE_A,
    chunkId: CHUNK_A,
    location: { page: 4, charStart: 120, charEnd: 260 },
    quote: 'Le compte de résultat présente les produits et les charges de l’exercice.',
    label: 'Guide FI, p. 4',
    sources: [{ chunkId: CHUNK_A, quote: 'produits et charges de l’exercice' }],
  },
  invalid: {
    resourceId: RESOURCE_A,
    chunkId: CHUNK_A,
    location: { startSec: 42, endSec: 12 },
    quote: 'Un extrait dont la fin précède le début.',
    label: 'Guide FI, p. 4',
    sources: [],
  },
  invalidCode: 'SCHEMA_INVALID',
};

export type ResourceExcerptExamplePayload = ResourceExcerptPayload;
