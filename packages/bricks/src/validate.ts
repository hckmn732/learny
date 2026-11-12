// Complete validation of a brick (SPEC-501 ET-5, BR-IA-11). Order is normative:
//   1. the draft envelope; 2. the type schema; 3. internal rules; 4. common rules; 5. references.
// Steps 3 to 5 only run when 1 and 2 succeed; every issue of a step is returned together, so the
// tutor loop can send one complete, readable correction to the model.
import { err, ok, type Result } from '@learny/core';

import type { BrickType } from './brick-types';
import type { BrickDraft } from './common';
import {
  brickDraftSchema,
  controlCharacterIssues,
  trimDeep,
  zodIssuesToBrickIssues,
} from './common';
import { brickFingerprint } from './fingerprint';
import { brickIssue, uniqueIssues, type BrickIssue } from './issues';
import type { BrickPayload } from './payloads';
import type { BrickRef, BrickRefs } from './references';
import { brickRegistry, type BrickDefinition } from './registry';
import type { ResourceExcerptPayload } from './types/resource-excerpt/schema';

/** Resource kinds of the resolver; kept local so `bricks` never imports the database package. */
export const BRICK_RESOURCE_KINDS = [
  'note',
  'pdf',
  'web',
  'youtube',
  'image',
  'audio',
  'video',
  'exam_guide',
] as const;

export type BrickResourceKind = (typeof BRICK_RESOURCE_KINDS)[number];

export interface BrickResourceInfo {
  kind: BrickResourceKind;
  pages: number | null;
  durationSec: number | null;
  deleted: boolean;
}

/** Reference reader limited to the current learner and formation (BR-BRI-05, ET-8). */
export interface BrickReferenceResolver {
  existingNotionIds(formationId: string, ids: string[]): Promise<Set<string>>;
  chunks(ids: string[]): Promise<Map<string, { resourceId: string }>>;
  resources(ids: string[]): Promise<Map<string, BrickResourceInfo>>;
  existingBrickIds(formationId: string, ids: string[]): Promise<Set<string>>;
}

/** A fully validated brick: normalized payload, defaults applied and fingerprint (or null). */
export interface ValidBrick {
  type: BrickType;
  formationId: string;
  purpose: BrickDraft['purpose'];
  notionIds: string[];
  origin: BrickDraft['origin'];
  payload: BrickPayload<BrickType>;
  fingerprint: string | null;
}

function parsePayload<T extends BrickType>(
  type: T,
  payload: unknown,
): Result<BrickPayload<T>, BrickIssue[]> {
  const definition = brickRegistry[type];
  const control = controlCharacterIssues(payload, 'payload');
  if (control.length > 0) return err(control);
  const parsed = definition.schema.safeParse(trimDeep(payload));
  if (!parsed.success) return err(zodIssuesToBrickIssues(parsed.error, 'payload'));
  return ok(parsed.data);
}

/**
 * Parses one payload with the schema of its type. No cross-check and no reference resolution:
 * intended for stored payloads whose references were validated when they were written.
 */
export function parseBrickPayload<T extends BrickType>(
  type: T,
  payload: unknown,
): Result<BrickPayload<T>, BrickIssue[]> {
  if (!Object.hasOwn(brickRegistry, type)) {
    return err([brickIssue('SCHEMA_INVALID', 'type', `Unknown brick type "${type}".`)]);
  }
  return parsePayload(type, payload);
}

function commonIssues(
  draft: BrickDraft,
  payload: BrickPayload<BrickType>,
  definition: BrickDefinition<BrickType>,
): BrickIssue[] {
  const issues: BrickIssue[] = [];
  if (definition.requiresNotion && draft.notionIds.length === 0) {
    issues.push(
      brickIssue(
        'NOTION_REQUIRED',
        'notionIds',
        'A pedagogical brick must be attached to at least one notion.',
      ),
    );
  }
  if (draft.type === 'resource_excerpt' && draft.origin !== 'resource') {
    issues.push(
      brickIssue('ORIGIN_INVALID', 'origin', 'A resource excerpt must have origin "resource".'),
    );
  }
  if ((draft.type === 'timer' || draft.type === 'scoring') && draft.origin !== 'tutor') {
    issues.push(
      brickIssue('ORIGIN_INVALID', 'origin', `A ${draft.type} brick must have origin "tutor".`),
    );
  }
  if (draft.origin === 'resource' && payload.sources.length === 0) {
    issues.push(
      brickIssue(
        'SOURCES_REQUIRED',
        'payload.sources',
        'A brick with origin "resource" must cite at least one source.',
      ),
    );
  }
  return issues;
}

function uniqueIds(refs: readonly BrickRef[]): string[] {
  return [...new Set(refs.map((ref) => ref.id))];
}

function resourceLocationIssues(
  payload: ResourceExcerptPayload,
  resource: BrickResourceInfo,
): BrickIssue[] {
  const location = payload.location;
  const invalid = (message: string, path = 'payload.location'): BrickIssue[] => [
    brickIssue('LOCATION_INVALID', path, message),
  ];

  switch (resource.kind) {
    case 'pdf':
    case 'exam_guide':
      if (
        location.page !== undefined &&
        resource.pages !== null &&
        location.page > resource.pages
      ) {
        return invalid(
          `Page ${String(location.page)} is beyond the ${String(resource.pages)} pages of the resource.`,
          'payload.location.page',
        );
      }
      return [];
    case 'youtube':
    case 'audio':
    case 'video': {
      if (resource.durationSec === null) return [];
      if (location.startSec === undefined) {
        return invalid('A timed resource excerpt requires startSec.', 'payload.location.startSec');
      }
      if (location.startSec > resource.durationSec) {
        return invalid(
          `startSec ${String(location.startSec)} is beyond the resource duration.`,
          'payload.location.startSec',
        );
      }
      if (location.endSec !== undefined && location.endSec > resource.durationSec) {
        return invalid(
          `endSec ${String(location.endSec)} is beyond the resource duration.`,
          'payload.location.endSec',
        );
      }
      return [];
    }
    case 'web':
      if (location.anchor === undefined && location.charStart === undefined) {
        return invalid('A web resource excerpt requires anchor or charStart.');
      }
      return [];
    case 'note':
    case 'image':
      if (location.charStart === undefined) {
        return invalid(`A ${resource.kind} resource excerpt requires charStart.`);
      }
      return [];
  }
}

async function referenceIssues(
  draft: BrickDraft,
  payload: BrickPayload<BrickType>,
  definition: BrickDefinition<BrickType>,
  resolver: BrickReferenceResolver,
): Promise<BrickIssue[]> {
  const issues: BrickIssue[] = [];
  const refs: BrickRefs = definition.references(payload);
  const notionRefs: BrickRef[] = [
    ...draft.notionIds.map((id, index) => ({ id, path: `notionIds.${String(index)}` })),
    ...refs.notions,
  ];

  const notionIds = uniqueIds(notionRefs);
  if (notionIds.length > 0) {
    const existing = await resolver.existingNotionIds(draft.formationId, notionIds);
    for (const ref of notionRefs) {
      if (!existing.has(ref.id)) {
        issues.push(
          brickIssue('NOTION_NOT_FOUND', ref.path, `Unknown notion "${ref.id}" in this formation.`),
        );
      }
    }
  }

  const chunkRefs = refs.chunks;
  const chunkIds = uniqueIds(chunkRefs);
  const chunks =
    chunkIds.length > 0
      ? await resolver.chunks(chunkIds)
      : new Map<string, { resourceId: string }>();
  for (const ref of chunkRefs) {
    if (!chunks.has(ref.id)) {
      issues.push(
        brickIssue('SOURCE_NOT_FOUND', ref.path, `Unknown or inaccessible passage "${ref.id}".`),
      );
    }
  }

  const resourceRefs: BrickRef[] = [...refs.resources];
  const resourcePaths = new Set(resourceRefs.map((ref) => `${ref.id}\u0000${ref.path}`));
  for (const ref of chunkRefs) {
    const chunk = chunks.get(ref.id);
    if (chunk === undefined) continue;
    const key = `${chunk.resourceId}\u0000${ref.path}`;
    if (resourcePaths.has(key)) continue;
    resourcePaths.add(key);
    resourceRefs.push({ id: chunk.resourceId, path: ref.path });
  }
  const resourceIds = uniqueIds(resourceRefs);
  const resources =
    resourceIds.length > 0
      ? await resolver.resources(resourceIds)
      : new Map<string, BrickResourceInfo>();
  for (const ref of resourceRefs) {
    const resource = resources.get(ref.id);
    if (resource === undefined || resource.deleted) {
      issues.push(
        brickIssue(
          'RESOURCE_NOT_FOUND',
          ref.path,
          `Unknown, deleted or inaccessible resource "${ref.id}".`,
        ),
      );
    }
  }

  if (draft.type === 'resource_excerpt') {
    const excerpt = payload as ResourceExcerptPayload;
    if (excerpt.chunkId !== null) {
      const chunk = chunks.get(excerpt.chunkId);
      if (chunk !== undefined && chunk.resourceId !== excerpt.resourceId) {
        issues.push(
          brickIssue(
            'CHUNK_RESOURCE_MISMATCH',
            'payload.chunkId',
            `Passage "${excerpt.chunkId}" does not belong to resource "${excerpt.resourceId}".`,
          ),
        );
      }
    }
    const resource = resources.get(excerpt.resourceId);
    if (resource !== undefined && !resource.deleted) {
      issues.push(...resourceLocationIssues(excerpt, resource));
    }
  }

  const brickRefs = refs.bricks;
  const brickIds = uniqueIds(brickRefs);
  if (brickIds.length > 0) {
    const existing = await resolver.existingBrickIds(draft.formationId, brickIds);
    for (const ref of brickRefs) {
      if (!existing.has(ref.id)) {
        issues.push(
          brickIssue(
            'BRICK_REF_NOT_FOUND',
            ref.path,
            `Unknown brick "${ref.id}" in this formation.`,
          ),
        );
      }
    }
  }

  return issues;
}

/** Validates a draft and returns the normalized brick or the complete list of issues. */
export async function validateBrick(
  draft: unknown,
  resolver: BrickReferenceResolver,
): Promise<Result<ValidBrick, BrickIssue[]>> {
  const control = controlCharacterIssues(draft);
  if (control.length > 0) return err(control);

  const parsedDraft = brickDraftSchema.safeParse(trimDeep(draft));
  if (!parsedDraft.success) {
    return err(zodIssuesToBrickIssues(parsedDraft.error, ''));
  }
  const data = parsedDraft.data;
  const parsedPayload = parsePayload(data.type, data.payload);
  if (!parsedPayload.ok) return err(parsedPayload.error);

  const definition = brickRegistry[data.type] as BrickDefinition<BrickType>;
  const payload = parsedPayload.value;
  const issues = uniqueIssues([
    ...definition.crossCheck(payload),
    ...commonIssues(data, payload, definition),
    ...(await referenceIssues(data, payload, definition, resolver)),
  ]);
  if (issues.length > 0) return err(issues);

  return ok({
    type: data.type,
    formationId: data.formationId,
    purpose: data.purpose,
    notionIds: [...data.notionIds],
    origin: data.origin,
    payload,
    fingerprint: brickFingerprint(data.type, payload),
  });
}
