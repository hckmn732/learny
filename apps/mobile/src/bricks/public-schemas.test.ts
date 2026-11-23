// Vitest [SPEC-3301] — the public mirrors accept exactly what `@learny/bricks` projects (BR-BRI-02).
//
// The mirrors live in the application because `@learny/bricks` exports the projection and its
// types, not a zod schema for the public shape. This test is the contract between the two: every
// example projected by `toPublicBrick` parses, and a charge whose shape is broken is refused.
import { describe, expect, it } from 'vitest';

import type { BrickType } from '@learny/bricks';
import { brickExamples, toPublicBrick } from '@learny/bricks';

import { PUBLIC_PAYLOAD_SCHEMAS, parsePublicPayload } from './public-schemas';
import { NATIVE_BRICK_TYPES, WEB_ONLY_BRICK_TYPES } from './registry';

const SEED = '00000000-0000-4000-8000-000000003301';

function projected(type: BrickType): unknown {
  return toPublicBrick({
    brickId: `test-${type}`,
    versionId: SEED,
    type,
    notionIds: [],
    payload: brickExamples[type].valid,
  }).publicPayload;
}

describe('[SPEC-3301] miroirs des charges publiques', () => {
  it('[SPEC-3301] une charge publique par type natif, aucune pour les renvois au web (ET-1)', () => {
    expect(Object.keys(PUBLIC_PAYLOAD_SCHEMAS).sort()).toEqual([...NATIVE_BRICK_TYPES].sort());
    for (const type of WEB_ONLY_BRICK_TYPES) {
      expect(Object.keys(PUBLIC_PAYLOAD_SCHEMAS)).not.toContain(type);
    }
  });

  it('[SPEC-3301] chaque exemple projeté par le serveur est accepté (CA-1, BR-BRI-02)', () => {
    for (const type of NATIVE_BRICK_TYPES) {
      const parsed = parsePublicPayload(type, projected(type));
      expect(parsed.ok, type).toBe(true);
    }
  });

  it('[SPEC-3301] une charge invalide est refusée sans contenu (CL-2)', () => {
    expect(parsePublicPayload('choice_question', { stem: 'x' }).ok).toBe(false);
    expect(parsePublicPayload('cloze', { template: 'a {{1}} b', gaps: [] }).ok).toBe(false);
    expect(parsePublicPayload('matching', { instruction: 'i', lefts: [], rights: [] }).ok).toBe(
      false,
    );
    expect(parsePublicPayload('text', { title: 1, bodyMd: 'x' }).ok).toBe(false);
    expect(parsePublicPayload('recall_card', { front: 'f' }).ok).toBe(false);
  });

  it('[SPEC-3301] aucune bonne réponse dans une charge publique refusée ou acceptée (CA-3)', () => {
    const projectedChoice = projected('choice_question');
    const parsed = parsePublicPayload('choice_question', projectedChoice);
    expect(JSON.stringify(projectedChoice)).not.toContain('correct');
    expect(parsed.ok).toBe(true);
  });
});
