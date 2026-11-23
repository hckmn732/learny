// Fixtures of the brick component tests (SPEC-3301).
import type { BrickPublic, BrickType } from '@learny/bricks';

import { showcaseFor } from '../../src/bricks/showcase';

/** The public charge of the reference example of `type`, projected like the server does. */
export function brickOf(type: BrickType): BrickPublic {
  return showcaseFor(type).brick;
}

/** A charge that no mirror accepts (CL-2, BR-BRI-02). */
export function invalidBrick(type: BrickType): BrickPublic {
  return {
    brickId: 'invalid',
    versionId: 'invalid',
    type,
    notionIds: [],
    publicPayload: { broken: true },
  } as unknown as BrickPublic;
}
