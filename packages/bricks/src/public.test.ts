import { describe, expect, it } from 'vitest';

import { draftFor, memoryResolver } from '../test/helpers';

import { BRICK_TYPES } from './brick-types';
import { brickExamples } from './examples';
import { BRICK_PUBLIC_REQUIRED_ABSENT_FIELDS, toPublicBrick } from './public-brick';
import { validateBrick } from './validate';

const VERSION_ID = '99999999-9999-4999-8999-999999999999';
const FORBIDDEN = new Set<string>(BRICK_PUBLIC_REQUIRED_ABSENT_FIELDS);

function keysOf(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) keysOf(item, found);
    return found;
  }
  if (typeof value === 'object' && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      found.push(key);
      keysOf(item, found);
    }
  }
  return found;
}

function publicOf(type: (typeof BRICK_TYPES)[number]) {
  const payload = brickExamples[type].valid;
  return toPublicBrick({
    brickId: '88888888-8888-4888-8888-888888888888',
    versionId: VERSION_ID,
    type,
    notionIds: ['11111111-1111-4111-8111-111111111111'],
    payload,
  });
}

describe('[SPEC-501] charge publique', () => {
  it('ne contient aucun champ secret pour les treize exemples (CA-4)', () => {
    for (const type of BRICK_TYPES) {
      const keys = new Set(keysOf(publicOf(type).publicPayload));
      for (const forbidden of FORBIDDEN) {
        expect(keys.has(forbidden), `${type} expose ${forbidden}`).toBe(false);
      }
    }
  });

  it('est déterministe pour la même graine', () => {
    for (const type of ['matching', 'ordering', 'categorization'] as const) {
      const first = publicOf(type).publicPayload;
      const second = publicOf(type).publicPayload;
      expect(second).toEqual(first);
    }
  });

  it('mélange les droits d’association avec des identifiants opaques r1..rn', () => {
    const publicPayload = publicOf('matching').publicPayload as {
      rights: { id: string; text: string }[];
    };
    expect(publicPayload.rights.map((right) => right.id)).toEqual(
      publicPayload.rights.map((_, index) => `r${String(index + 1)}`),
    );
  });

  it('ne présente jamais une remise en ordre déjà correcte', () => {
    const valid = brickExamples.ordering.valid;
    const expected = valid.items.map((item) => item.id);
    for (let index = 0; index < 50; index += 1) {
      const versionId = `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
      const publicPayload = toPublicBrick({
        brickId: '88888888-8888-4888-8888-888888888888',
        versionId,
        type: 'ordering',
        notionIds: [],
        payload: valid,
      }).publicPayload as { items: { id: string }[] };
      expect(publicPayload.items.map((item) => item.id)).not.toEqual(expected);
    }
  });

  it('projette une consigne sans description de critère ni indices', () => {
    const publicPayload = publicOf('instruction').publicPayload as {
      hintsCount: number;
      criteria: Record<string, unknown>[];
    };
    expect(publicPayload.hintsCount).toBe(1);
    expect(publicPayload.criteria.every((criterion) => criterion.description === undefined)).toBe(
      true,
    );
  });

  it('valide les treize exemples avant projection', async () => {
    for (const type of BRICK_TYPES) {
      const result = await validateBrick(draftFor(type), memoryResolver());
      expect(result.ok, type).toBe(true);
    }
  });
});
