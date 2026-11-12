// Public contract of `@learny/bricks` (SPEC-501 ET-1): the thirteen types, their normative schemas,
// the validation/oracle, the fingerprint and the public payloads. No I/O, no clock, no database.
export { BRICK_ORIGINS, BRICK_PURPOSES, BRICK_TYPES } from './brick-types';
export type { BrickOrigin, BrickPurpose, BrickType } from './brick-types';
export {
  brickDraftSchema,
  controlCharacterIssues,
  criterionKey,
  columnKey,
  integer,
  itemId,
  optionalText,
  sourceRefSchema,
  sourcesSchema,
  text,
  trimDeep,
  uuid,
  zodIssuesToBrickIssues,
} from './common';
export type { BrickDraft } from './common';
export { brickExamples } from './examples';
export { brickFingerprint, canonicalAnswer, stemText } from './fingerprint';
export { BRICK_ISSUE_CODES, brickIssue, uniqueIssues } from './issues';
export type { BrickIssue, BrickIssueCode } from './issues';
export { normalizeText, comparisonKey } from './normalize';
export type {
  AnyBrickPayload,
  AnyPublicPayload,
  BrickExample,
  BrickPayload,
  BrickPayloadMap,
  PublicPayload,
  PublicPayloadMap,
} from './payloads';
export { createSeededRandom, hash32, mulberry32, shuffleSeeded } from './random';
export { emptyRefs, withSources } from './references';
export type { BrickRef, BrickRefs } from './references';
export { brickRegistry } from './registry';
export type { BrickDefinition } from './registry';
export { sha256Hex } from './sha256';
export { BRICK_RESOURCE_KINDS, parseBrickPayload, validateBrick } from './validate';
export type {
  BrickReferenceResolver,
  BrickResourceInfo,
  BrickResourceKind,
  ValidBrick,
} from './validate';
export type { BrickPublic, PublicBrickInput } from './public-brick';
export { BRICK_PUBLIC_REQUIRED_ABSENT_FIELDS, toPublicBrick } from './public-brick';
