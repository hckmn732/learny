// Shared fixtures of the brick unit tests (CA-1 to CA-4).
import type { BrickType } from '../src/brick-types';
import type { BrickDraft } from '../src/common';
import { brickExamples } from '../src/examples';
import { CHUNK_A, NOTION_A, RESOURCE_A } from '../src/types/example-ids';
import type { BrickResourceInfo, BrickReferenceResolver } from '../src/validate';

export const FORMATION_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
export const OTHER_RESOURCE = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

export interface ResolverOptions {
  notions?: readonly string[];
  chunks?: Readonly<Record<string, string>>;
  resources?: Readonly<Record<string, Partial<BrickResourceInfo>>>;
  bricks?: readonly string[];
  calls?: { count: number };
}

/** In-memory resolver: every requested id exists unless an option restricts it. */
export function memoryResolver(options: ResolverOptions = {}): BrickReferenceResolver {
  const record = () => {
    if (options.calls !== undefined) options.calls.count += 1;
  };
  return {
    existingNotionIds: (_formationId, ids) => {
      record();
      const allowed = options.notions;
      return Promise.resolve(
        new Set(allowed === undefined ? ids : ids.filter((id) => allowed.includes(id))),
      );
    },
    chunks: (ids) => {
      record();
      const map = new Map<string, { resourceId: string }>();
      for (const id of ids) {
        const declared = options.chunks?.[id];
        if (declared !== undefined) {
          map.set(id, { resourceId: declared });
        } else if (options.chunks === undefined) {
          map.set(id, { resourceId: RESOURCE_A });
        }
      }
      return Promise.resolve(map);
    },
    resources: (ids) => {
      record();
      const map = new Map<string, BrickResourceInfo>();
      for (const id of ids) {
        const declared = options.resources?.[id];
        if (declared !== undefined) {
          map.set(id, {
            kind: declared.kind ?? 'pdf',
            pages: declared.pages === undefined ? 100 : declared.pages,
            durationSec: declared.durationSec === undefined ? null : declared.durationSec,
            deleted: declared.deleted ?? false,
          });
        } else if (options.resources === undefined) {
          map.set(id, { kind: 'pdf', pages: 100, durationSec: null, deleted: false });
        }
      }
      return Promise.resolve(map);
    },
    existingBrickIds: (_formationId, ids) => {
      record();
      const allowed = options.bricks;
      return Promise.resolve(
        new Set(allowed === undefined ? ids : ids.filter((id) => allowed.includes(id))),
      );
    },
  };
}

/** Draft of the reference example, with the origin and notions required by BR-BRI-04/03. */
export function draftFor(type: BrickType, overrides: Partial<BrickDraft> = {}): BrickDraft {
  const payload = (overrides.payload ?? brickExamples[type].valid) as unknown;
  return {
    type,
    formationId: FORMATION_ID,
    purpose: 'bank',
    notionIds: type === 'timer' || type === 'scoring' ? [] : [NOTION_A],
    origin: type === 'resource_excerpt' ? 'resource' : 'tutor',
    ...overrides,
    payload,
  };
}

/** Draft built from an arbitrary payload (normalization and schema tests). */
export function draftFromPayload(type: BrickType, payload: unknown): BrickDraft {
  return draftFor(type, { payload });
}

export { brickExamples, CHUNK_A, NOTION_A, RESOURCE_A };
