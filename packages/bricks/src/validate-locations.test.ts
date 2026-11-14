import { describe, expect, it } from 'vitest';

import { draftFor, memoryResolver, RESOURCE_A } from '../test/helpers';

import { brickExamples } from './examples';
import type { BrickResourceInfo } from './validate';
import { parseBrickPayload, validateBrick } from './validate';

type Location = Record<string, number | string>;

async function locationIssues(resource: Partial<BrickResourceInfo>, location: Location) {
  const payload = { ...brickExamples.resource_excerpt.valid, location };
  const result = await validateBrick(
    draftFor('resource_excerpt', { payload }),
    memoryResolver({
      resources: { [RESOURCE_A]: resource },
    }),
  );
  return result.ok ? [] : result.error.map((issue) => [issue.code, issue.path]);
}

describe('[SPEC-501] emplacement d’un extrait selon la ressource (ET-6)', () => {
  it('ressource minutée : startSec obligatoire, dans la durée, endSec dans la durée', async () => {
    expect(
      await locationIssues({ kind: 'youtube', durationSec: 100 }, { charStart: 0, charEnd: 5 }),
    ).toEqual([['LOCATION_INVALID', 'payload.location.startSec']]);
    expect(await locationIssues({ kind: 'audio', durationSec: 100 }, { startSec: 150 })).toEqual([
      ['LOCATION_INVALID', 'payload.location.startSec'],
    ]);
    expect(
      await locationIssues({ kind: 'video', durationSec: 100 }, { startSec: 10, endSec: 150 }),
    ).toEqual([['LOCATION_INVALID', 'payload.location.endSec']]);
    expect(
      await locationIssues({ kind: 'video', durationSec: 100 }, { startSec: 10, endSec: 90 }),
    ).toEqual([]);
    expect(await locationIssues({ kind: 'video', durationSec: null }, { page: 1 })).toEqual([]);
  });

  it('page web : ancre ou charStart ; note et image : charStart', async () => {
    expect(await locationIssues({ kind: 'web' }, { page: 2 })).toEqual([
      ['LOCATION_INVALID', 'payload.location'],
    ]);
    expect(await locationIssues({ kind: 'web' }, { anchor: 'intro' })).toEqual([]);
    expect(await locationIssues({ kind: 'note' }, { page: 2 })).toEqual([
      ['LOCATION_INVALID', 'payload.location'],
    ]);
    expect(await locationIssues({ kind: 'image' }, { charStart: 0, charEnd: 4 })).toEqual([]);
  });

  it('pdf : la page reste dans la pagination connue', async () => {
    expect(await locationIssues({ kind: 'pdf', pages: 3 }, { page: 4 })).toEqual([
      ['LOCATION_INVALID', 'payload.location.page'],
    ]);
    expect(await locationIssues({ kind: 'exam_guide', pages: null }, { page: 400 })).toEqual([]);
  });
});

describe('[SPEC-501] parseBrickPayload', () => {
  it('refuse un type inconnu avec SCHEMA_INVALID sur type', () => {
    const result = parseBrickPayload('unknown' as never, {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error[0]).toMatchObject({ code: 'SCHEMA_INVALID', path: 'type' });
  });

  it('refuse un brouillon dont l’enveloppe est invalide', async () => {
    const result = await validateBrick({ type: 'text' }, memoryResolver());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.every((i) => i.code === 'SCHEMA_INVALID')).toBe(true);
  });
});
