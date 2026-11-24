// Vitest [SPEC-3301] — the public charges and the brick registry of the device (CA-1, CA-2, CA-3).
//
// ADR-2041 retired the demonstration operations `dev.sdd.*`, including the SPEC-501 brick route
// this file used to call, and asks for the tests that only exercised those routes to go with them:
// the three integration cases that created a server brick through `/dev/sdd/SPEC-501/create` are
// therefore removed here. The server-side public projection is covered by the Python suite of the
// content context; what the device owns — the registry, the thirteen types and the pure grading the
// server runs too — stays covered below.
import { describe, expect, it } from 'vitest';

import type { AutoGradedType, BrickPayload, BrickType } from '@learny/bricks';
import { AUTO_GRADED_TYPES, BRICK_TYPES, gradeBrick } from '@learny/bricks';

import { WEB_ONLY_BRICK_TYPES } from '../../src/bricks/registry';
import { correctResponseFor } from '../../src/bricks/showcase';

describe('[SPEC-3301] registre et schémas des charges publiques', () => {
  it('[SPEC-3301] le registre et les schémas couvrent les treize types (CA-1, ET-1)', () => {
    expect(BRICK_TYPES).toHaveLength(13);
    for (const type of AUTO_GRADED_TYPES) {
      expect(WEB_ONLY_BRICK_TYPES).not.toContain(type);
    }
    // A response built by the device is graded by the same pure code the server runs (CA-2).
    expect(typeof correctResponseFor).toBe('function');
    expect(typeof gradeBrick).toBe('function');
    const typed: BrickType = 'text';
    expect(typed).toBe('text');
    const auto: AutoGradedType = 'cloze';
    expect(typeof auto).toBe('string');
    const payload = {} as BrickPayload<AutoGradedType>;
    expect(payload).toBeTypeOf('object');
  });
});
