// Public projection of a stored brick version (EF-6, ADR-0150 §3). It is the only shape sent to the
// browser before correction: no correct option, answer list, expected element, model answer,
// category link or hint. The seed is the version id, so the same version always shuffles the same
// way and the server can recompute the opaque-id mapping.
import type { BrickType } from './brick-types';
import type { AnyPublicPayload, BrickPayload } from './payloads';
import { brickRegistry, type BrickDefinition } from './registry';

export interface PublicBrickInput<T extends BrickType = BrickType> {
  brickId: string;
  versionId: string;
  type: T;
  notionIds: string[];
  payload: BrickPayload<T>;
}

export interface BrickPublic {
  brickId: string;
  versionId: string;
  type: BrickType;
  notionIds: string[];
  publicPayload: AnyPublicPayload;
}

/** Fields that must never appear in a public payload (CA-4), at any depth. */
export const BRICK_PUBLIC_REQUIRED_ABSENT_FIELDS = [
  'correct',
  'answers',
  'expectedElements',
  'modelAnswer',
  'categoryId',
  'hints',
] as const;

export function toPublicBrick<T extends BrickType>(input: PublicBrickInput<T>): BrickPublic {
  const definition = brickRegistry[input.type] as BrickDefinition<T>;
  return {
    brickId: input.brickId,
    versionId: input.versionId,
    type: input.type,
    notionIds: [...input.notionIds],
    publicPayload: definition.toPublic(input.payload, input.versionId),
  };
}
