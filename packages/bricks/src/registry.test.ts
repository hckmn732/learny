import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { BRICK_TYPES } from './brick-types';
import { brickRegistry } from './registry';

function drizzleBrickTypes(): string[] {
  const source = readFileSync(
    new URL('../../db/src/schema/bricks-activities.ts', import.meta.url),
    'utf8',
  );
  const enumBody = /pgEnum\('brick_type', \[([\s\S]*?)\]\)/.exec(source)?.[1] ?? '';
  return [...enumBody.matchAll(/'([a-z_]+)'/g)].map((match) => match[1] as string);
}

describe('[SPEC-501] registre des briques', () => {
  it('liste exactement les treize types de l’énumération Drizzle (BR-BRI-01)', () => {
    expect(BRICK_TYPES).toHaveLength(13);
    expect(drizzleBrickTypes()).toEqual([...BRICK_TYPES]);
  });

  it('a une entrée par type, cohérente avec sa clé', () => {
    expect(Object.keys(brickRegistry)).toEqual([...BRICK_TYPES]);
    for (const type of BRICK_TYPES) {
      const definition = brickRegistry[type];
      expect(definition.type).toBe(type);
      expect(definition.schema).toBeDefined();
      expect(typeof definition.crossCheck).toBe('function');
      expect(typeof definition.references).toBe('function');
      expect(typeof definition.toPublic).toBe('function');
    }
  });

  it('applique la répartition gradedBy d’ET-1', () => {
    expect(BRICK_TYPES.filter((type) => brickRegistry[type].gradedBy === 'code')).toEqual([
      'choice_question',
      'cloze',
      'matching',
      'ordering',
      'categorization',
      'recall_card',
      'timer',
    ]);
    expect(BRICK_TYPES.filter((type) => brickRegistry[type].gradedBy === 'tutor')).toEqual([
      'open_question',
      'instruction',
      'scripted_dialogue',
    ]);
    expect(BRICK_TYPES.filter((type) => brickRegistry[type].gradedBy === 'none')).toEqual([
      'text',
      'resource_excerpt',
      'scoring',
    ]);
  });

  it('n’exige une notion que hors minuteur et barème (BR-BRI-03)', () => {
    expect(BRICK_TYPES.filter((type) => !brickRegistry[type].requiresNotion)).toEqual([
      'timer',
      'scoring',
    ]);
  });

  it('marque les sept types question et expose leur énoncé et leur réponse', () => {
    const questions = BRICK_TYPES.filter((type) => brickRegistry[type].isQuestion);
    expect(questions).toHaveLength(7);
    for (const type of questions) {
      expect(brickRegistry[type].canonicalAnswer).toBeTypeOf('function');
      expect(brickRegistry[type].stem).toBeTypeOf('function');
    }
  });
});
